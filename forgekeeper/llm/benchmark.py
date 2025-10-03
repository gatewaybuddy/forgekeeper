"""Simple benchmarking helpers."""

from __future__ import annotations

import time
from typing import Iterable, Protocol


class LLMCallable(Protocol):
    def __call__(self, prompt: str) -> str:
        ...


def run_benchmark(fn: LLMCallable, prompts: Iterable[str]) -> list[dict]:
    fn("warmup")
    results = []
    for prompt in prompts:
        start = time.perf_counter()
        output = fn(prompt)
        end = time.perf_counter()
        latency = max(end - start, 0.0)
        tokens = max(len(prompt.split()), 1)
        tokens_per_sec = tokens / latency if latency else float("inf")
        results.append(
            {
                "prompt": prompt,
                "latency": latency,
                "tokens_per_sec": tokens_per_sec,
                "output": output,
            }
        )
    return results


__all__ = ["run_benchmark"]
