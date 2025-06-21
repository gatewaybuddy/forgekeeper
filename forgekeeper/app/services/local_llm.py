from llama_cpp import Llama

llm = Llama(
    model_path="C:/LLM/models/TheBloke/WizardCoder-Python-34B-V1.0-GGUF/wizardcoder-python-34b-v1.0.Q4_K_S.gguf",
    n_gpu_layers=-1,
    n_ctx=2048
)

def ask_local_llm(prompt: str, max_tokens=512):
    output = llm(prompt, max_tokens=max_tokens, stop=["</s>"])
    return output['choices'][0]['text'].strip()
