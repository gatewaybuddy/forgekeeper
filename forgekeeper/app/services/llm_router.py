import os
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.app.utils.prompt_guard import verify_prompt

BACKEND = os.getenv("LLM_BACKEND", "llamacpp").lower()
log = get_logger(__name__, debug=DEBUG_MODE)
log.debug("Backend from env: %s", os.getenv("LLM_BACKEND"))

# === Core Model Setup ===
if BACKEND == "openai":
    # Use a local Harmony conversation model loaded from disk
    from forgekeeper.app.services.llm_service_openai_harmony import ask_llm as backend_ask

    SYSTEM_MESSAGE = os.getenv("OPENAI_SYSTEM_PROMPT", "")
    REASONING = os.getenv("OPENAI_REASONING_EFFORT")

    def ask_llm(prompt: str):
        prompt = verify_prompt(prompt)
        return backend_ask(prompt, system_message=SYSTEM_MESSAGE, reasoning=REASONING)

elif BACKEND == "vllm":
    from forgekeeper.llm.llm_service_vllm import ask_llm as backend_ask

    def ask_llm(prompt: str):
        prompt = verify_prompt(prompt)
        return backend_ask(prompt)

else:
    from forgekeeper.app.services.llm_service_llamacpp import ask_llm as backend_ask

    def ask_llm(prompt: str):
        prompt = verify_prompt(prompt)
        return backend_ask(prompt)

# === Coder Model Setup (always local) ===
from forgekeeper.app.shared.models import llm_coder
def ask_coder(prompt: str):
    prompt = verify_prompt(prompt)
    return llm_coder.ask(prompt)

# === Metadata/Display ===
def get_backend():
    return BACKEND

def get_core_model_name():
    if BACKEND == "openai":
        return os.getenv("OPENAI_MODEL_PATH", "gpt-oss")
    else:
        return os.getenv("LLM_CORE_PATH", "llamacpp")

def get_coder_model_name():
    return os.getenv("LLM_CODER_PATH", "wizardcoder")
