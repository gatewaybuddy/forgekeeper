from __future__ import annotations

from typing import AsyncGenerator


class LLMBase:
    name: str = "llm"

    async def stream(
        self, prompt: str, max_tokens: int = 256, time_slice_ms: int = 1000
    ) -> AsyncGenerator[tuple[str, str], None]:
        if False:
            yield ("", "THINK")  # pragma: no cover
        return

