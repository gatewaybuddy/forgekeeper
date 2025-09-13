from __future__ import annotations

import argparse
import asyncio
import importlib
import os
import platform
import shutil
import sys
from pathlib import Path
from typing import Iterable

import uvicorn

from forgekeeper_v2.orchestrator.adapters import ToolPowerShell, ToolShell
from forgekeeper_v2.orchestrator.events import Watermark
from forgekeeper_v2.orchestrator.orchestrator import Orchestrator
from forgekeeper_v2.ui.server import create_app


PY_REQS = [
    ("pydantic", "pydantic"),
    ("fastapi", "fastapi"),
    ("uvicorn", "uvicorn"),
    ("websockets", "websockets"),
]


def _missing_modules(reqs: Iterable[tuple[str, str]]) -> list[str]:
    missing: list[str] = []
    for mod, pip_name in reqs:
        try:
            importlib.import_module(mod)
        except Exception:
            missing.append(pip_name)
    return missing


def _check_tools() -> dict[str, bool]:
    system = platform.system()
    return {
        "powershell.exe": shutil.which("powershell.exe") is not None if system == "Windows" else False,
        "pwsh": shutil.which("pwsh") is not None,
        "sh": shutil.which("sh") is not None,
        "cmd.exe": shutil.which("cmd.exe") is not None if system == "Windows" else False,
    }


def install_packages(pkgs: list[str]) -> int:
    if not pkgs:
        return 0
    cmd = [sys.executable, "-m", "pip", "install", *pkgs]
    return os.system(" ".join(cmd))


def do_check(install_yes: bool = False) -> int:
    missing = _missing_modules(PY_REQS)
    tools = _check_tools()
    print("Python packages missing:", missing or "None")
    print("Tools:", tools)
    if missing and install_yes:
        print("Installing:", missing)
        rc = install_packages(missing)
        return 0 if rc == 0 else 1
    return 0 if not missing else 1


async def _run_demo(duration: float) -> None:
    wm = Watermark()
    tools = [ToolShell(wm), ToolPowerShell(wm)]
    orch = Orchestrator(tools=tools)
    app = create_app(Path(".forgekeeper-v2/events.jsonl"))
    config = uvicorn.Config(app=app, host="127.0.0.1", port=8787, log_level="info")
    server = uvicorn.Server(config)

    async def _server():
        await server.serve()

    async def _orch():
        await orch.run(duration_s=duration)
        server.should_exit = True

    await asyncio.gather(_server(), _orch())


def main(argv: list[str] | None = None) -> None:  # pragma: no cover
    p = argparse.ArgumentParser(description="Forgekeeper v2 CLI")
    sub = p.add_subparsers(dest="cmd")

    s_demo = sub.add_parser("demo", help="Run duet demo (LLM mocks + tools + server)")
    s_demo.add_argument("--duration", type=float, default=8.0, help="Seconds to run")

    s_run = sub.add_parser("run", help="Run orchestrator loop")
    s_run.add_argument("--duration", type=float, default=0.0, help="Seconds (0=forever)")
    s_run.add_argument("--no-tools", action="store_true", help="Disable tools")

    s_srv = sub.add_parser("server", help="Run UI server only")
    s_srv.add_argument("--host", default="127.0.0.1")
    s_srv.add_argument("--port", type=int, default=8787)

    s_chk = sub.add_parser("check", help="Check runtime dependencies")
    s_chk.add_argument("--install-yes", action="store_true", help="Install missing Python packages")

    args = p.parse_args(argv)
    if args.cmd == "check":
        code = do_check(install_yes=args.install_yes)
        raise SystemExit(code)
    if args.cmd == "server":
        app = create_app(Path(".forgekeeper-v2/events.jsonl"))
        uvicorn.run(app, host=args.host, port=args.port)
        return
    if args.cmd == "demo":
        asyncio.run(_run_demo(args.duration))
        return
    if args.cmd == "run":
        wm = Watermark()
        tools = [] if args.no_tools else [ToolShell(wm), ToolPowerShell(wm)]
        orch = Orchestrator(tools=tools)
        dur = None if args.duration <= 0 else args.duration
        asyncio.run(orch.run(duration_s=dur))
        return
    p.print_help()

