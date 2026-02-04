import os
import sys
import json
import socket
import contextlib
import time

import pytest


def _core_base():
    return os.getenv("FK_CORE_API_BASE", "http://localhost:8001")


def _is_up(url: str) -> bool:
    import urllib.request
    urls = [url.rstrip("/") + "/v1/models", url.rstrip("/") + "/health", url.rstrip("/") + "/healthz"]
    deadline = time.time() + 1.5
    while time.time() < deadline:
        for u in urls:
            try:
                with urllib.request.urlopen(u, timeout=0.5) as r:
                    if 200 <= getattr(r, "status", 200) < 500:
                        return True
            except Exception:
                pass
        time.sleep(0.1)
    return False


@pytest.mark.skipif("OPENAI_API_KEY" not in os.environ and True, reason="uses dev-key; harmless")
def test_openai_chat_non_stream_smoke():
    base = _core_base()
    if not _is_up(base):
        pytest.skip("Core not running on {}".format(base))

    try:
        from openai import OpenAI
    except Exception:
        pytest.skip("openai package missing")

    client = OpenAI(base_url=base.rstrip("/") + "/v1", api_key=os.getenv("OPENAI_API_KEY", "dev-key"))
    model = os.getenv("VLLM_MODEL_CORE", "local")
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Say 'harmony ok' only."},
        ],
        temperature=0.1,
        max_tokens=16,
    )

    assert hasattr(resp, "choices") and resp.choices, "missing choices"
    msg = resp.choices[0].message
    content = getattr(msg, "content", None)
    assert content and "harmony ok" in content.lower()

