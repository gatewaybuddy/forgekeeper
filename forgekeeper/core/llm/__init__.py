"""LLM facade definitions used during the legacy migration."""

from __future__ import annotations

from .base import LLMConfig, LLMProvider
from .providers import registry

__all__ = ["LLMConfig", "LLMProvider", "registry"]
