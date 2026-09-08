#!/usr/bin/env python3
"""Seed a throwaway database, serve the dashboard and drive it in a browser.

The unit and integration suites cover the server. This covers the part they
cannot: that the dashboard actually renders — four lanes for a short, chapters
and seams for a long build, real provider errors in the job list — and that it
does so without a single console error.

    pip install playwright && playwright install chromium
    python scripts/ui_smoke.py                # headless, writes screenshots
    python scripts/ui_smoke.py --keep-serving # leave it up and poke at it

Exits non-zero if the page logs an error.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
import threading
import time

PORT = int(os.environ.get("UI_SMOKE_PORT", "8077"))
PASSWORD = "ui-smoke"
BASE = f"http://127.0.0.1:{PORT}"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def configure(tmp: str) -> None:
    os.environ.update(
        DATABASE_URL=f"sqlite:///{tmp}/ui.db",
        STORAGE_ROOT=f"{tmp}/data",
        OPERATOR_PASSWORD=PASSWORD,
        SECRET_KEY="ui-smoke-secret-key",
        MONTHLY_COST_CAP_USD="200",
        HEYGEN_TEST="true",
    )
    os.makedirs(f"{tmp}/data", exist_ok=True)
    sys.path.insert(0, ROOT)


def clip(path: str, seconds: float = 3.0) -> str:
    """A stand-in for a rendered take, so the players have something to play."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path):
        subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c=teal:s=180x320:r=15:d={seconds}",
             "-f", "lavfi", "-i", f"sine=frequency=330:duration={seconds}",
             "-c:v", "libx264", "-preset", "ultrafast", "-crf", "34", "-pix_fmt", "yuv420p",
             "-c:a", "aac", "-shortest", path],
            check=True, capture_output=True,
        )
    return path


def seed() -> None:
    from app.db import init_db, session_scope
    from app.models import (
        Batch, CostEntry, ExportItem, HookVariant, Job, JobStatus, Project,
        ProjectStatus, Step, UnitStatus, utcnow,
    )
    from app.service import create_hook_variants, create_project

    init_db()
    storage = os.environ["STORAGE_ROOT"]
    have_ffmpeg = subprocess.run(["which", "ffmpeg"], capture_output=True).returncode == 0

    def media(path: str, seconds: float = 3.0) -> str | None:
        return clip(path, seconds) if have_ffmpeg else None

    with session_scope() as db:
        if db.query(Project).count():
            return

        # A finished short, with hook variants and an export queued.
        short = create_project(db, name="Cold open — onboarding", target_seconds=15, spec={
            "beats": [
                {"narration": "Stop scrolling right now"},
                {"narration": "Most teams ship onboarding backwards every single time"},
                {"narration": "Flip the order and the drop-off disappears"},
                {"narration": "That is the whole trick"},
            ]})
        short.status = ProjectStatus.COMPLETE
        short.output_path = media(f"{storage}/projects/{short.id}/final/final.mp4", 4)
        short.cost_actual = 0.42
        for chapter in short.chapters:
            chapter.status = UnitStatus.COMPLETE
        for segment in short.segments:
            segment.status = UnitStatus.COMPLETE
            segment.output_path = short.output_path
        create_hook_variants(db, short, [
            "Stop scrolling right now", "You are onboarding backwards",
            "This costs you 30% of signups", "Nobody reads your welcome email",
            "Three words fixed our activation", "The fix is one line",
            "Your first screen is wrong", "Delete your onboarding tour today"])
        for i, variant in enumerate(
            db.query(HookVariant).filter_by(project_id=short.id).order_by(HookVariant.index).all()[:3]
        ):
            variant.rendered = True
            variant.status = UnitStatus.COMPLETE
            variant.output_path = media(f"{storage}/projects/{short.id}/variants/hook_{i:02d}.mp4", 2)
        db.add(ExportItem(project_id=short.id, platform="tiktok", title="Onboarding backwards",
                          description="The one-line fix", hashtags=["#startup", "#saas"],
                          file_path=short.output_path))
        db.add(CostEntry(project_id=short.id, kind="render", amount_usd=0.42, detail={"seconds": 15}))

        # A short whose script fails validation.
        create_project(db, name="Hook too long", target_seconds=15, spec={"beats": [
            {"narration": "Here is a hook that is far too long to ever work on any platform"},
            {"narration": "Setup goes here"}, {"narration": "The turn"}, {"narration": "Payoff"}]})

        # A long build mid-flight: two chapters done, one rendering, one failed segment.
        long_p = create_project(db, name="The 90 minute one", target_seconds=5400, spec={})
        long_p.status = ProjectStatus.RENDERING
        long_p.confirmed_at = utcnow()
        long_p.cost_actual = 6.10
        chapters = sorted(long_p.chapters, key=lambda c: c.index)
        by_chapter = {c.id: [s for s in long_p.segments if s.chapter_id == c.id] for c in chapters}
        for chapter in chapters[:2]:
            chapter.status = UnitStatus.COMPLETE
            chapter.output_path = media(
                f"{storage}/projects/{long_p.id}/chapters/chapter_{chapter.index:04d}.mp4")
            chapter.cost = 3.05
            chapter.checkpoint = {"assembled": True}
            for segment in by_chapter[chapter.id]:
                segment.status = UnitStatus.COMPLETE
                segment.output_path = chapter.output_path
                segment.cost = 3.05
                segment.provider = "heygen"
                segment.provider_video_id = f"vid-{segment.index}"
        chapters[2].status = UnitStatus.RUNNING
        for segment in by_chapter[chapters[2].id]:
            segment.status = UnitStatus.RUNNING
            segment.provider = "heygen"
            segment.provider_video_id = "vid-live"
        for segment in by_chapter[chapters[3].id][:1]:
            segment.status = UnitStatus.FAILED
            segment.attempts = 4
            segment.error = (
                "heygen error: {'code': 400128, 'message': 'video duration exceeds the plan "
                "limit of 300 seconds'}"
            )
        db.add(CostEntry(project_id=long_p.id, kind="render", amount_usd=6.10, detail={"seconds": 600}))
        for i in range(6):
            failed = i >= 4
            db.add(Job(
                project_id=long_p.id,
                segment_id=by_chapter[chapters[i // 3].id][0].id,
                step=Step.SEGMENT_RENDER, provider="heygen",
                status=JobStatus.FAILED if failed else JobStatus.SUCCEEDED,
                attempts=4 if failed else 1, cost=0.0 if failed else 3.05,
                provider_job_id=f"vid-{i}",
                payload={"request": {"body": {"variables": {
                    "script": {"properties": {"content": "chapter narration"}}}}}},
                response={"data": {"status": "failed" if failed else "completed"}},
                error=("heygen error: video duration exceeds the plan limit of 300 seconds"
                       if failed else None),
            ))

        # A batch of shorts, half of them rendered.
        batch = Batch(name="volume week 1", kind="shorts", spec={"count": 6})
        db.add(batch)
        db.flush()
        for i in range(6):
            project = create_project(
                db, name=f"short {i + 1}", target_seconds=15,
                spec={"script": "Stop. It ships wrong. Flip it. Done."},
                batch_id=batch.id, batch_index=i)
            if i < 3:
                project.status = ProjectStatus.COMPLETE
                project.output_path = media(f"{storage}/projects/{project.id}/final/final.mp4")
                project.cost_actual = 0.21
            elif i == 3:
                project.status = ProjectStatus.FAILED
                project.error = (
                    "segment 0 failed: heygen error: template placeholder 'script' not found"
                )
            else:
                project.status = ProjectStatus.QUEUED


def serve() -> threading.Thread:
    import uvicorn

    config = uvicorn.Config("app.main:app", host="127.0.0.1", port=PORT, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(100):
        time.sleep(0.2)
        if server.started:
            return thread
    raise RuntimeError("server did not start")


def drive(out_dir: str) -> int:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright is not installed; serving only. pip install playwright")
        return 0

    os.makedirs(out_dir, exist_ok=True)
    problems: list[str] = []
    checks: list[str] = []

    with sync_playwright() as pw:
        # CHROMIUM_PATH covers hosts that already ship a browser Playwright did
        # not download itself.
        chromium_path = os.environ.get("CHROMIUM_PATH")
        browser = pw.chromium.launch(**({"executable_path": chromium_path} if chromium_path else {}))
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
        page.on(
            "console",
            lambda m: problems.append(f"console.{m.type}: {m.text}")
            # The pre-login /api/me 401 is how the page decides to show the lock screen.
            if m.type == "error" and "401" not in m.text
            else None,
        )

        def shot(name: str) -> None:
            page.screenshot(path=f"{out_dir}/{name}.png", full_page=True)

        page.goto(BASE)
        page.wait_for_selector("#login-form")
        shot("01-login")
        page.fill("#password", PASSWORD)
        page.click("#login-form button[type=submit]")
        page.wait_for_selector("#app:not([hidden])", timeout=15000)
        page.wait_for_timeout(800)
        assert page.locator("#login").is_hidden(), "the lock screen is still on top of the app"
        checks.append(f"queue bar: {page.inner_text('#queue-state')}")
        shot("02-projects")

        # Short tier: four lanes, proportional widths, live word budgets.
        page.click("a[data-open]:has-text('Cold open')")
        page.wait_for_selector(".lanes", timeout=15000)
        page.wait_for_timeout(400)
        lanes = page.locator(".lane")
        roles = [lanes.nth(i).locator("h4").inner_text() for i in range(lanes.count())]
        widths = [round(lanes.nth(i).bounding_box()["width"]) for i in range(lanes.count())]
        assert roles == ["HOOK", "SETUP", "TURN", "PAYOFF"], roles
        assert widths[0] < widths[2], "lane widths are not proportional to duration"
        checks.append(f"lanes {roles} widths {widths}")
        shot("03-short-lanes")

        page.locator("textarea[data-beat='0']").fill("this hook is now far too long for its window")
        page.wait_for_timeout(200)
        counter = page.locator("[data-count='0']")
        assert counter.evaluate("e => e.classList.contains('over')"), "overrun is not flagged red"
        checks.append(f"overrun turns red: {counter.inner_text()}")
        shot("04-overrun")

        # Long tier: chapters, seams, per-chapter progress, real errors.
        page.click("#back")
        page.wait_for_selector("table")
        page.click("a[data-open]:has-text('90 minute')")
        page.wait_for_selector(".chapter", timeout=15000)
        page.wait_for_timeout(400)
        chapters = page.locator(".chapter").count()
        seams = page.locator(".chapter-seam").count()
        assert chapters > 1 and seams == chapters - 1, f"{chapters} chapters but {seams} seams drawn"
        checks.append(f"{chapters} chapters, {seams} seams drawn")
        for i in range(min(4, chapters)):
            page.locator(".chapter").nth(i).locator("summary").click()
        page.wait_for_timeout(400)
        assert page.locator(".seg").count() >= chapters
        assert page.locator(".beatrow").count() > 0
        shot("05-long-chapters")

        # Jobs: the provider's own error text, never swallowed.
        page.click("button[data-tab='jobs']")
        page.wait_for_selector("#view table", timeout=15000)
        page.wait_for_timeout(400)
        error_text = page.locator("#view .error").first.inner_text()
        assert "duration exceeds the plan limit" in error_text, error_text
        checks.append(f"job error shown verbatim: {error_text[:60]}…")
        shot("06-jobs")

        # Batch grid.
        page.click("button[data-tab='batches']")
        page.wait_for_selector("#b-items", timeout=15000)
        page.click("button[data-batch]")
        page.wait_for_selector(".videos", timeout=15000)
        page.wait_for_timeout(1000)
        checks.append(f"batch grid: {page.locator('.videos > .card').count()} cards")
        shot("07-batch-grid")

        page.click("button[data-tab='exports']")
        page.wait_for_selector("#x-add", timeout=15000)
        shot("08-exports")

        page.click("button[data-tab='cost']")
        page.wait_for_timeout(400)
        shot("09-cost")

        # The shape preview: what a length turns into before anything is written.
        page.click("button[data-tab='new']")
        page.wait_for_selector("#n-seconds", timeout=15000)
        page.fill("#n-seconds", "5400")
        page.dispatch_event("#n-seconds", "input")
        page.wait_for_timeout(600)
        shape = " ".join(page.inner_text("#shape").split())
        assert "segment(s)" in shape and "long" in shape, shape
        checks.append(f"shape preview: {shape[:80]}…")
        shot("10-new-long")
        browser.close()

    for line in checks:
        print("  ok  ", line)
    if problems:
        print("\nFAILED — the page logged:")
        for problem in problems:
            print("   ", problem)
        return 1
    print(f"\nno console errors. screenshots in {out_dir}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=os.path.join(tempfile.gettempdir(), "vvs-ui-smoke"))
    parser.add_argument("--keep-serving", action="store_true", help="leave the server up afterwards")
    args = parser.parse_args()

    tmp = tempfile.mkdtemp(prefix="vvs-ui-")
    configure(tmp)
    seed()
    serve()
    print(f"dashboard on {BASE} (password: {PASSWORD})")
    code = drive(args.out)
    if args.keep_serving:
        print("serving; ctrl-c to stop")
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            pass
    return code


if __name__ == "__main__":
    raise SystemExit(main())
