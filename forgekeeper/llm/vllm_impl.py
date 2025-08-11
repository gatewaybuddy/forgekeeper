import os
from typing import Any

from openai import OpenAI

from .provider import LLMProvider


class VLLMLLMProvider(LLMProvider):
    """LLM provider that communicates with a vLLM server via OpenAI API."""

    def __init__(self) -> None:
        api_base = os.getenv("FK_API_BASE")
        model = os.getenv("FK_MODEL_PATH")
        if not api_base:
            raise ValueError("FK_API_BASE environment variable must be set")
        if not model:
            raise ValueError("FK_MODEL_PATH environment variable must be set")

        api_key = os.getenv("FK_API_KEY", "EMPTY")
        self.client = OpenAI(base_url=api_base, api_key=api_key)
        self.model = model

    def generate(self, prompt: str, **kwargs: Any) -> str:
        response = self.client.completions.create(
            model=self.model,
            prompt=prompt,
            **kwargs,
        )
        return response.choices[0].text
