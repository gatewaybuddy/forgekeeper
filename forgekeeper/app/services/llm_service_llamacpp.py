import os
import json
import re
from forgekeeper.app.utils.json_helpers import extract_json
from forgekeeper.app.shared.models import llm_core, llm_coder
def ask_llm(prompt: str):
    return extract_json(llm_core.ask(prompt))

from llama_cpp import Llama
from forgekeeper.app.chats.memory_store import (
    load_memory, save_message,
    get_think_aloud, summarize_thoughts,
    request_think_aloud, set_think_aloud,
    grant_think_aloud_consent
)
import forgekeeper.load_env

# 🌱 Load environment
MODEL_PATH = os.getenv("LLM_MODEL_PATH", "./models/your-model.gguf")
N_CTX = int(os.getenv("LLM_CONTEXT_SIZE", "4096"))
N_THREADS = int(os.getenv("LLM_THREADS", "8"))
N_GPU_LAYERS = int(os.getenv("LLM_GPU_LAYERS", "0"))
MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "500"))

# 🚀 Initialize llama-cpp model
# print("Loaded model path from .env:", MODEL_PATH)
# llm = Llama(
#     model_path=MODEL_PATH,
#     n_ctx=N_CTX,
#     n_threads=N_THREADS,
#     n_gpu_layers=N_GPU_LAYERS,
#     verbose=False
# )
# 📤 Ask the model and parse the response
def ask_llm(prompt: str):
    try:
        return extract_json(llm_core.ask(prompt))
    except Exception as e:
        return {"error": str(e)}


# 🧠 Construct a layered prompt from session memory
def format_prompt_with_layers(session_id):
    memory = load_memory(session_id)
    shared = memory.get("shared", [])
    internal = memory.get("internal", [])
    think_aloud = memory.get("think_aloud", False)

    prompt = "[SYS]\nYou are ForgeKeeper, an AI assistant. Respond only after receiving a user input block. You may simulate internal thoughts, but only share them if 'think_aloud' is active.\n[/SYS]\n"

    def format_block(message):
        if message["role"] == "user":
            return f"[INST] {message['content']} [/INST]"
        elif message["role"] == "assistant":
            return f"[SYS] {message['content']} [/SYS]"
        return ""

    all_msgs = shared
    if think_aloud:
        all_msgs += [{"role": "internal", "content": "-- Internal Thoughts --"}] + internal

    for msg in all_msgs:
        if msg["role"] in ["user", "assistant"]:
            prompt += format_block(msg) + "\n"
        elif think_aloud and msg["role"] == "internal":
            prompt += f"[SYS] (Internal) {msg['content']} [/SYS]\n"

    return prompt

# 🔁 Fallback for formatting raw history into prompts (non-layered)
def format_history_as_prompt(history):
    prompt = ""
    for message in history:
        if message["role"] == "user":
            prompt += f"[INST] {message['content']} [/INST]\n"
        elif message["role"] == "assistant":
            prompt += f"[SYS] {message['content']} [/SYS]\n"
    return prompt

def _llm_ask(self, prompt: str):
    try:
        output = self(prompt, max_tokens=MAX_TOKENS, stop=["<|endoftext|>"])
        return output['choices'][0]['text'].strip()
    except Exception as e:
        return f"[ERROR] {str(e)}"

# Patch the method directly onto the Llama object
setattr(Llama, "ask", _llm_ask)
