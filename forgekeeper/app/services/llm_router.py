import os
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.app.utils.prompt_guard import verify_prompt

BACKEND = os.getenv("LLM_BACKEND", "vllm").lower()
log = get_logger(__name__, debug=DEBUG_MODE)
log.debug("Backend from env: %s", os.getenv("LLM_BACKEND"))

# === Backend Setup ===
if BACKEND == "openai":
    # Use OpenAI‑compatible Harmony backend for both core and coder
    from forgekeeper.app.services.harmony.service import ask_llm as backend_ask

    SYSTEM_MESSAGE = os.getenv("OPENAI_SYSTEM_PROMPT", "")
    REASONING = os.getenv("OPENAI_REASONING_EFFORT")

    def ask_llm(prompt: str):
        prompt = verify_prompt(prompt)
        return backend_ask(prompt, system_message=SYSTEM_MESSAGE, reasoning=REASONING)

    def ask_coder(prompt: str):
        prompt = verify_prompt(prompt)
        return backend_ask(prompt, system_message=SYSTEM_MESSAGE, reasoning=REASONING)

elif BACKEND == "vllm":
    from forgekeeper.llm.llm_service_vllm import llm_core, llm_coder

    def ask_llm(prompt: str):
        prompt = verify_prompt(prompt)
        return llm_core.ask(prompt)

    def ask_coder(prompt: str):
        prompt = verify_prompt(prompt)
        return llm_coder.ask(prompt)

elif BACKEND == "llama_cpp":
    from forgekeeper.llm.llama_cpp_impl import LlamaCppLLMProvider

    provider = LlamaCppLLMProvider()

    def ask_llm(prompt: str):
        prompt = verify_prompt(prompt)
        return provider.generate(prompt)

    def ask_coder(prompt: str):
        prompt = verify_prompt(prompt)
        return provider.generate(prompt)

else:  # pragma: no cover - environment misconfiguration
    raise ValueError(f"Unsupported LLM_BACKEND: {BACKEND}")

# === Metadata/Display ===
def get_backend():
    return BACKEND

def get_core_model_name():
    if BACKEND == "openai":
        return os.getenv("OPENAI_MODEL", "gpt-4o")
    if BACKEND == "llama_cpp":
        return os.getenv("FK_MODEL_PATH", "unknown")
    return os.getenv("VLLM_MODEL_CORE", "mistral-nemo-instruct")


def get_coder_model_name():
    if BACKEND == "openai":
        return os.getenv("OPENAI_MODEL", "gpt-4o")
    if BACKEND == "llama_cpp":
        return os.getenv("FK_MODEL_PATH", "unknown")
    return os.getenv("VLLM_MODEL_CODER", "codellama-13b-python")
