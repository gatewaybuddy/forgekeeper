import os
import shutil
import subprocess
import sys
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


@pytest.mark.skipif(os.name != "nt", reason="PowerShell streaming check only on Windows")
def test_ps_streaming_parser_smoke():
    base = _core_base()
    if not _is_up(base):
        pytest.skip(f"Core not running at {base}")

    ps = os.environ.get("COMSPEC") or "pwsh"
    # Use pwsh if available
    ps = "pwsh" if shutil.which("pwsh") else ps

    script = os.path.join(os.path.dirname(__file__), "..", "scripts", "chat_reasoning.ps1")
    script = os.path.abspath(script)
    if not os.path.exists(script):
        pytest.skip("chat_reasoning.ps1 not found")

    # streaming (default)
    p = subprocess.run(["pwsh", "-NoLogo", "-NoProfile", "-File", script, "-Prompt", "Say 'harmony ok'.", "-AutoWait"], capture_output=True, text=True, timeout=30)
    assert p.returncode == 0, p.stderr
    assert "harmony ok" in (p.stdout or "").lower()
