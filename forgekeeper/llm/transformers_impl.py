import os
from typing import Any

"""Deprecated Transformers-based LLM provider.

Forgekeeper now prefers vLLM servers. This module remains only for backwards
compatibility and will be removed in a future release.
"""

from .provider import LLMProvider


DTYPE_MAP = {
    "float16": "float16",
    "fp16": "float16",
    "half": "float16",
    "bfloat16": "bfloat16",
    "bf16": "bfloat16",
    "float32": "float32",
    "fp32": "float32",
    "float": "float32",
}


class TransformersLLMProvider(LLMProvider):
    """LLM provider that uses Hugging Face Transformers models."""

    def __init__(self) -> None:
        from transformers import AutoModelForCausalLM, AutoTokenizer  # type: ignore
        import torch

        model_path = os.getenv("FK_MODEL_PATH")
        if not model_path:
            raise ValueError("FK_MODEL_PATH environment variable must be set")

        dtype_str = os.getenv("FK_DTYPE", "bf16").lower()
        dtype_name = DTYPE_MAP.get(dtype_str, "bfloat16")
        dtype = getattr(torch, dtype_name)
        device = os.getenv("FK_DEVICE", "cuda:0")

        self.tokenizer = AutoTokenizer.from_pretrained(model_path)
        self.model = AutoModelForCausalLM.from_pretrained(
            model_path, torch_dtype=dtype
        )
        self.model.to(device)

    def generate(self, prompt: str, **kwargs: Any) -> str:
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.model.device)
        output_ids = self.model.generate(**inputs, **kwargs)
        return self.tokenizer.decode(output_ids[0], skip_special_tokens=True)
