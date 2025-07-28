import argparse
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
import matplotlib.pyplot as plt


def load_model(model_name: str):
    """Load a model and its tokenizer."""
    model = AutoModelForCausalLM.from_pretrained(model_name)
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    return model, tokenizer


def main() -> None:
    parser = argparse.ArgumentParser(description="Visualize FFT of model outputs")
    parser.add_argument("--model", required=True, help="Model name or path")
    parser.add_argument("--text", help="Input text (otherwise prompt)")
    parser.add_argument(
        "--output", default="inference_spectrum.png", help="Output image path"
    )
    args = parser.parse_args()

    model, tokenizer = load_model(args.model)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)

    text = args.text if args.text is not None else input("Input text: ")
    input_ids = tokenizer(text, return_tensors="pt").input_ids.to(device)

    with torch.no_grad():
        outputs = model(input_ids, output_hidden_states=True)
    last_hidden = outputs.hidden_states[-1][0]

    spectrum = torch.fft.fft(last_hidden, dim=0)
    magnitude = spectrum.abs().mean(dim=-1).cpu().numpy()

    plt.figure()
    plt.plot(magnitude)
    plt.xlabel("Frequency bin")
    plt.ylabel("Magnitude")
    plt.title("FFT of token representations")
    plt.tight_layout()
    plt.savefig(args.output)
    print(f"Saved spectrum to {args.output}")


if __name__ == "__main__":
    main()
