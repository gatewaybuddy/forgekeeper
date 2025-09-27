"""HTTP client for Triton-backed responses."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

import requests

from forgekeeper import config
from forgekeeper.inference_backends.harmony import render_harmony


@dataclass
class TritonClient:
    base_url: str
    model: str

    def ask(self, prompt: str) -> str:
        payload = {
            "model": self.model,
            "input": self._render_input(prompt),
        }
        response = requests.post(
            f"{self.base_url}/v1/responses",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        try:
            return data["output"][0]["content"][0]["text"]
        except Exception as exc:  # pragma: no cover - defensive
            raise ValueError(f"Unexpected Triton response: {json.dumps(data)}") from exc

    def _render_input(self, prompt: str) -> Any:
        if "harmony" in self.model:
            return render_harmony([{ "role": "user", "content": prompt }], None)
        return prompt


llm_core = TritonClient(
    base_url=os.getenv("FK_CORE_API_BASE", config.FK_CORE_API_BASE),
    model=os.getenv("TRITON_MODEL_CORE", config.TRITON_MODEL_CORE or config.DEFAULT_TINY_MODEL),
)

__all__ = ["llm_core", "TritonClient"]
