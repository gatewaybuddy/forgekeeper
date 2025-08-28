import os

from forgekeeper.config import DEFAULT_TINY_MODEL, USE_TINY_MODEL
from .provider import LLMProvider


def get_llm() -> LLMProvider:
    """Return an LLM provider based on environment configuration."""
    impl_env = os.getenv("FK_LLM_IMPL")

    if USE_TINY_MODEL:
        impl = "transformers"
    else:
        model_path = os.getenv("FK_MODEL_PATH", DEFAULT_TINY_MODEL)
        if impl_env:
            impl = impl_env.lower()
        else:
            impl = "transformers" if model_path == DEFAULT_TINY_MODEL else "vllm"
    if impl == "transformers":
        from .transformers_impl import TransformersLLMProvider

        return TransformersLLMProvider()
    if impl == "vllm":
        from .vllm_impl import VLLMLLMProvider

        return VLLMLLMProvider()
    if impl == "llama_cpp":
        from .llama_cpp_impl import LlamaCppLLMProvider

        return LlamaCppLLMProvider()
    raise ValueError(f"Unknown FK_LLM_IMPL: {impl}")


__all__ = ["LLMProvider", "get_llm"]
