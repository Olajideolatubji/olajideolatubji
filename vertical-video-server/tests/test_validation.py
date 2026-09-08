from app.format.planner import plan_project
from app.format.tiers import get_tier, short_word_cap
from app.format.validation import validate_plan


def codes(report):
    return {i.code for i in report.issues}


def error_codes(report):
    return {i.code for i in report.errors}


def test_hook_over_seven_words_fails():
    plan = plan_project(
        target_seconds=15,
        spec={
            "beats": [
                {"narration": "This is a hook that is far too long to work"},
                {"narration": "Setup"},
                {"narration": "Turn"},
                {"narration": "Payoff"},
            ]
        },
    )
    assert not plan.validation.ok
    assert "hook_too_long" in error_codes(plan.validation)


def test_short_word_cap_scales_with_duration():
    assert short_word_cap(15) == 40
    assert short_word_cap(30) == 80
    assert short_word_cap(60) == 160


def test_over_cap_script_is_rejected_not_sped_up():
    long_line = " ".join(["word"] * 30)
    plan = plan_project(
        target_seconds=15,
        spec={
            "beats": [
                {"narration": "Stop scrolling"},
                {"narration": long_line},
                {"narration": long_line},
                {"narration": "Done"},
            ]
        },
    )
    assert not plan.validation.ok
    assert {"script_over_cap", "script_exceeds_duration"} & error_codes(plan.validation)
    message = " ".join(i.message for i in plan.validation.errors)
    assert "never sped up" in message


def test_beat_overrun_is_flagged_with_the_number():
    tier = get_tier("short")
    chapters = [
        {
            "beats": [
                {"role": "hook", "duration_seconds": 2.5, "narration": "Stop scrolling"},
                # 2.5s * 2.6 = 6 words of budget; give it 7 -> flagged, one over.
                {"role": "setup", "duration_seconds": 2.5, "narration": "one two three four five six seven"},
            ]
        }
    ]
    report = validate_plan(tier, 15, chapters)
    issue = next(i for i in report.issues if i.code == "beat_over_budget")
    assert issue.numbers["over_by"] == 1
    assert issue.numbers["words"] == 7
    assert issue.numbers["budget"] == 6
    assert "1 word(s) over" in issue.message


def test_big_beat_overrun_is_an_error_not_a_warning():
    tier = get_tier("mid")
    chapters = [
        {
            "beats": [
                {"role": "hook", "duration_seconds": 10.0, "narration": " ".join(["word"] * 60)}
            ]
        }
    ]
    report = validate_plan(tier, 600, chapters)
    assert "beat_over_budget" in error_codes(report)


def test_mid_tier_still_owes_a_hook():
    plan = plan_project(
        target_seconds=300,
        spec={
            "chapters": [
                {
                    "title": "one",
                    "beats": [
                        {"narration": "Here is a very long opening line that never breaks the pattern at all"},
                        {"narration": "second beat"},
                    ],
                }
            ]
        },
        tier="mid",
    )
    assert "hook_too_long" in error_codes(plan.validation)


def test_clean_short_passes():
    plan = plan_project(
        target_seconds=15,
        spec={
            "beats": [
                {"narration": "Stop scrolling right now"},
                {"narration": "Most teams ship this backwards every single time"},
                {"narration": "Flip the order and it just works"},
                {"narration": "That is the whole trick"},
            ]
        },
    )
    assert plan.validation.ok, plan.validation.as_dict()["errors"]
