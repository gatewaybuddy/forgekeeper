import os
import time
from openai import OpenAI
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.app.utils.prompt_guard import verify_prompt

# Initialize client and model
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
log = get_logger(__name__, debug=DEBUG_MODE)

def ask_llm(prompt: str, system_message: str = None) -> str:
    messages = []
    prompt = verify_prompt(prompt)

    if system_message:
        messages.append({"role": "system", "content": system_message})

    messages.append({"role": "user", "content": prompt})

    log.info("\n[ask_llm] Sending prompt to OpenAI...\n")
    log.info(f"[Model] {MODEL}")
    log.debug(f"[System Message] {system_message[:100] + '...' if system_message else '(None)'}")
    log.debug(f"[Prompt Preview] {prompt[:400]}...\n")

    start = time.time()
    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=0.7,
        max_tokens=1000,
    )
    elapsed = time.time() - start

    log.info(f"[ask_llm] Response received in {elapsed:.2f} seconds\n")

    return response.choices[0].message.content.strip()
