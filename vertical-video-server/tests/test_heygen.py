import httpx
import pytest

from app.config import Settings
from app.providers.base import ProviderError, SegmentSpec
from app.providers.heygen import HeyGenProvider
from app.providers import heygen_urls as urls


def make_settings(**over):
    base = dict(
        heygen_api_key="test-key",
        heygen_template_id="tmpl-123",
        heygen_avatar_id="av-1",
        heygen_voice_id="vo-1",
        heygen_test=True,
        cost_per_render_minute_usd=0.30,
    )
    base.update(over)
    return Settings(**base)


def spec(**over):
    base = dict(
        segment_id="seg1",
        project_id="proj1",
        index=0,
        narration="Stop scrolling right now",
        duration_seconds=15.0,
        title="clip",
    )
    base.update(over)
    return SegmentSpec(**base)


def provider_with(handler, **over):
    settings = make_settings(**over)
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return HeyGenProvider(settings, client=client)


def test_all_urls_live_in_one_module():
    assert urls.template_generate("abc") == "https://api.heygen.com/v2/template/abc/generate"
    assert urls.video_generate() == "https://api.heygen.com/v2/video/generate"
    assert urls.video_status("vid") == "https://api.heygen.com/v1/video_status.get?video_id=vid"
    assert urls.API_KEY_HEADER == "X-Api-Key"


def test_template_submit_uses_api_key_header_and_named_placeholders():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["key"] = request.headers.get("X-Api-Key")
        seen["auth"] = request.headers.get("Authorization")
        seen["body"] = request.read().decode()
        return httpx.Response(200, json={"error": None, "data": {"video_id": "vid-9"}})

    p = provider_with(handler)
    submission = p.submit(spec())

    assert seen["url"] == urls.template_generate("tmpl-123")
    assert seen["key"] == "test-key"
    assert seen["auth"] is None
    assert '"script"' in seen["body"]
    assert '"test":true' in seen["body"]  # test renders: watermarked, no credits
    assert submission.provider_job_id == "vid-9"
    # The full payload is kept for diffing a video that lands against one that does not.
    assert submission.payload["body"]["variables"]["script"]["properties"]["content"] == (
        "Stop scrolling right now"
    )


def test_agent_mode_is_the_fallback_shape():
    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == urls.video_generate()
        body = request.read().decode()
        assert "video_inputs" in body and "av-1" in body
        return httpx.Response(200, json={"data": {"video_id": "vid-agent"}})

    p = provider_with(handler, heygen_mode="agent")
    assert p.submit(spec()).provider_job_id == "vid-agent"


def test_provider_error_text_is_not_swallowed():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, text='{"error":{"message":"duration exceeds plan limit"}}')

    p = provider_with(handler)
    with pytest.raises(ProviderError) as exc:
        p.submit(spec())
    assert "duration exceeds plan limit" in str(exc.value)
    assert exc.value.retryable is False


def test_rate_limit_is_retryable():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, text="slow down")

    with pytest.raises(ProviderError) as exc:
        provider_with(handler).submit(spec())
    assert exc.value.retryable is True


def test_error_object_on_a_200_is_still_an_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"error": {"code": 400123, "message": "bad template"}})

    with pytest.raises(ProviderError, match="bad template"):
        provider_with(handler).submit(spec())


@pytest.mark.parametrize(
    "raw,expected",
    [("pending", "pending"), ("processing", "processing"), ("completed", "completed"), ("failed", "failed")],
)
def test_poll_maps_states(raw, expected):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "data": {
                    "status": raw,
                    "video_url": "https://cdn/x.mp4",
                    "duration": 14.9,
                    "error": {"message": "boom"} if raw == "failed" else None,
                }
            },
        )

    status = provider_with(handler).poll("vid-9")
    assert status.state == expected
    if expected == "failed":
        assert "boom" in status.error


def test_test_mode_renders_are_free():
    p = provider_with(lambda r: httpx.Response(200, json={"data": {}}))
    assert p.estimate_cost(600, test=True) == 0.0
    assert p.estimate_cost(600, test=False) == pytest.approx(3.0)


def test_poll_interval_is_never_faster_than_twenty_seconds():
    assert Settings(heygen_poll_seconds=1).poll_seconds == 20
    assert Settings(heygen_poll_seconds=45).poll_seconds == 45


def test_seam_crossfade_is_clamped_to_the_useful_band():
    assert Settings(seam_crossfade_ms=50).crossfade_ms == 200
    assert Settings(seam_crossfade_ms=900).crossfade_ms == 400
    assert Settings(seam_crossfade_ms=250).crossfade_ms == 250
