"""LLM provider facade for the unified runtime."""

from __future__ import annotations

from typing import Any

from forgekeeper import config
from .transformers_impl import TransformersLLMProvider
from .triton_impl import TritonRTLLMProvider
from . import benchmark


def get_llm(*, impl: str | None = None) -> Any:
    impl = (impl or config.FK_LLM_IMPL).lower()
    if config.USE_TINY_MODEL:
        model_name = config.DEFAULT_TINY_MODEL
        return TransformersLLMProvider(model_name)
    if impl in {"transformers", "hf", "huggingface"}:
        model_name = config.FK_MODEL_PATH or config.DEFAULT_TINY_MODEL
        return TransformersLLMProvider(model_name)
    if impl in {"triton", "vllm"}:
        if not config.TRITON_MODEL_CORE and not config.TRITON_CHECKPOINT:
            model_name = config.DEFAULT_TINY_MODEL
            return TransformersLLMProvider(model_name)
        return TritonRTLLMProvider()
    return TransformersLLMProvider(config.DEFAULT_TINY_MODEL)


__all__ = [
    "get_llm",
    "TransformersLLMProvider",
    "TritonRTLLMProvider",
    "benchmark",
]
