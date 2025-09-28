#!/usr/bin/env python3
import os
import sys
import json
import time

try:
    from openai import OpenAI
except Exception as e:
    print("openai package not installed.\nTry: pip install openai", file=sys.stderr)
    raise


def main():
    base = os.getenv("FK_CORE_API_BASE", "http://localhost:8001")
    api_base = base.rstrip("/") + "/v1"
    api_key = os.getenv("OPENAI_API_KEY", "dev-key")

    print(f"Using OpenAI-compatible base: {api_base}")
    client = OpenAI(base_url=api_base, api_key=api_key)

    model = os.getenv("VLLM_MODEL_CORE", "local")
    # Minimal chat completion; if Harmony headers/formatting are required later,
    # we can extend this to set appropriate request params or headers.
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": "Say 'harmony ok' and nothing else."},
            ],
            temperature=0.1,
            max_tokens=16,
        )
    except Exception as e:
        print(f"Request failed: {e}", file=sys.stderr)
        sys.exit(2)

    # Basic validation
    if not hasattr(resp, "choices") or not resp.choices:
        print("No choices in response; unexpected format", file=sys.stderr)
        print(json.dumps(resp.model_dump(), indent=2))
        sys.exit(3)

    msg = resp.choices[0].message
    content = getattr(msg, "content", None)
    print("Assistant:", content)
    if not content or "harmony ok" not in content.lower():
        print("Unexpected content; check formatting/backends", file=sys.stderr)
        sys.exit(4)

    print("PASS: basic chat completion works")


if __name__ == "__main__":
    main()

