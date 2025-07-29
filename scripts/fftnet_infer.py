import argparse
import subprocess
import sys
from pathlib import Path

import torch
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE

log = get_logger(__name__, debug=DEBUG_MODE)
from transformers import AutoModelForCausalLM, AutoTokenizer

from fftnet.utils.generation import generate


def load_model(model_name: str):
    """Load a model and its tokenizer from a local path or HuggingFace hub."""
    model = AutoModelForCausalLM.from_pretrained(model_name)
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    return model, tokenizer


def main() -> None:
    parser = argparse.ArgumentParser(description="Simple FFTNet inference script")
    parser.add_argument(
        "--model",
        required=True,
        help="Model name or path to load via transformers",
    )
    parser.add_argument(
        "--prompt",
        help="Prompt text to feed into the model (optional). If not provided, you will be prompted on the CLI.",
    )
    parser.add_argument(
        "--max_new_tokens",
        type=int,
        default=1,
        help="Number of tokens to generate",
    )
    parser.add_argument(
        "--sampling",
        choices=["greedy", "top_k"],
        default="greedy",
        help="Sampling strategy when --mode text",
    )
    parser.add_argument(
        "--top_k",
        type=int,
        default=5,
        help="k for top-k sampling",
    )
    parser.add_argument(
        "--mode",
        choices=["text", "logits", "spectrum"],
        default="text",
        help="Output mode",
    )
    args = parser.parse_args()

    model, tokenizer = load_model(args.model)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)

    text = args.prompt if args.prompt is not None else input("Prompt: ")

    input_ids = tokenizer(text, return_tensors="pt").input_ids.to(device)

    if args.mode == "text":
        output = generate(
            model,
            tokenizer,
            input_ids,
            max_tokens=args.max_new_tokens,
            mode=args.sampling,
            top_k=args.top_k,
        )
        log.info(output)
    elif args.mode == "logits":
        with torch.no_grad():
            logits = model(input_ids).logits[:, -1, :]
        values, indices = torch.topk(logits, args.top_k, dim=-1)
        tokens = tokenizer.batch_decode(indices[0])
        for token, val in zip(tokens, values[0]):
            log.info(f"{token}\t{val.item():.4f}")
    elif args.mode == "spectrum":
        script = Path(__file__).resolve().parent / "fft_visualizer.py"
        cmd = [sys.executable, str(script), "--model", args.model, "--text", text]
        subprocess.run(cmd, check=False)


if __name__ == "__main__":
    main()
