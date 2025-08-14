import argparse
from typing import Callable, List

from forgekeeper.llm.benchmark import run_benchmark

PROMPT_LENGTHS = [5, 50, 200]


def _load_backend(name: str) -> Callable[[str], str]:
    if name != "vllm":
        raise ValueError("Only the vLLM backend is supported")
    from forgekeeper.llm.llm_service_vllm import ask_llm
    return ask_llm


def _make_prompt(n: int) -> str:
    return "word " * n


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark LLM backends")
    parser.add_argument(
        "--backend",
        choices=["vllm"],
        default="vllm",
        help="Backend to benchmark",
    )
    args = parser.parse_args()

    ask = _load_backend(args.backend)
    prompts: List[str] = [_make_prompt(n) for n in PROMPT_LENGTHS]
    results = run_benchmark(ask, prompts)
    for res in results:
        length = len(res["prompt"].split())
        print(
            f"{args.backend}: len={length} latency={res['latency']:.2f}s tps={res['tokens_per_sec']:.2f}"
        )


if __name__ == "__main__":
    main()
