from __future__ import annotations

import asyncio
from typing import AsyncGenerator

from .llm_base import LLMBase


class LLMMock(LLMBase):
    def __init__(self, name: str) -> None:
        self.name = name

    async def stream(
        self, prompt: str, max_tokens: int = 128, time_slice_ms: int = 1000
    ) -> AsyncGenerator[tuple[str, str], None]:
        parts = [
            (f"[{self.name}] considering… ", "THINK"),
            (f"[{self.name}] propose noop", "PROPOSE(action)"),
            (f"[{self.name}] report done.", "REPORT"),
        ]
        budget = max(1, time_slice_ms // 3)
        for text, act in parts:
            await asyncio.sleep(min(0.2, budget / 1000))
            yield text, act

