from llama_cpp import Llama
import os
from dotenv import load_dotenv

load_dotenv()

# Always load coder model
llm_coder = Llama(
    model_path=os.getenv("LLM_CODER_PATH"),
    n_ctx=int(os.getenv("LLM_CONTEXT_SIZE", 4096)),
    n_threads=int(os.getenv("LLM_THREADS", 8)),
    n_gpu_layers=int(os.getenv("LLM_GPU_LAYERS", 0)),
    verbose=False
)

# Conditionally load core model if backend is llama
llm_core = None
if os.getenv("LLM_BACKEND", "llamacpp").lower() == "llamacpp":
    llm_core = Llama(
        model_path=os.getenv("LLM_CORE_PATH"),
        n_ctx=int(os.getenv("LLM_CONTEXT_SIZE", 4096)),
        n_threads=int(os.getenv("LLM_THREADS", 8)),
        n_gpu_layers=int(os.getenv("LLM_GPU_LAYERS", 0)),
        verbose=False
    )
