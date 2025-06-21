import os
import time
from openai import OpenAI

# Initialize client and model
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")

def ask_llm(prompt: str, system_message: str = None) -> str:
    messages = []

    if system_message:
        messages.append({"role": "system", "content": system_message})

    messages.append({"role": "user", "content": prompt})

    print("\n[ask_llm] Sending prompt to OpenAI...\n")
    print(f"[Model] {MODEL}")
    print(f"[System Message] {system_message[:100] + '...' if system_message else '(None)'}")
    print(f"[Prompt Preview] {prompt[:400]}...\n")

    start = time.time()
    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=0.7,
        max_tokens=1000,
    )
    elapsed = time.time() - start

    print(f"[ask_llm] Response received in {elapsed:.2f} seconds\n")

    return response.choices[0].message.content.strip()
