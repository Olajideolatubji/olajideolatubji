import pytest

from app.config import Settings
from app.providers import Registry
from app.providers.base import BeatSpec, CompositionProvider, ProviderError, RemoteStatus, RemoteSubmission
from app.providers.comfyui import ComfyUIProvider, _substitute


def test_token_substitution_keeps_native_types():
    graph = {
        "4": {"inputs": {"width": "{{width}}", "text": "a {{prompt}} b", "steps": 30}},
    }
    out = _substitute(graph, {"width": 1080, "prompt": "castle"})
    assert out["4"]["inputs"]["width"] == 1080
    assert out["4"]["inputs"]["text"] == "a castle b"
    assert out["4"]["inputs"]["steps"] == 30


def test_beat_values_carry_framing_and_references(tmp_path):
    refs = tmp_path / "refs" / "proj1"
    refs.mkdir(parents=True)
    (refs / "sheet_a.png").write_bytes(b"x")
    provider = ComfyUIProvider(Settings(comfyui_reference_dir=str(tmp_path / "refs")))
    spec = BeatSpec(
        beat_id="b1",
        project_id="proj1",
        chapter_index=0,
        index=3,
        prompt="a lighthouse",
        duration_seconds=4.0,
        framing="push_in",
        plate_ref="ch000_plate1",
        fps=30,
    )
    values = provider.build_values(spec)
    assert "push_in framing" in values["prompt"]
    assert values["frames"] == 120
    # Character reference sheets are injected into every image call.
    assert values["reference_image"].endswith("sheet_a.png")


class _Flaky(CompositionProvider):
    name = "flaky"

    def __init__(self):
        self.calls = 0

    def submit(self, spec):
        self.calls += 1
        raise ProviderError("boom", retryable=True)

    def poll(self, provider_job_id):
        return RemoteStatus(state="failed")

    def download(self, url, dest):
        return dest


class _Good(CompositionProvider):
    name = "good"

    def submit(self, spec):
        return RemoteSubmission(provider_job_id="ok", payload={})

    def poll(self, provider_job_id):
        return RemoteStatus(state="completed")

    def download(self, url, dest):
        return dest


def test_failover_moves_to_the_backup_provider():
    registry = Registry(Settings())
    flaky, good = _Flaky(), _Good()
    registry.register("flaky", flaky)
    registry.register("good", good)
    registry._chains["segment_render"] = ["flaky", "good"]

    result, provider = registry.run_with_failover("segment_render", lambda p: p.submit(None))
    assert provider is good
    assert result.provider_job_id == "ok"
    assert flaky.calls == 1


def test_failover_skips_already_burned_providers_on_retry():
    registry = Registry(Settings())
    flaky, good = _Flaky(), _Good()
    registry.register("flaky", flaky)
    registry.register("good", good)
    registry._chains["segment_render"] = ["flaky", "good"]

    _result, provider = registry.run_with_failover("segment_render", lambda p: p.submit(None), attempt=1)
    assert provider is good
    assert flaky.calls == 0


def test_provider_chain_override_from_env():
    registry = Registry(Settings(provider_chains='{"segment_render": ["heygen_agent"]}'))
    assert [p.name for p in registry.chain("segment_render")] == ["heygen"]  # name is the class name
    assert registry.primary("segment_render").settings.heygen_mode == "agent"


def test_unknown_provider_chain_json_is_rejected():
    with pytest.raises(ValueError, match="not valid JSON"):
        Registry(Settings(provider_chains="{not json"))
