"""Cost: itemised preflight before a long render, a ledger after, a cap that
pauses the queue."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import Settings, settings as default_settings
from .db import pause_queue
from .models import CostEntry, Project


@dataclass
class LineItem:
    label: str
    quantity: float
    unit: str
    unit_cost_usd: float
    cost_usd: float
    note: str = ""


@dataclass
class Estimate:
    total_usd: float
    items: list[LineItem] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    test_mode: bool = True
    requires_confirmation: bool = False
    over_monthly_cap: bool = False
    month_to_date_usd: float = 0.0
    monthly_cap_usd: float = 0.0

    def as_dict(self) -> dict[str, Any]:
        return {
            "total_usd": round(self.total_usd, 2),
            "items": [asdict(i) for i in self.items],
            "notes": self.notes,
            "test_mode": self.test_mode,
            "requires_confirmation": self.requires_confirmation,
            "over_monthly_cap": self.over_monthly_cap,
            "month_to_date_usd": round(self.month_to_date_usd, 2),
            "monthly_cap_usd": self.monthly_cap_usd,
        }


def _narration_characters(plan: dict[str, Any]) -> int:
    total = 0
    for chapter in plan.get("chapters", []):
        for beat in chapter.get("beats", []):
            total += len(beat.get("narration") or "")
    return total


def month_to_date_usd(db: Session, when: datetime | None = None) -> float:
    when = when or datetime.now(timezone.utc)
    start = datetime(when.year, when.month, 1, tzinfo=timezone.utc)
    total = db.execute(
        select(func.coalesce(func.sum(CostEntry.amount_usd), 0.0)).where(CostEntry.created_at >= start)
    ).scalar_one()
    return float(total or 0.0)


def estimate_plan(
    plan: dict[str, Any],
    *,
    db: Session | None = None,
    settings: Settings | None = None,
    test_mode: bool | None = None,
) -> Estimate:
    s = settings or default_settings
    is_test = s.heygen_test if test_mode is None else test_mode
    segments = plan.get("counts", {}).get("segments") or len(plan.get("segments", []))
    minutes = (plan.get("planned_seconds") or 0.0) / 60.0
    characters = _narration_characters(plan)
    storage_gb = (minutes * s.estimated_mb_per_minute) / 1024.0

    items: list[LineItem] = []
    notes: list[str] = []

    render_cost = 0.0 if is_test else round(minutes * s.cost_per_render_minute_usd, 2)
    items.append(
        LineItem(
            label="Renderer credits",
            quantity=round(minutes, 2),
            unit="video minutes",
            unit_cost_usd=s.cost_per_render_minute_usd,
            cost_usd=render_cost,
            note="HEYGEN_TEST=true: watermarked renders, no credits consumed" if is_test else "",
        )
    )
    seg_cost = 0.0 if is_test else round(segments * s.cost_per_segment_usd, 2)
    items.append(
        LineItem(
            label="Segments",
            quantity=segments,
            unit="renders",
            unit_cost_usd=s.cost_per_segment_usd,
            cost_usd=seg_cost,
            note=f"one render per segment, capped at {s.heygen_max_segment_seconds:g}s each",
        )
    )
    tts_cost = (
        0.0
        if s.tts_provider != "elevenlabs"
        else round((characters / 1000.0) * s.cost_per_tts_1k_chars_usd, 2)
    )
    items.append(
        LineItem(
            label="TTS",
            quantity=characters,
            unit="characters",
            unit_cost_usd=s.cost_per_tts_1k_chars_usd,
            cost_usd=tts_cost,
            note="synthesised per beat" if s.tts_provider == "elevenlabs" else "spoken by the renderer",
        )
    )
    storage_cost = round(storage_gb * s.storage_cost_per_gb_month_usd, 2)
    items.append(
        LineItem(
            label="Storage",
            quantity=round(storage_gb, 3),
            unit="GB-month",
            unit_cost_usd=s.storage_cost_per_gb_month_usd,
            cost_usd=storage_cost,
            note="accepted output plus payload history; superseded takes are pruned",
        )
    )

    total = round(sum(i.cost_usd for i in items), 2)
    if is_test:
        notes.append("Test mode: renders are watermarked and do not consume credits.")
    if plan.get("tier") == "long":
        notes.append(
            f"{segments} segments will be rendered separately and concatenated locally "
            f"with a {plan.get('crossfade_ms', s.crossfade_ms)}ms crossfade at every seam."
        )

    mtd = month_to_date_usd(db) if db is not None else 0.0
    over = (mtd + total) > s.monthly_cost_cap_usd
    if over:
        notes.append(
            f"REFUSED: ${mtd:.2f} spent this month plus ${total:.2f} estimated exceeds the "
            f"${s.monthly_cost_cap_usd:.2f} cap."
        )

    return Estimate(
        total_usd=total,
        items=items,
        notes=notes,
        test_mode=is_test,
        requires_confirmation=(plan.get("tier") == "long" and s.long_tier_requires_confirmation),
        over_monthly_cap=over,
        month_to_date_usd=mtd,
        monthly_cap_usd=s.monthly_cost_cap_usd,
    )


def record_cost(
    db: Session,
    *,
    kind: str,
    amount_usd: float,
    project_id: str | None = None,
    segment_id: str | None = None,
    job_id: str | None = None,
    detail: dict[str, Any] | None = None,
    settings: Settings | None = None,
) -> CostEntry:
    s = settings or default_settings
    entry = CostEntry(
        kind=kind,
        amount_usd=round(float(amount_usd), 4),
        project_id=project_id,
        segment_id=segment_id,
        job_id=job_id,
        detail=detail or {},
    )
    db.add(entry)
    if project_id:
        project = db.get(Project, project_id)
        if project:
            project.cost_actual = round((project.cost_actual or 0.0) + entry.amount_usd, 4)
    db.flush()

    if month_to_date_usd(db) >= s.monthly_cost_cap_usd:
        pause_queue(
            db,
            f"monthly cost cap of ${s.monthly_cost_cap_usd:.2f} reached",
        )
    return entry


def cost_summary(db: Session, settings: Settings | None = None) -> dict[str, Any]:
    s = settings or default_settings
    mtd = month_to_date_usd(db)
    by_kind = dict(
        db.execute(
            select(CostEntry.kind, func.coalesce(func.sum(CostEntry.amount_usd), 0.0)).group_by(
                CostEntry.kind
            )
        ).all()
    )
    return {
        "month_to_date_usd": round(mtd, 2),
        "monthly_cap_usd": s.monthly_cost_cap_usd,
        "remaining_usd": round(max(0.0, s.monthly_cost_cap_usd - mtd), 2),
        "by_kind": {k: round(float(v), 2) for k, v in by_kind.items()},
    }
