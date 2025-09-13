from __future__ import annotations

from typing import AsyncGenerator

from .llm_base import LLMBase


class LLMOpenAI(LLMBase):
    def __init__(self, name: str = "openai") -> None:
        self.name = name

    async def stream(
        self, prompt: str, max_tokens: int = 256, time_slice_ms: int = 1000
    ) -> AsyncGenerator[tuple[str, str], None]:
        raise NotImplementedError

