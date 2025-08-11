import os
from dotenv import load_dotenv
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE

log = get_logger(__name__, debug=DEBUG_MODE)

def init_env():
    # Always resolve from the project root where .env actually exists
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    dotenv_path = os.path.join(base_dir, '.env')
    load_dotenv(dotenv_path)

    # Map new FK_* variables with legacy LLM_* fallbacks
    fk_llm_impl = os.getenv("FK_LLM_IMPL") or os.getenv("LLM_BACKEND", "transformers")
    os.environ["FK_LLM_IMPL"] = fk_llm_impl
    os.environ.setdefault("LLM_BACKEND", fk_llm_impl)

    fk_model_path = os.getenv("FK_MODEL_PATH") or os.getenv("LLM_MODEL_PATH")
    if fk_model_path:
        os.environ["FK_MODEL_PATH"] = fk_model_path
        os.environ.setdefault("LLM_MODEL_PATH", fk_model_path)

    fk_dtype = os.getenv("FK_DTYPE", "bf16")
    os.environ["FK_DTYPE"] = fk_dtype

    fk_device = os.getenv("FK_DEVICE")
    if fk_device:
        os.environ["FK_DEVICE"] = fk_device

    fk_api_base = os.getenv("FK_API_BASE")
    if fk_api_base:
        os.environ["FK_API_BASE"] = fk_api_base

    # Debug output
    log.debug("Resolved .env path: %s", dotenv_path)
    log.debug("FK_LLM_IMPL: %s", fk_llm_impl)
    log.debug("FK_MODEL_PATH: %s", fk_model_path)
    log.debug("FK_DTYPE: %s", fk_dtype)
    log.debug("FK_DEVICE: %s", fk_device)
    log.debug("FK_API_BASE: %s", fk_api_base)
    log.debug("LLM_BACKEND (legacy): %s", os.getenv("LLM_BACKEND"))
    log.debug("LLM_MODEL_PATH (legacy): %s", os.getenv("LLM_MODEL_PATH"))
