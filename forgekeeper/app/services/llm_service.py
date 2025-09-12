import os
import requests
import json
import re
import time
from pathlib import Path
from forgekeeper.functions.list_functions import list_functions
from forgekeeper.functions.describe_function import describe_function
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE, USE_TINY_MODEL
from forgekeeper.app.utils.prompt_guard import verify_prompt


logger = get_logger(__name__, debug=DEBUG_MODE)


LLM_API_URL = os.getenv("LLM_API_URL", "http://localhost:1234/v1/completions")
LLM_MODE = os.getenv("LLM_MODE", "chat")  # "chat" or "completion"
LLM_PROMPT_STYLE = os.getenv("LLM_PROMPT_STYLE", "chatml")  # "chatml" or "plain"
MODEL_NAME = os.getenv("LLM_MODEL_NAME", "internlm")

_CFG_PATH = Path('.forgekeeper/runtime_config.json')
_cfg_cache: dict | None = None
_cfg_mtime: float | None = None

def _runtime_config() -> dict:
    global _cfg_cache, _cfg_mtime
    try:
        mtime = _CFG_PATH.stat().st_mtime
    except FileNotFoundError:
        _cfg_cache = {}
        _cfg_mtime = None
        return {}
    if _cfg_cache is not None and _cfg_mtime == mtime:
        return _cfg_cache
    try:
        data = json.loads(_CFG_PATH.read_text(encoding='utf-8'))
        _cfg_cache = data if isinstance(data, dict) else {}
        _cfg_mtime = mtime
        return _cfg_cache
    except Exception:
        return _cfg_cache or {}

def extract_json(text):
    # Strip any <|action_start|>...<|action_end|> blocks
    text = re.sub(r"<\|action_start\|>.*?<\|action_end\|>", "", text, flags=re.DOTALL)
    
    try:
        return json.loads(text)
    except:
        pass

    match = re.search(r'(\{.*?\}|\[.*?\])', text, re.DOTALL)
    if match:
        snippet = match.group(1)
        try:
            return json.loads(snippet)
        except:
            return {"response": snippet}

    return {"response": text.strip()}


def format_prompt(prompt: str):
    if LLM_PROMPT_STYLE == "chatml":
        return (
            "<|im_start|>user\n"
            f"{prompt.strip()}\n"
            "<|im_end|>\n"
            "<|im_start|>assistant\n"
        )
    return prompt


def _fallback_transformers(prompt: str, max_tokens: int = 500) -> str:
    try:
        from forgekeeper.llm import get_llm

        provider = get_llm()
        # For local providers, max_new_tokens is the relevant kwarg
        text = provider.generate(prompt, max_new_tokens=max_tokens)
        return text if isinstance(text, str) else str(text)
    except Exception as e:
        return f"[fallback-error] {e}"


def ask_llm(prompt: str):
    cfg = _runtime_config()
    model_name = str(cfg.get('model') or MODEL_NAME)
    temperature = float(cfg.get('temperature') or 0.7)
    top_p = float(cfg.get('top_p') or 1.0)
    api_url = str(cfg.get('gateway') or LLM_API_URL)
    backend = str(cfg.get('backend') or os.getenv('LLM_BACKEND') or '').lower()
    # Default to tiny model locally if nothing configured
    no_model_saved = 'model' not in cfg or not cfg.get('model')
    no_gateway = 'gateway' not in cfg or not cfg.get('gateway')
    use_tiny_default = no_model_saved and no_gateway
    if use_tiny_default:
        os.environ.setdefault('USE_TINY_MODEL', 'true')
        os.environ.setdefault('FK_DEVICE', 'cpu')
        backend = backend or 'transformers'
    headers = { "Content-Type": "application/json" }
    prompt = verify_prompt(prompt)
    formatted_prompt = format_prompt(prompt)

    # If explicitly using transformers backend (or tiny default), bypass HTTP and use local provider
    if backend == 'transformers':
        formatted_prompt = format_prompt(prompt)
        text = _fallback_transformers(formatted_prompt, max_tokens=500)
        return extract_json(text)

    if LLM_MODE == "chat":
        payload = {
            "model": model_name,
            "messages": [
                { "role": "user", "content": formatted_prompt }
            ],
            "temperature": temperature,
            "top_p": top_p,
            "max_tokens": 500
        }
        endpoint = api_url.replace("/v1/completions", "/v1/chat/completions")
    else:
        payload = {
            "model": model_name,
            "prompt": formatted_prompt,
            "temperature": temperature,
            "top_p": top_p,
            "max_tokens": 500
        }
        endpoint = api_url

    try:
        logger.debug(f"[LLM REQUEST] POST {endpoint}")
        logger.debug(json.dumps(payload, indent=2))
        logger.info(f"→ Sending request to {endpoint}...")

        # print(f"→ Sending request to {endpoint}...")

        try:
            response = requests.post(endpoint, headers=headers, json=payload, timeout=15)
            response.raise_for_status()
            data = response.json()
        except Exception:
            # Fallback to local tiny model when nothing configured or on transport errors
            if use_tiny_default or USE_TINY_MODEL:
                text = _fallback_transformers(formatted_prompt, max_tokens=500)
                return extract_json(text)
            raise

        # Handle both chat and completion responses
        text = (
            data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
            .strip()
        )

        if not text:
            text = (
                data.get("choices", [{}])[0]
                .get("text", "")
                .strip()
            )

        logger.debug(f"[LLM RESPONSE] Raw: {text}")
        return extract_json(text)

    except Exception as e:
        logger.error(f"[LLM ERROR] {e}")
        return {"error": str(e)}
