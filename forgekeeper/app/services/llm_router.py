import os
from forgekeeper.app.utils.json_helpers import extract_json
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE

BACKEND = os.getenv("LLM_BACKEND", "llamacpp").lower()
log = get_logger(__name__, debug=DEBUG_MODE)
log.debug("Backend from env: %s", os.getenv("LLM_BACKEND"))

# === Core Model Setup ===
if BACKEND == "openai":
    from forgekeeper.app.services.llm_service_openai import ask_llm as backend_ask
    SYSTEM_MESSAGE = os.getenv("OPENAI_SYSTEM_PROMPT", "")
    def ask_llm(prompt: str):
        return backend_ask(prompt, system_message=SYSTEM_MESSAGE)
else:
    from forgekeeper.app.shared.models import llm_core
    def ask_llm(prompt: str):
        if not llm_core:
            raise RuntimeError("llm_core is not loaded. Check your LLM_BACKEND or model path.")
        return extract_json(llm_core.ask(prompt))

# === Coder Model Setup (always local) ===
from forgekeeper.app.shared.models import llm_coder
def ask_coder(prompt: str):
    return llm_coder.ask(prompt)

# === Metadata/Display ===
def get_backend():
    return BACKEND

def get_core_model_name():
    if BACKEND == "openai":
        return os.getenv("OPENAI_MODEL", "gpt-4")
    else:
        return os.getenv("LLM_CORE_PATH", "llamacpp")

def get_coder_model_name():
    return os.getenv("LLM_CODER_PATH", "wizardcoder")
