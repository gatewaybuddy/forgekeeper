"""Configuration and model loading for Harmony service."""

from __future__ import annotations

import os
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE

try:  # pragma: no cover - optional dependency
    from llama_cpp import Llama
except Exception:  # pragma: no cover - allow import without llama_cpp installed
    Llama = None  # type: ignore

log = get_logger(__name__, debug=DEBUG_MODE)

MODEL_PATH = os.getenv("OPENAI_MODEL_PATH")
N_CTX = int(os.getenv("LLM_CONTEXT_SIZE", "4096"))
N_THREADS = int(os.getenv("LLM_THREADS", "8"))
N_GPU_LAYERS = int(os.getenv("LLM_GPU_LAYERS", "0"))
MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "500"))
TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.7"))
TOP_P = float(os.getenv("LLM_TOP_P", "0.95"))
DEFAULT_REASONING = os.getenv("OPENAI_REASONING_EFFORT", "medium")

_llm: Llama | None = None


def _load_model() -> Llama:
    """Load and cache the local Harmony model."""
    global _llm
    if _llm is None:
        if Llama is None:
            raise RuntimeError("llama_cpp is required for Harmony local models")
        if not MODEL_PATH:
            raise RuntimeError("OPENAI_MODEL_PATH is not set")

        log.info("Loading Harmony model from %s", MODEL_PATH)
        _llm = Llama(
            model_path=MODEL_PATH,
            n_ctx=N_CTX,
            n_threads=N_THREADS,
            n_gpu_layers=N_GPU_LAYERS,
            verbose=False,
        )
    return _llm


__all__ = [
    "_load_model",
    "MODEL_PATH",
    "N_CTX",
    "N_THREADS",
    "N_GPU_LAYERS",
    "MAX_TOKENS",
    "TEMPERATURE",
    "TOP_P",
    "DEFAULT_REASONING",
]
