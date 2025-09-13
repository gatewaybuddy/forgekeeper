from __future__ import annotations

from typing import AsyncGenerator

from .llm_base import LLMBase


class LLMOpenAI(LLMBase):
    def __init__(self, model: str, name: str = "openai") -> None:
        self.name = name
        self.model = model

    async def stream(
        self, prompt: str, max_tokens: int = 256, time_slice_ms: int = 1000
    ) -> AsyncGenerator[tuple[str, str], None]:
        try:
            from openai import AsyncOpenAI  # type: ignore
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("openai package not installed; pip install openai") from exc
        client = AsyncOpenAI()
        messages = [
            {"role": "system", "content": "You are Forgekeeper v2 agent. Use <THINK>/<PROPOSE>/<REPORT> tags."},
            {"role": "user", "content": prompt},
        ]
        stream = await client.chat.completions.create(model=self.model, messages=messages, max_tokens=max_tokens, stream=True)
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield delta.content, "REPORT"
