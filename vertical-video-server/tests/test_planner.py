import pytest

from app.format.planner import PlanError, expected_segment_count, plan_project
from app.format.tiers import short_windows, tier_for_duration


def test_tier_selection():
    assert tier_for_duration(15) == "short"
    assert tier_for_duration(90) == "short"
    assert tier_for_duration(300) == "mid"
    assert tier_for_duration(1200) == "mid"
    assert tier_for_duration(5400) == "long"


def test_short_windows_scale_proportionally():
    at15 = short_windows(15)
    assert [round(lo, 2) for _r, lo, _hi in at15] == [0.0, 2.5, 7.0, 12.0]
    at30 = short_windows(30)
    assert [round(hi, 2) for _r, _lo, hi in at30] == [5.0, 14.0, 24.0, 30.0]
    assert [role for role, _l, _h in at30] == ["hook", "setup", "turn", "payoff"]


def test_short_plan_is_one_segment_four_beats():
    plan = plan_project(
        target_seconds=15,
        spec={
            "beats": [
                {"narration": "Stop scrolling right now"},
                {"narration": "Every founder gets this wrong in the first week of the year"},
                {"narration": "The fix is one line in your onboarding flow"},
                {"narration": "That is why nobody reads it"},
            ]
        },
        max_segment_seconds=300,
    )
    assert plan.tier == "short"
    assert len(plan.chapters) == 1
    assert len(plan.chapters[0].beats) == 4
    assert len(plan.segments) == 1
    assert plan.seams == []


def test_ninety_minutes_is_split_into_segments_automatically():
    # The operator asks for 90 minutes; the server plans the segments.
    plan = plan_project(target_seconds=90 * 60, spec={}, max_segment_seconds=180)
    assert plan.tier == "long"
    assert all(s.duration_seconds <= 180 + 1e-6 for s in plan.segments)
    # The preview the operator sees before planning matches what is planned.
    assert len(plan.segments) == expected_segment_count(90 * 60, 180)
    assert len(plan_project(target_seconds=90 * 60, spec={}, max_segment_seconds=300).segments) == (
        expected_segment_count(90 * 60, 300)
    )
    # Every seam is recorded with its crossfade so assembly knows where they are.
    assert len(plan.seams) == len(plan.segments) - 1
    assert all(s.crossfade_ms == plan.crossfade_ms for s in plan.seams)


def test_segments_never_straddle_chapters():
    plan = plan_project(target_seconds=40 * 60, spec={}, max_segment_seconds=600)
    for chapter in plan.chapters:
        for seg_index in chapter.segment_indexes:
            assert plan.segments[seg_index].chapter_index == chapter.index


def test_long_tier_reuses_plates_and_caps_expensive_beats():
    plan = plan_project(
        target_seconds=30 * 60, spec={}, max_segment_seconds=300, plate_pool_size=4, expensive_cap=2
    )
    for chapter in plan.chapters:
        assert len(chapter.plate_pool) == 4
        assert sum(1 for b in chapter.beats if b.expensive) <= 2
        assert chapter.beats[0].expensive is True
        assert all(b.plate_ref in chapter.plate_pool for b in chapter.beats)
        assert len({b.framing for b in chapter.beats}) > 1
        assert any(b.loopable for b in chapter.beats)


def test_beat_longer_than_cap_is_refused():
    with pytest.raises(PlanError, match="segment cap"):
        plan_project(
            target_seconds=600,
            spec={"chapters": [{"title": "c", "beats": [{"duration_seconds": 60, "narration": ""}]}]},
            tier="long",
            max_segment_seconds=30,
        )


def test_short_tier_rejects_wrong_beat_count():
    with pytest.raises(PlanError, match="exactly 4 beats"):
        plan_project(target_seconds=15, spec={"beats": [{"narration": "a"}, {"narration": "b"}]})


def test_script_is_distributed_across_beats_without_loss():
    script = " ".join(f"Sentence number {i}." for i in range(1, 13))
    plan = plan_project(target_seconds=30, spec={"script": script})
    joined = " ".join(b.narration for b in plan.chapters[0].beats)
    for i in range(1, 13):
        assert f"Sentence number {i}." in joined
