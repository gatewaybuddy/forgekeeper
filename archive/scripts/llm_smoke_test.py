import argparse
import os

try:  # pragma: no cover - best effort for optional import during tests
    from forgekeeper.llm import get_llm
except Exception:  # pragma: no cover - allow tests to import module
    get_llm = None

PROMPT = "Say hello from Forgekeeper."


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a short response using the configured LLM")
    parser.add_argument(
        "--backend",
        choices=["vllm"],
        default="vllm",
        help="Override FK_LLM_IMPL for this run",
    )
    args = parser.parse_args()

    if args.backend:
        os.environ["FK_LLM_IMPL"] = args.backend

    llm = get_llm()
    response = llm.generate(PROMPT)
    print(response)


if __name__ == "__main__":
    main()
