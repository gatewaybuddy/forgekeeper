# Inference Backends (Feature-Flagged)

- Provides an OpenAI-compatible client and minimal Harmony formatting.
- Controlled by `FGK_INFERENCE_ENABLED` (default enabled).
- Env:
  - `FGK_INFER_URL` (default `http://localhost:8080`)
  - `FGK_INFER_KEY` (default `dev-key`)
  - `FGK_MODEL_DEFAULT`, `FGK_MODEL_HARMONY`, `FGK_MODEL_MISTRAL`

Use:
- `from forgekeeper.inference_backends import OpenAICompatClient, select_model, render_harmony`
