import os
from typing import Any

from llama_cpp import Llama

from .provider import LLMProvider


class LlamaCppLLMProvider(LLMProvider):
    """LLM provider that wraps ``llama_cpp`` bindings."""

    def __init__(self) -> None:
        model_path = os.getenv("FK_MODEL_PATH")
        if not model_path:
            raise ValueError("FK_MODEL_PATH environment variable must be set")
        n_ctx = int(os.getenv("FK_CONTEXT_SIZE", "2048"))
        n_threads = int(os.getenv("FK_THREADS", "4"))
        n_gpu_layers = int(os.getenv("FK_GPU_LAYERS", "0"))
        self.llm = Llama(
            model_path=model_path,
            n_ctx=n_ctx,
            n_threads=n_threads,
            n_gpu_layers=n_gpu_layers,
            verbose=False,
        )

    def generate(self, prompt: str, **kwargs: Any) -> str:
        """Generate a completion for ``prompt`` using llama.cpp."""
        output = self.llm(prompt, **kwargs)
        return output["choices"][0]["text"]
