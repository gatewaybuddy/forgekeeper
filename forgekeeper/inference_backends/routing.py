from .config import get_inference_config


def select_model(kind: str | None = None) -> str:
    cfg = get_inference_config()
    if kind == "harmony":
        return cfg.model_harmony
    if kind == "mistral":
        return cfg.model_mistral
    return cfg.model_default
