import abc
from typing import Any


class LLMProvider(abc.ABC):
    """Abstract base class for language model providers."""

    @abc.abstractmethod
    def generate(self, prompt: str, **kwargs: Any) -> str:
        """Generate a completion for the given prompt."""
        raise NotImplementedError
