import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from forgekeeper.llm import benchmark


def test_run_benchmark_calls_warmup():
    class Dummy:
        def __init__(self):
            self.calls = 0
        def __call__(self, prompt: str):
            self.calls += 1
            return "ok"
    dummy = Dummy()
    results = benchmark.run_benchmark(dummy, ["a", "b c"])
    assert dummy.calls == 3  # 1 warmup + 2 prompts
    assert len(results) == 2
    for r in results:
        assert r["latency"] >= 0
        assert r["tokens_per_sec"] >= 0
