import types

import pytest
import openai

from forgekeeper_v2.orchestrator.adapters.llm_openai import LLMOpenAI
import forgekeeper_v2.orchestrator.adapters.llm_openai as llm_openai


class _CreateSequence:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if not self._responses:
            raise AssertionError("No more responses queued")
        result = self._responses.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


class _StubMessage:
    def __init__(self, content=None, model_extra=None, reasoning=None):
        self.content = content
        self.model_extra = model_extra or {}
        if reasoning is not None:
            self.reasoning_content = reasoning


class _StubChoice:
    def __init__(self, message=None, text=""):
        self.message = message
        self.text = text


class _StubResponse:
    def __init__(self, choice):
        self.choices = [choice]


@pytest.mark.asyncio
async def test_stream_handles_structured_reasoning(monkeypatch):
    reasoning_part = {"type": "reasoning", "text": "plan steps"}
    report_part = {"type": "output_text", "text": "<REPORT>do the thing"}
    message = _StubMessage(content=[reasoning_part, report_part])
    response = _StubResponse(_StubChoice(message=message))

    stub_client = types.SimpleNamespace(
        chat=types.SimpleNamespace(completions=_CreateSequence([response])),
        completions=_CreateSequence([]),
    )

    monkeypatch.setattr(openai, "OpenAI", lambda: stub_client)
    monkeypatch.setattr(openai, "OpenAIError", RuntimeError)

    async def _direct(func, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr(llm_openai.asyncio, "to_thread", _direct)

    llm = LLMOpenAI("oss-gpt")
    output = []
    async for chunk, act in llm.stream("hello"):
        output.append((chunk, act))

    assert output == [("plan steps", "THINK"), ("<REPORT>do the thing", "REPORT")]
    call_kwargs = stub_client.chat.completions.calls[0]
    assert call_kwargs["extra_headers"]["OpenAI-Experimental-Disable-Harmony"] == "true"


@pytest.mark.asyncio
async def test_stream_falls_back_to_completion_text(monkeypatch):
    chat_sequence = _CreateSequence([RuntimeError("with extra"), RuntimeError("without extra")])
    stub_client = types.SimpleNamespace(
        chat=types.SimpleNamespace(completions=chat_sequence),
        completions=_CreateSequence([
            _StubResponse(_StubChoice(text="Thinking...<REPORT>answer"))
        ]),
    )

    monkeypatch.setattr(openai, "OpenAI", lambda: stub_client)
    monkeypatch.setattr(openai, "OpenAIError", RuntimeError)

    async def _direct(func, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr(llm_openai.asyncio, "to_thread", _direct)

    llm = LLMOpenAI("oss-gpt")
    output = []
    async for chunk, act in llm.stream("hello"):
        output.append((chunk, act))

    assert output == [("Thinking...", "THINK"), ("<REPORT>answer", "REPORT")]
    assert stub_client.completions.calls, "fallback completions call not used"
    assert len(chat_sequence.calls) == 2
