#!/usr/bin/env python3
"""Run a simple backend smoke test.

Builds the backend, starts the server, probes the /health endpoint, and
asserts an HTTP 200 response before shutting the server down.

If the backend directory, npm, or node are missing, the test is skipped.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request


PORT = int(os.getenv("PORT", "4000"))
URL = f"http://localhost:{PORT}/health"


def main() -> None:
    missing: list[str] = []
    if not os.path.isdir("backend"):
        missing.append("backend/")
    if shutil.which("npm") is None:
        missing.append("npm")
    if shutil.which("node") is None:
        missing.append("node")
    if missing:
        print("Skipping backend smoke test; missing " + ", ".join(missing))
        return

    subprocess.run(["npm", "ci"], cwd="backend", check=True)
    subprocess.run(["npm", "run", "build"], cwd="backend", check=True)

    proc = subprocess.Popen(
        ["node", "dist/index.js"], cwd="backend", stdout=subprocess.PIPE, stderr=subprocess.STDOUT
    )
    try:
        for _ in range(30):
            time.sleep(1)
            try:
                with urllib.request.urlopen(URL, timeout=1) as resp:
                    if resp.status == 200:
                        return
            except urllib.error.URLError:
                continue
        raise RuntimeError("backend did not become healthy in time")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # pragma: no cover - smoke test error surface
        print(str(exc), file=sys.stderr)
        sys.exit(1)
