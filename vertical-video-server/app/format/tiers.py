"""Length tiers. Target length is set at project creation and selects a tier;
the tier changes the structure, the cadence and the render strategy."""

from __future__ import annotations

from dataclasses import dataclass, field

# Narration pace. Everything downstream budgets words against this.
WORDS_PER_SECOND = 2.6

# The four-beat short structure, expressed as fractions of the total so the
# windows scale proportionally above 15s while the roles stay put.
#   beat 0  0.0-2.5s   HOOK    pattern break inside 1.5s
#   beat 1  2.5-7.0s   SETUP   context
#   beat 2  7.0-12.0s  TURN    the reveal
#   beat 3 12.0-15.0s  PAYOFF  lands, reads as a lead-in to the hook
SHORT_STRUCTURE: list[tuple[str, float, float]] = [
    ("hook", 0.0, 2.5 / 15.0),
    ("setup", 2.5 / 15.0, 7.0 / 15.0),
    ("turn", 7.0 / 15.0, 12.0 / 15.0),
    ("payoff", 12.0 / 15.0, 1.0),
]

# The hook has to break the pattern inside this many seconds.
HOOK_PATTERN_BREAK_SECONDS = 1.5
HOOK_MAX_WORDS = 7
# Mid and long still owe a hook in their opening window.
OPENING_HOOK_WINDOW_SECONDS = 10.0
# ~40 words at 15s, scaled by duration.
SHORT_WORD_CAP_AT_15S = 40


@dataclass(frozen=True)
class TierSpec:
    name: str
    min_seconds: float
    max_seconds: float
    chaptered: bool
    beat_min_seconds: float
    beat_max_seconds: float
    beat_target_seconds: float
    chapter_target_seconds: float
    words_per_second: float = WORDS_PER_SECOND
    # Long tier only: recompose a pool of plates instead of regenerating.
    reuse_plates: bool = False
    structure: list[tuple[str, float, float]] = field(default_factory=list)

    def word_budget(self, seconds: float) -> int:
        return int(round(seconds * self.words_per_second))


TIERS: dict[str, TierSpec] = {
    "short": TierSpec(
        name="short",
        min_seconds=15.0,
        max_seconds=90.0,
        chaptered=False,
        beat_min_seconds=1.0,
        beat_max_seconds=45.0,
        beat_target_seconds=3.75,
        chapter_target_seconds=90.0,
        structure=SHORT_STRUCTURE,
    ),
    "mid": TierSpec(
        name="mid",
        min_seconds=180.0,
        max_seconds=1200.0,
        chaptered=True,
        beat_min_seconds=8.0,
        beat_max_seconds=15.0,
        beat_target_seconds=12.0,
        chapter_target_seconds=90.0,
    ),
    "long": TierSpec(
        name="long",
        min_seconds=1200.0,
        max_seconds=10800.0,
        chaptered=True,
        # Scene level, not shot level.
        beat_min_seconds=20.0,
        beat_max_seconds=60.0,
        beat_target_seconds=40.0,
        chapter_target_seconds=300.0,
        reuse_plates=True,
    ),
}

FRAMINGS = ["wide", "medium", "close", "push_in", "slow_pan", "tilt_down", "over_shoulder"]

ROLE_COLOURS = {
    "hook": "#ff3b5c",
    "setup": "#ffa62b",
    "turn": "#38b6ff",
    "payoff": "#6bd968",
    "body": "#8f8fa6",
    "opener": "#c084fc",
}


def tier_for_duration(seconds: float) -> str:
    """Pick the tier a target length falls into. Boundaries lean to the shorter
    tier, and anything between 90s and 3 minutes is treated as mid."""
    if seconds <= TIERS["short"].max_seconds:
        return "short"
    if seconds <= TIERS["mid"].max_seconds:
        return "mid"
    return "long"


def get_tier(name: str) -> TierSpec:
    try:
        return TIERS[name]
    except KeyError:
        raise ValueError(f"unknown tier {name!r}; expected one of {sorted(TIERS)}") from None


def short_windows(total_seconds: float) -> list[tuple[str, float, float]]:
    """The four beat windows scaled to a real duration."""
    out = []
    for role, lo, hi in SHORT_STRUCTURE:
        out.append((role, round(lo * total_seconds, 3), round(hi * total_seconds, 3)))
    return out


def short_word_cap(total_seconds: float) -> int:
    return int(round(SHORT_WORD_CAP_AT_15S * (total_seconds / 15.0)))
