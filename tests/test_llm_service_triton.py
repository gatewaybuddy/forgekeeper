import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def test_triton_request(monkeypatch):
    monkeypatch.setenv("FK_HEALTHZ_CHECK", "0")
    monkeypatch.setenv("FK_CORE_API_BASE", "http://fake")
    monkeypatch.setenv("TRITON_MODEL_CORE", "oss-20b")

    import importlib
    import forgekeeper.llm.llm_service_triton as service
    importlib.reload(service)

    called = {}

    def fake_post(url, json, headers, timeout):
        called["url"] = url
        called["json"] = json
        class Resp:
            def raise_for_status(self):
                pass
            def json(self):
                return {"output": [{"content": [{"text": "ok"}]}]}
        return Resp()

    monkeypatch.setattr(service.requests, "post", fake_post)
    result = service.llm_core.ask("hello")
    assert result == "ok"
    assert called["url"] == "http://fake/v1/responses"
    assert called["json"]["model"] == "oss-20b"
    assert called["json"]["input"] == "hello"


def test_triton_harmony_format(monkeypatch):
    monkeypatch.setenv("FK_HEALTHZ_CHECK", "0")
    monkeypatch.setenv("FK_CORE_API_BASE", "http://fake")
    monkeypatch.setenv("TRITON_MODEL_CORE", "gpt-oss-20b-harmony")

    import importlib
    import forgekeeper.llm.llm_service_triton as service
    importlib.reload(service)

    captured = {}

    def fake_post(url, json, headers, timeout):
        captured["json"] = json
        class Resp:
            def raise_for_status(self):
                pass
            def json(self):
                return {"output": [{"content": [{"text": "hi"}]}]}
        return Resp()

    monkeypatch.setattr(service.requests, "post", fake_post)
    service.llm_core.ask("hello")
    from forgekeeper.inference_backends.harmony import render_harmony
    expected = render_harmony([{ "role": "user", "content": "hello" }], None)
    assert captured["json"]["input"] == expected
