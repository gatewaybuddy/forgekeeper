import os
from dataclasses import dataclass


@dataclass
class InferenceConfig:
    enabled: bool
    base_url: str
    api_key: str
    model_default: str
    model_harmony: str
    model_mistral: str


def get_inference_config() -> InferenceConfig:
    return InferenceConfig(
        enabled=(os.environ.get("FGK_INFERENCE_ENABLED", "1") != "0"),
        base_url=os.environ.get("FGK_INFER_URL", "http://localhost:8080"),
        api_key=os.environ.get("FGK_INFER_KEY", "dev-key"),
        model_default=os.environ.get("FGK_MODEL_DEFAULT", "mistral-7b"),
        model_harmony=os.environ.get("FGK_MODEL_HARMONY", "gpt-oss-20b-harmony"),
        model_mistral=os.environ.get("FGK_MODEL_MISTRAL", "mistralai/Mistral-7B-Instruct"),
    )
