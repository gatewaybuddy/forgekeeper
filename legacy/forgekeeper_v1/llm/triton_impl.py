import os
from typing import Any

from .provider import LLMProvider


class TritonRTLLMProvider(LLMProvider):
    """LLM provider that uses a Triton runtime model."""

    def __init__(self) -> None:
        # Used for deterministic tests without requiring Triton runtime
        self.fake_response = os.getenv("FK_TRITON_FAKE_RESPONSE")
        if self.fake_response:
            self.tokenizer = None
            self.generator = None
            return

        model_path = os.getenv("TRITON_MODEL")
        checkpoint_path = os.getenv("TRITON_CHECKPOINT")
        if not model_path:
            raise ValueError("TRITON_MODEL environment variable must be set")
        if not checkpoint_path:
            raise ValueError(
                "TRITON_CHECKPOINT environment variable must be set"
            )
        context_len = int(os.getenv("TRITON_CONTEXT_LENGTH", "2048"))
        device_str = os.getenv("TRITON_DEVICE", "cuda:0")

        import torch
        from tritonllm.gpt_oss.triton.model import TokenGenerator
        from gpt_oss.tokenizer import get_tokenizer

        device = torch.device(device_str)
        try:
            # Some versions accept a path argument
            self.tokenizer = get_tokenizer(model_path)  # type: ignore[arg-type]
        except TypeError:
            self.tokenizer = get_tokenizer()  # type: ignore[call-arg]
        self.generator = TokenGenerator(checkpoint_path, context_len, device)

    def generate(self, prompt: str, **kwargs: Any) -> str:
        if self.fake_response is not None:
            return self.fake_response
        if not self.tokenizer or not self.generator:
            raise RuntimeError("TokenGenerator is not initialized")
        prompt_tokens = self.tokenizer.encode(prompt)
        output_tokens = list(self.generator.generate(prompt_tokens, **kwargs))
        return self.tokenizer.decode(output_tokens)
