from __future__ import annotations

import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import List, Optional


def _load_env(dotenv: Path) -> None:
    if not dotenv.exists():
        return
    for line in dotenv.read_text(encoding="utf-8").splitlines():
        if not line or line.strip().startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def _spawn(cmd: List[str], cwd: Path) -> subprocess.Popen:
    return subprocess.Popen(
        cmd,
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def _terminate(proc: Optional[subprocess.Popen]) -> None:
    if not proc:
        return
    if proc.poll() is not None:
        return
    try:
        if os.name == "nt":
            proc.terminate()
        else:
            proc.send_signal(signal.SIGTERM)
        proc.wait(timeout=10)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def start_stack(cli_only: bool = False, tiny: bool = False, watch_restart: bool = True) -> None:
    """Start local development stack.

    - If cli_only is True, only the Python agent runs.
    - If tiny is True, set tiny Transformers CPU preset env vars.
    - When watch_restart is True, monitor .forgekeeper/restart.flag and restart services when set.
    """
    here = Path(__file__).resolve()
    project_root = here.parents[2]  # repo/forgekeeper
    dotenv = project_root / ".env"
    _load_env(dotenv)

    if tiny:
        os.environ["LLM_BACKEND"] = "transformers"
        os.environ["USE_TINY_MODEL"] = "true"
        os.environ["FK_DEVICE"] = "cpu"

    # Detect npm; fall back to CLI-only if missing
    npm_available = True
    try:
        subprocess.run(["npm", "-v"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        npm_available = False
        cli_only = True

    agents: List[subprocess.Popen] = []

    def launch() -> None:
        # Backend + Frontend
        if not cli_only and npm_available:
            agents.append(_spawn(["npm", "run", "dev", "--prefix", "backend"], project_root))
            agents.append(_spawn(["npm", "run", "dev", "--prefix", "frontend"], project_root))
        # Python agent
        py = sys.executable or "python"
        agents.append(_spawn([py, "-m", "forgekeeper", "pipeline"], project_root))

    def shutdown_all() -> None:
        while agents:
            _terminate(agents.pop())

    def watch_loop() -> None:
        flag = project_root / ".forgekeeper" / "restart.flag"
        flag.parent.mkdir(parents=True, exist_ok=True)
        while True:
            time.sleep(3)
            if flag.exists():
                try:
                    flag.unlink()
                except Exception:
                    pass
                shutdown_all()
                launch()

    try:
        launch()
        t: Optional[threading.Thread] = None
        if watch_restart:
            t = threading.Thread(target=watch_loop, daemon=True)
            t.start()
        # Block until interrupted
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        shutdown_all()

