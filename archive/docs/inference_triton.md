# Triton Inference Backend

The Triton backend runs a GPU-optimized runtime for the open-source GPT‑OSS‑20B model. Use this backend when you want to serve tokens via NVIDIA's Triton runtime instead of the default `vllm` or `transformers` providers.

## Installation

1. Install the Triton runtime and client libraries:
   ```bash
   pip install tritonllm tritonclient[http] huggingface_hub
   ```
2. Download the model weights:
   ```bash
   huggingface-cli download openai/gpt-oss-20b --local-dir ./models/gpt-oss-20b
   ```

## Running the server

Start the Triton responses API server (single GPU example):

```bash
torchrun --nproc-per-node=1 -m tritonllm.gpt_oss.responses_api.serve \
  --checkpoint ./models/gpt-oss-20b --port 8000
```

Set the Forgekeeper environment variables and point them at the model and checkpoint directories:

```bash
export FK_LLM_IMPL=triton
export TRITON_MODEL=./models/gpt-oss-20b
export TRITON_CHECKPOINT=./models/gpt-oss-20b
# Optional overrides
export TRITON_URL=http://localhost:8000     # Triton responses API URL
export TRITON_DEVICE=cuda:0                 # GPU device string
export TRITON_CONTEXT_LENGTH=2048           # Max tokens
export TRITON_INPUT_NAME=INPUT_0            # Request tensor name
export TRITON_OUTPUT_NAME=OUTPUT_0          # Response tensor name
```

## GPU requirements

GPT‑OSS‑20B requires a modern NVIDIA GPU with **at least 48 GB** of VRAM. For multi‑GPU setups use `torchrun --nproc-per-node=<gpus>` and adjust `TRITON_DEVICE` accordingly.

## Troubleshooting

- **Missing `tritonclient` or `fastapi`** – ensure the `pip install` command above succeeded.
- **`TRITON_MODEL` or `TRITON_CHECKPOINT` errors** – verify the environment variables point to the downloaded model directory.
- **Out-of-memory (OOM)** – lower `TRITON_CONTEXT_LENGTH` or use a GPU with more memory.
- **No server response** – confirm the server is running on `TRITON_URL` and the port is open.

See the [README](../README.md#triton-backend) for a quick-start summary.
