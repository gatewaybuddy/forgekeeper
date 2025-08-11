import os

from .provider import LLMProvider


def get_llm() -> LLMProvider:
    """Return an LLM provider based on environment configuration."""
    impl = os.getenv("FK_LLM_IMPL", "transformers").lower()
    if impl == "transformers":
        from .transformers_impl import TransformersLLMProvider

        return TransformersLLMProvider()
    if impl == "vllm":
        from .vllm_impl import VLLMLLMProvider

        return VLLMLLMProvider()
    raise ValueError(f"Unknown FK_LLM_IMPL: {impl}")


__all__ = ["LLMProvider", "get_llm"]
