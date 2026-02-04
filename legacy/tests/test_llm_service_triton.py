import json as jsonlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def test_triton_request_streaming(monkeypatch):
    monkeypatch.setenv("FK_HEALTHZ_CHECK", "0")
    monkeypatch.setenv("FK_CORE_API_BASE", "http://fake")
    monkeypatch.setenv("TRITON_MODEL_CORE", "oss-20b")

    import importlib
    import forgekeeper.llm.llm_service_triton as service
    importlib.reload(service)

    calls = {}

    events = [
        {"type": "response.reasoning.delta", "delta": {"text": "Thinking... "}},
        {
            "type": "response.function_call.arguments.delta",
            "delta": {"id": "call_1", "name": "functions.lookup", "arguments": "{\"city\":\"SF\"}"},
        },
        {"type": "response.output_text.delta", "delta": {"text": "Done."}},
        {"type": "response.completed", "status": "completed"},
    ]

    def fake_post(url, *, json=None, headers=None, timeout=None, stream=False):
        calls["url"] = url
        calls["payload"] = json
        calls["stream"] = stream

        class Resp:
            def raise_for_status(self):
                pass

            def iter_lines(self, decode_unicode=False):
                for event in events:
                    blob = f"data: {jsonlib.dumps(event)}"
                    yield blob if decode_unicode else blob.encode("utf-8")
                yield "data: [DONE]" if decode_unicode else b"data: [DONE]"

            def close(self):
                pass

        return Resp()

    monkeypatch.setattr(service.requests, "post", fake_post)
    reasoning_chunks: list[str] = []
    text = service.llm_core.ask("hello", on_reasoning=reasoning_chunks.append)

    assert text == "Done."
    assert calls["url"] == "http://fake/v1/responses"
    assert calls["stream"] is True
    assert calls["payload"]["model"] == "oss-20b"
    assert calls["payload"]["input"] == "hello"
    assert calls["payload"]["stream"] is True

    last = service.llm_core.last_response
    assert last is not None
    assert last.analysis == "Thinking... "
    assert last.tool_calls[0]["id"] == "call_1"
    assert "lookup" in last.tool_calls[0]["name"]
    assert reasoning_chunks == ["Thinking... "]


def test_triton_request_non_streaming(monkeypatch):
    monkeypatch.setenv("FK_HEALTHZ_CHECK", "0")
    monkeypatch.setenv("FK_CORE_API_BASE", "http://fake")
    monkeypatch.setenv("TRITON_MODEL_CORE", "oss-20b")

    import importlib
    import forgekeeper.llm.llm_service_triton as service
    importlib.reload(service)

    captured = {}

    response_payload = {
        "id": "resp_1",
        "model": "oss-20b",
        "output": [
            {
                "id": "analysis_1",
                "role": "assistant",
                "channel": "analysis",
                "content": [{"type": "reasoning", "text": "Reasoning."}],
            },
            {
                "id": "final_1",
                "role": "assistant",
                "channel": "final",
                "content": [{"type": "output_text", "text": "Answer."}],
            },
            {
                "id": "call_1",
                "role": "assistant",
                "channel": "commentary",
                "content": [
                    {
                        "type": "tool_call",
                        "id": "call_1",
                        "name": "functions.lookup",
                        "input": {"city": "SF"},
                    }
                ],
            },
        ],
    }

    def fake_post(url, *, json=None, headers=None, timeout=None, stream=False):
        captured["url"] = url
        captured["payload"] = json
        captured["stream"] = stream

        class Resp:
            def raise_for_status(self):
                pass

            def json(self):
                return response_payload

        return Resp()

    monkeypatch.setattr(service.requests, "post", fake_post)
    result = service.llm_core.ask("hello", stream=False, return_response=True)

    assert captured["stream"] is False
    assert result.text == "Answer."
    assert result.analysis == "Reasoning."
    assert result.tool_calls[0]["input"] == {"city": "SF"}
    assert service.llm_core.last_response is result


def test_triton_harmony_format(monkeypatch):
    monkeypatch.setenv("FK_HEALTHZ_CHECK", "0")
    monkeypatch.setenv("FK_CORE_API_BASE", "http://fake")
    monkeypatch.setenv("TRITON_MODEL_CORE", "gpt-oss-20b-harmony")

    import importlib
    import forgekeeper.llm.llm_service_triton as service
    importlib.reload(service)

    captured = {}

    def fake_post(url, *, json=None, headers=None, timeout=None, stream=False):
        captured["payload"] = json

        class Resp:
            def raise_for_status(self):
                pass

            def json(self):
                return {
                    "output": [
                        {
                            "id": "final_1",
                            "role": "assistant",
                            "channel": "final",
                            "content": [{"type": "output_text", "text": "hi"}],
                        }
                    ]
                }

        return Resp()

    monkeypatch.setattr(service.requests, "post", fake_post)
    service.llm_core.ask("hello", stream=False)

    from forgekeeper.inference_backends.harmony import HarmonyConfig, render_harmony

    expected = render_harmony([
        {"role": "user", "content": "hello"},
    ], HarmonyConfig(tool_channel_note="functions"))

    assert captured["payload"]["input"] == expected

