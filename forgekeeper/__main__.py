from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import sys
import time
import hashlib
import json
from pathlib import Path


def _compose_down(compose_file: str | None, stop_only: bool = False) -> int:
    root = Path(__file__).resolve().parents[1]
    cf = compose_file or "docker-compose.yml"
    cmd = [shutil.which("docker") or "docker", "compose", "-f", str(root / cf)]
    cmd += ["stop"] if stop_only else ["down"]
    return subprocess.call(cmd)


def _run_compose() -> int:
    # Default path: ensure full stack up (build + optional mongo), then tear down on exit.
    # Uses the ensure-stack scripts so behavior is idempotent across platforms.
    print("Ensuring stack via ensure-stack (build + profiles); Ctrl+C to tear down.")
    compose_file = "docker-compose.yml"
    # Record compose and env file hashes before startup
    root = Path(__file__).resolve().parents[1]
    cf_path = root / compose_file
    env_path = root / ".env"
    def _hash(path: Path) -> str:
        try:
            data = path.read_bytes()
            return hashlib.sha256(data).hexdigest()
        except Exception:
            return ""
    compose_hash_before = _hash(cf_path)
    env_hash_before = _hash(env_path)

    # Decide whether to rebuild images: only when config (compose/.env) changed since last run
    state_dir = root / ".forgekeeper"
    state_path = state_dir / "stack_fingerprint.json"
    prev = {}
    try:
        if state_path.exists():
            prev = json.loads(state_path.read_text())
    except Exception:
        prev = {}
    curr_fingerprint = {
        "compose": compose_hash_before,
        "env": env_hash_before,
        "compose_file": str(cf_path),
    }
    should_build = (prev != curr_fingerprint)

    # Prefer only UI + inference profiles for a clean default
    profiles = ["ui", "inference"]
    rc = _run_ensure_stack(build=should_build, include_mongo=False, profiles=profiles, compose_file=compose_file)
    if rc != 0:
        # Fallback to legacy start wrappers only if ensure fails or missing
        print("ensure-stack failed; attempting legacy start script...", file=sys.stderr)
        root = Path(__file__).resolve().parents[1]
        if platform.system() == "Windows":
            ps1 = root / "start.ps1"
            shell = shutil.which("pwsh") or shutil.which("powershell") or shutil.which("powershell.exe")
            if not shell or not ps1.exists():
                print("PowerShell (pwsh) and start.ps1 are required on Windows", file=sys.stderr)
                return 1
            cmd = [shell, "-NoLogo", "-NoProfile", "-File", str(ps1), "-Compose"]
            return subprocess.call(cmd)
        else:
            sh = root / "start.sh"
            bash = shutil.which("bash")
            if not bash or not sh.exists():
                print("bash and start.sh are required on this platform", file=sys.stderr)
                return 1
            cmd = [bash, str(sh), "--compose"]
            return subprocess.call(cmd)
    # Persist fingerprint now so next run can skip rebuild if nothing changed
    try:
        state_dir.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(curr_fingerprint))
    except Exception:
        pass

    # Print friendly URLs
    def _get_env_value(path: Path, key: str, default: str) -> str:
        try:
            for line in path.read_text().splitlines():
                s = line.strip()
                if not s or s.startswith('#'):
                    continue
                if '=' in s:
                    k, v = s.split('=', 1)
                    if k.strip() == key:
                        return v.strip()
        except Exception:
            pass
        return default

    frontend_port = _get_env_value(env_path, 'FRONTEND_PORT', '3000')
    vllm_core_port = _get_env_value(env_path, 'VLLM_PORT_CORE', '8001')
    print(f"Forgekeeper UI: http://localhost:{frontend_port}")
    print(f"Frontend health: http://localhost:{frontend_port}/health-ui")
    print(f"vLLM Core API: http://localhost:{vllm_core_port}/v1")

    # Hold foreground; teardown on Ctrl+C
    try:
        print("Starting services in this window. Press Ctrl+C to stop all.")
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        # Persist current fingerprint for next run
        try:
            state_dir.mkdir(parents=True, exist_ok=True)
            state_path.write_text(json.dumps(curr_fingerprint))
        except Exception:
            pass
        # Compare compose and .env hashes; if unchanged, only stop containers for faster restart
        compose_hash_after = _hash(cf_path)
        env_hash_after = _hash(env_path)
        unchanged = (
            compose_hash_after == compose_hash_before and
            env_hash_after == env_hash_before and
            (compose_hash_before != "" or env_hash_before != "")
        )
        action = "stop" if unchanged else "down"
        print(
            "Shutting services with 'docker compose {act}' (compose/env {state})...".format(
                act=action,
                state='unchanged' if unchanged else 'changed'
            )
        )
        _compose_down(compose_file, stop_only=unchanged)
        print("Done.")
        return 0


def _run_up_core() -> int:
    root = Path(__file__).resolve().parents[1]
    # Prefer idempotent ensure script: starts if missing, recreates only if config changed
    if platform.system() == "Windows":
        ps1 = root / "scripts" / "ensure_vllm_core.ps1"
        shell = shutil.which("pwsh") or shutil.which("powershell") or shutil.which("powershell.exe")
        if shell and ps1.exists():
            return subprocess.call([shell, "-NoLogo", "-NoProfile", "-File", str(ps1), "-ProjectDir", str(root), "-ComposeFile", "docker-compose.yml", "-AutoBuild"])
    # Fallback: prefer shell ensure script if present
    sh_ensure = root / "scripts" / "ensure_vllm_core.sh"
    bash = shutil.which("bash")
    if bash and sh_ensure.exists():
        env = os.environ.copy()
        env["PROJECT_DIR"] = str(root)
        env["COMPOSE_FILE"] = "docker-compose.yml"
        env["AUTO_BUILD"] = "1"
        return subprocess.call([bash, str(sh_ensure)], env=env)
    # Final fallback: bring up via docker compose
    cmd = [shutil.which("docker") or "docker", "compose", "-f", str(root / "docker-compose.yml"), "up", "-d", "--build", "vllm-core"]
    return subprocess.call(cmd)


def _run_ensure_stack(build: bool, include_mongo: bool, profiles: list[str] | None, compose_file: str | None) -> int:
    root = Path(__file__).resolve().parents[1]
    # Prefer platform-native ensure scripts
    if platform.system() == "Windows":
        ps1 = root / "scripts" / "ensure_stack.ps1"
        shell = shutil.which("pwsh") or shutil.which("powershell") or shutil.which("powershell.exe")
        if shell and ps1.exists():
            cmd = [shell, "-NoLogo", "-NoProfile", "-File", str(ps1), "-ProjectDir", str(root)]
            if compose_file:
                cmd += ["-ComposeFile", compose_file]
            if profiles:
                # PowerShell array parameter should be passed once; comma-separated is accepted
                cmd += ["-Profiles", ",".join(profiles)]
            if build:
                cmd += ["-Build"]
            if include_mongo:
                cmd += ["-IncludeMongo"]
            return subprocess.call(cmd)
    # Shell fallback
    sh_file = root / "scripts" / "ensure_stack.sh"
    bash = shutil.which("bash")
    if bash and sh_file.exists():
        env = os.environ.copy()
        env["PROJECT_DIR"] = str(root)
        if compose_file:
            env["COMPOSE_FILE"] = compose_file
        if profiles:
            env["PROFILES_OVERRIDE"] = " ".join(profiles)
        env["BUILD"] = "1" if build else "0"
        env["INCLUDE_MONGO"] = "1" if include_mongo else "0"
        return subprocess.call([bash, str(sh_file)], env=env)
    print("No ensure-stack script found; expected scripts/ensure_stack.ps1 or .sh", file=sys.stderr)
    return 1


def _run_chat(prompt: str, base_url: str | None, model: str | None, no_stream: bool) -> int:
    root = Path(__file__).resolve().parents[1]
    if platform.system() == "Windows":
        ps1 = root / "scripts" / "chat_reasoning.ps1"
        shell = shutil.which("pwsh") or shutil.which("powershell") or shutil.which("powershell.exe")
        if not shell or not ps1.exists():
            print("PowerShell chat script not found; ensure pwsh and scripts/chat_reasoning.ps1 exist", file=sys.stderr)
            return 1
        cmd = [shell, "-NoLogo", "-NoProfile", "-File", str(ps1), "-Prompt", prompt]
        if base_url:
            cmd += ["-BaseUrl", base_url]
        if model:
            cmd += ["-Model", model]
        if no_stream:
            cmd += ["-NoStream"]
        return subprocess.call(cmd)
    else:
        # Minimal Python fallback using the basic test (non-streaming)
        py = shutil.which("python3") or shutil.which("python") or sys.executable
        script = root / "scripts" / "test_harmony_basic.py"
        env = os.environ.copy()
        if base_url:
            env["FK_CORE_API_BASE"] = base_url
        if model:
            env["VLLM_MODEL_CORE"] = model
        # Reuse the test harness to validate connectivity and print the content
        return subprocess.call([py, str(script)], env=env)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Forgekeeper launcher (fresh start)")
    sub = p.add_subparsers(dest="cmd")

    s_comp = sub.add_parser("compose", help="Ensure full stack (build), hold FG; Ctrl+C tears down")

    s_upc = sub.add_parser("up-core", help="Start only vLLM Core via compose")

    s_chat = sub.add_parser("chat", help="Send a prompt and stream reasoning/final")
    s_chat.add_argument("-p", "--prompt", required=False, default="", help="Prompt text (reads stdin if omitted)")
    s_chat.add_argument("--base-url", dest="base_url", default=None)
    s_chat.add_argument("--model", dest="model", default=None)
    s_chat.add_argument("--no-stream", dest="no_stream", action="store_true")

    s_ens = sub.add_parser("ensure-stack", help="Idempotently ensure full stack is up (profiles, optional mongo)")
    s_ens.add_argument("--build", dest="build", action="store_true", help="Build images before starting")
    s_ens.add_argument("--include-mongo", dest="include_mongo", action="store_true", help="Also ensure MongoDB is up")
    s_ens.add_argument("--profile", dest="profiles", action="append", default=None, help="Compose profile to enable (repeat)")
    s_ens.add_argument("--compose-file", dest="compose_file", default=None, help="Compose file path (defaults to script's)")

    args = p.parse_args(argv)

    if args.cmd == "compose" or args.cmd is None:
        rc = _run_compose()
        if rc != 0:
            # Fallback to a lighter path and provide a hint
            print("Compose start failed or was cancelled; bringing up Core only...", file=sys.stderr)
            rc2 = _run_up_core()
            if rc2 == 0:
                print("vLLM Core started. Try: python -m forgekeeper chat -p 'Hello'", file=sys.stderr)
            return rc2
        return 0
    if args.cmd == "up-core":
        return _run_up_core()
    if args.cmd == "chat":
        return _run_chat(args.prompt, args.base_url, args.model, args.no_stream)
    if args.cmd == "ensure-stack":
        return _run_ensure_stack(args.build, args.include_mongo, args.profiles, args.compose_file)

    p.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
