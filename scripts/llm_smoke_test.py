import argparse
import os

from forgekeeper.llm import get_llm

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
