from app.config import Settings
from app.cost import estimate_plan
from app.format.planner import plan_project


def plan_dict(seconds=90 * 60, cap=180):
    return plan_project(target_seconds=seconds, spec={}, max_segment_seconds=cap).as_dict()


def test_estimate_is_itemised():
    settings = Settings(heygen_test=False, cost_per_render_minute_usd=0.30, monthly_cost_cap_usd=1000)
    estimate = estimate_plan(plan_dict(), settings=settings)
    labels = [i.label for i in estimate.items]
    assert labels == ["Renderer credits", "Segments", "TTS", "Storage"]
    assert estimate.total_usd > 0
    assert estimate.requires_confirmation is True  # long tier
    assert any("crossfade at every seam" in n for n in estimate.notes)


def test_test_mode_costs_nothing_to_render():
    settings = Settings(heygen_test=True, monthly_cost_cap_usd=1000)
    estimate = estimate_plan(plan_dict(), settings=settings)
    render = next(i for i in estimate.items if i.label == "Renderer credits")
    assert render.cost_usd == 0.0
    assert any("watermarked" in n for n in estimate.notes)


def test_short_tier_does_not_require_confirmation():
    plan = plan_project(target_seconds=15, spec={"script": "Stop. It works. Try it. Done."}).as_dict()
    estimate = estimate_plan(plan, settings=Settings(monthly_cost_cap_usd=1000))
    assert estimate.requires_confirmation is False


def test_cap_refusal_is_explicit():
    settings = Settings(heygen_test=False, monthly_cost_cap_usd=0.01)
    estimate = estimate_plan(plan_dict(), settings=settings)
    assert estimate.over_monthly_cap is True
    assert any("REFUSED" in n for n in estimate.notes)
