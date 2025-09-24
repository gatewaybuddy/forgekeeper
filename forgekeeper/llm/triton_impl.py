"""Minimal Triton provider stub."""

from __future__ import annotations

import os


class TritonRTLLMProvider:
    def __init__(self) -> None:
        self.fake_response = os.getenv("FK_TRITON_FAKE_RESPONSE")
        self.model = os.getenv("TRITON_MODEL")
        if not self.fake_response and not self.model:
            raise ValueError("TRITON_MODEL environment variable must be set when FK_TRITON_FAKE_RESPONSE is empty")

    def generate(self, prompt: str, **_: object) -> str:
        if self.fake_response is not None:
            return self.fake_response
        return f"{prompt} :: {self.model}"


__all__ = ["TritonRTLLMProvider"]
