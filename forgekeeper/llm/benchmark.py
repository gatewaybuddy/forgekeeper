"""Lightweight benchmarking helpers for LLM providers."""

from __future__ import annotations

import time
from typing import Callable, Iterable, List, Dict, Any


def warmup(llm: Callable[[str], Any], prompt: str = "Hello") -> None:
    """Run a single prompt to warm up the backend."""
    llm(prompt)


def measure_generation(llm: Callable[[str], Any], prompt: str) -> Dict[str, Any]:
    """Return latency and token statistics for ``prompt``."""
    start = time.perf_counter()
    output = llm(prompt)
    latency = time.perf_counter() - start
    text = output if isinstance(output, str) else str(output)
    tokens = len(text.split())
    tps = tokens / latency if latency > 0 else 0.0
    return {
        "prompt": prompt,
        "output": text,
        "tokens": tokens,
        "latency": latency,
        "tokens_per_sec": tps,
    }


def run_benchmark(llm: Callable[[str], Any], prompts: Iterable[str]) -> List[Dict[str, Any]]:
    """Warm up ``llm`` and benchmark it on ``prompts``."""
    warmup(llm)
    return [measure_generation(llm, p) for p in prompts]
