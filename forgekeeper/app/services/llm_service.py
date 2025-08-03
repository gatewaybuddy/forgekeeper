import os
import requests
import json
import re
from forgekeeper.functions.list_functions import list_functions
from forgekeeper.functions.describe_function import describe_function
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.app.utils.prompt_guard import verify_prompt


logger = get_logger(__name__, debug=DEBUG_MODE)


LLM_API_URL = os.getenv("LLM_API_URL", "http://localhost:1234/v1/completions")
LLM_MODE = os.getenv("LLM_MODE", "chat")  # "chat" or "completion"
LLM_PROMPT_STYLE = os.getenv("LLM_PROMPT_STYLE", "chatml")  # "chatml" or "plain"
MODEL_NAME = os.getenv("LLM_MODEL_NAME", "internlm")

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


def ask_llm(prompt: str):
    headers = { "Content-Type": "application/json" }
    prompt = verify_prompt(prompt)
    formatted_prompt = format_prompt(prompt)

    if LLM_MODE == "chat":
        payload = {
            "model": MODEL_NAME,
            "messages": [
                { "role": "user", "content": formatted_prompt }
            ],
            "temperature": 0.7,
            "max_tokens": 500
        }
        endpoint = LLM_API_URL.replace("/v1/completions", "/v1/chat/completions")
    else:
        payload = {
            "model": MODEL_NAME,
            "prompt": formatted_prompt,
            "temperature": 0.7,
            "max_tokens": 500
        }
        endpoint = LLM_API_URL

    try:
        logger.debug(f"[LLM REQUEST] POST {endpoint}")
        logger.debug(json.dumps(payload, indent=2))
        logger.info(f"→ Sending request to {endpoint}...")

        # print(f"→ Sending request to {endpoint}...")

        response = requests.post(endpoint, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()

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
