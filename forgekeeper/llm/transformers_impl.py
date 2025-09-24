"""Minimal transformers-like provider used in tests."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class _Tokenizer:
    name_or_path: str


class TransformersLLMProvider:
    def __init__(self, model_name: str) -> None:
        self.model_name = model_name
        self.tokenizer = _Tokenizer(name_or_path=model_name)

    def generate(self, prompt: str, max_new_tokens: int | None = None) -> str:
        suffix = " ~~"
        return f"{prompt}{suffix}"


__all__ = ["TransformersLLMProvider"]
