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


def _load_dotenv(env_path: Path) -> None:
    """Load .env file into os.environ if it exists."""
    if not env_path.exists():
        return
    try:
        for line in env_path.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip()
                # Only set if not already in environment (env vars take precedence)
                if key and key not in os.environ:
                    os.environ[key] = value
    except Exception:
        pass


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

    # Load .env into environment so FK_CORE_KIND and other vars are available
    _load_dotenv(env_path)
    def _hash(path: Path) -> str:
        try:
            data = path.read_bytes()
            return hashlib.sha256(data).hexdigest()
        except Exception:
            return ""
    compose_hash_before = _hash(cf_path)
    env_hash_before = _hash(env_path)
    # Include a fingerprint of the frontend sources so image rebuilds trigger correctly
    def _dir_hash(base: Path, excludes: list[str] | None = None) -> str:
        try:
            ex = set(excludes or [])
            h = hashlib.sha256()
            for p in sorted(base.rglob('*')):
                if any(part in ex for part in p.parts):
                    continue
                if p.is_file():
                    h.update(str(p.relative_to(base)).encode())
                    try:
                        h.update(p.read_bytes())
                    except Exception:
                        pass
            return h.hexdigest()
        except Exception:
            return ""
    frontend_hash = _dir_hash(root / 'frontend', excludes=['node_modules', 'dist'])

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
        "frontend": frontend_hash,
        "compose_file": str(cf_path),
    }
    should_build = (prev != curr_fingerprint)

    # Prefer only UI + inference profiles for a clean default; switch based on FK_CORE_KIND
    core_kind = os.getenv("FK_CORE_KIND", "llama").strip().lower()
    gpu_pref = os.getenv("FK_CORE_GPU", "1").strip()
    if core_kind == "vllm":
        profiles = ["ui", "inference-vllm"]
    else:
        profiles = ["ui", "inference-cpu"] if gpu_pref == "0" else ["ui", "inference"]
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
            for line in path.read_text(encoding='utf-8').splitlines():
                s = line.strip()
                if not s or s.startswith('#'):
                    continue
                if '=' in s:
                    k, v = s.split('=', 1)
                    # Strip both key and value to handle any whitespace/line endings
                    if k.strip() == key:
                        return v.strip()
        except Exception as e:
            # Debug: print error if file can't be read
            import sys
            print(f"Warning: Could not read {key} from {path}: {e}", file=sys.stderr)
        return default

    frontend_port = _get_env_value(env_path, 'FRONTEND_PORT', '5173')
    # Prefer llama/localai core port; fall back to legacy vLLM env
    core_port = _get_env_value(env_path, 'LLAMA_PORT_CORE', _get_env_value(env_path, 'VLLM_PORT_CORE', '8001'))
    print(f"Forgekeeper UI: http://localhost:{frontend_port}")
    print(f"Frontend health: http://localhost:{frontend_port}/health-ui")
    print(f"Core API: http://localhost:{core_port}/v1")

    # Optional health wait for the Core (models or health endpoints)
    try:
        import time, urllib.request
        base = _get_env_value(env_path, 'FK_CORE_API_BASE', f'http://localhost:{core_port}')
        urls = [
            base.rstrip('/') + '/v1/models',
            base.rstrip('/') + '/healthz',
            base.rstrip('/') + '/health',
        ]
        deadline = time.time() + 60
        ok = False
        while time.time() < deadline and not ok:
            for url in urls:
                try:
                    with urllib.request.urlopen(url, timeout=3) as r:
                        if 200 <= getattr(r, 'status', 200) < 500:
                            ok = True
                            break
                except Exception:
                    pass
            if not ok:
                time.sleep(2)
        if ok:
            print('Core health check: ok')
        else:
            print('Core health check: pending (may still be loading model)')
    except Exception:
        pass

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
    # Load .env to get FK_CORE_KIND
    _load_dotenv(root / ".env")
    # Prefer idempotent ensure script: starts if missing, recreates only if config changed
    core_kind = os.getenv("FK_CORE_KIND", "llama").strip().lower()
    gpu_pref = os.getenv("FK_CORE_GPU", "1").strip()
    if platform.system() == "Windows":
        ps1 = root / "scripts" / ("ensure_vllm_core.ps1" if core_kind == "vllm" else "ensure_llama_core.ps1")
        shell = shutil.which("pwsh") or shutil.which("powershell") or shutil.which("powershell.exe")
        if shell and ps1.exists():
            return subprocess.call([shell, "-NoLogo", "-NoProfile", "-File", str(ps1), "-ProjectDir", str(root), "-ComposeFile", "docker-compose.yml"])
    # Fallback: prefer shell ensure script if present
    sh_ensure = root / "scripts" / ("ensure_vllm_core.sh" if core_kind == "vllm" else "ensure_llama_core.sh")
    bash = shutil.which("bash")
    if bash and sh_ensure.exists():
        env = os.environ.copy()
        env["PROJECT_DIR"] = str(root)
        env["COMPOSE_FILE"] = "docker-compose.yml"
        return subprocess.call([bash, str(sh_ensure)], env=env)
    # Final fallback: bring up via docker compose
    if core_kind == "vllm":
        service = "vllm-core"
    else:
        service = "llama-core-cpu" if gpu_pref == "0" else "llama-core"
    cmd = [shutil.which("docker") or "docker", "compose", "-f", str(root / "docker-compose.yml"), "up", "-d", service]
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


def _run_chat(prompt: str, base_url: str | None, model: str | None, no_stream: bool, tools: str | None = None, workdir: str | None = None, system: str | None = None) -> int:
    # Tools demo path (Python-only) when --tools is provided
    if tools:
        try:
            from openai import OpenAI  # type: ignore
        except Exception:
            print("openai package not installed. Try: pip install openai", file=sys.stderr)
            return 1

        base = base_url or os.getenv("FK_CORE_API_BASE", "http://localhost:8001")
        api_base = base.rstrip('/') + '/v1'
        client = OpenAI(base_url=api_base, api_key=os.getenv("OPENAI_API_KEY", "dev-key"))
        mdl = model or os.getenv("VLLM_MODEL_CORE", "local")

        # Restrict the tool to a safe workspace root; default to current repo root
        repo_root = Path(__file__).resolve().parents[2]
        safe_root = Path(workdir).resolve() if workdir else repo_root
        try:
            safe_root = safe_root.resolve()
        except Exception:
            safe_root = repo_root

        def _list_dir(arg_path: str | None) -> str:
            p = Path(arg_path or ".")
            if not p.is_absolute():
                p = (safe_root / p).resolve()
            # ensure path stays within safe_root
            try:
                p.relative_to(safe_root)
            except Exception:
                return f"Refusing to list outside of {safe_root}"
            if not p.exists() or not p.is_dir():
                return f"Path not found or not a directory: {p}"
            entries = []
            for i, e in enumerate(p.iterdir()):
                if i >= 50:
                    entries.append("... (truncated)")
                    break
                kind = "dir" if e.is_dir() else "file"
                try:
                    sz = e.stat().st_size if e.is_file() else 0
                except Exception:
                    sz = 0
                entries.append(f"{kind}\t{e.name}\t{sz}")
            rel = str(p)
            return f"Listing of {rel} (max 50):\n" + "\n".join(entries)

        tools_spec = [
            {
                "type": "function",
                "function": {
                    "name": "list_dir",
                    "description": "List files in a directory within the local workspace.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {"type": "string", "description": "Relative path from workspace root"}
                        },
                        "required": []
                    },
                },
            }
        ]

        system = system or (
            "You are a local development assistant. Use the provided tools when helpful. "
            "Do not mention or reference any policy documents. If a tool result is long, summarize succinctly."
        )
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]
        for _ in range(3):
            resp = client.chat.completions.create(
                model=mdl,
                messages=messages,
                tools=tools_spec,
                tool_choice="auto",
                temperature=0.2,
                max_tokens=256,
            )
            choice = resp.choices[0]
            msg = choice.message
            tc = getattr(msg, "tool_calls", None)
            if tc:
                for call in tc:
                    fname = call.function.name
                    import json as _json
                    try:
                        args = _json.loads(call.function.arguments or "{}")
                    except Exception:
                        args = {}
                    if fname == "list_dir":
                        out = _list_dir(args.get("path"))
                    else:
                        out = f"Tool {fname} not implemented."
                    messages.append({"role": "tool", "tool_call_id": call.id, "content": out})
                # continue the loop to let the model observe tool results
                continue
            # no tool calls -> final
            content = getattr(msg, "content", None)
            print(content or "")
            return 0
        # fallback if tools loop didn’t converge
        print("(tools) no final answer produced", file=sys.stderr)
        return 1

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
        if system:
            cmd += ["-System", system]
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

    s_upc = sub.add_parser("up-core", help="Start only Core (llama.cpp) via compose")

    s_chat = sub.add_parser("chat", help="Send a prompt and stream reasoning/final")
    s_chat.add_argument("-p", "--prompt", required=False, default="", help="Prompt text (reads stdin if omitted)")
    s_chat.add_argument("--base-url", dest="base_url", default=None)
    s_chat.add_argument("--model", dest="model", default=None)
    s_chat.add_argument("--no-stream", dest="no_stream", action="store_true", help="Disable streaming (prints final text only)")
    s_chat.add_argument("--tools", dest="tools", choices=["dir"], default=None, help="Enable simple tools demo (Python path) — 'dir' only")
    s_chat.add_argument("--workdir", dest="workdir", default=None, help="Restrict tools to this workspace root (default: repo root)")
    s_chat.add_argument("--system", dest="system", default=None, help="Override system prompt")

    s_ens = sub.add_parser("ensure-stack", help="Idempotently ensure full stack is up (profiles, optional mongo)")
    s_ens.add_argument("--build", dest="build", action="store_true", help="Build images before starting")
    s_ens.add_argument("--include-mongo", dest="include_mongo", action="store_true", help="Also ensure MongoDB is up")
    s_ens.add_argument("--profile", dest="profiles", action="append", default=None, help="Compose profile to enable (repeat)")
    s_ens.add_argument("--compose-file", dest="compose_file", default=None, help="Compose file path (defaults to script's)")

    s_switch = sub.add_parser("switch-core", help="Switch inference core (llama|vllm), update .env, and restart services")
    s_switch.add_argument("kind", choices=["llama", "vllm"], help="Target core backend")
    s_switch.add_argument("--no-restart", dest="no_restart", action="store_true", help="Only update .env; do not restart services")

    args = p.parse_args(argv)

    if args.cmd == "compose" or args.cmd is None:
        rc = _run_compose()
        if rc != 0:
            # Fallback to a lighter path and provide a hint
            print("Compose start failed or was cancelled; bringing up Core only...", file=sys.stderr)
            rc2 = _run_up_core()
            if rc2 == 0:
                print("Core started. Try: python -m forgekeeper chat -p 'Hello'", file=sys.stderr)
            return rc2
        return 0
    if args.cmd == "up-core":
        return _run_up_core()
    if args.cmd == "chat":
        return _run_chat(args.prompt, args.base_url, args.model, args.no_stream, tools=args.tools, workdir=args.workdir, system=args.system)
    if args.cmd == "ensure-stack":
        return _run_ensure_stack(args.build, args.include_mongo, args.profiles, args.compose_file)
    if args.cmd == "switch-core":
        root = Path(__file__).resolve().parents[1]
        env_path = root / ".env"
        target = args.kind.strip().lower()

        # Update .env
        try:
            text = env_path.read_text(encoding="utf-8") if env_path.exists() else ""
        except Exception:
            text = ""
        lines = text.splitlines() if text else []
        out_lines: list[str] = []
        saw_kind = False
        saw_api = False
        for line in lines:
            s = line.strip()
            if s.startswith("FK_CORE_KIND="):
                out_lines.append(f"FK_CORE_KIND={target}")
                saw_kind = True
            elif s.startswith("FK_CORE_API_BASE="):
                base = "http://llama-core:8000" if target == "llama" else "http://vllm-core:8000"
                out_lines.append(f"FK_CORE_API_BASE={base}")
                saw_api = True
            else:
                out_lines.append(line)
        if not saw_kind:
            out_lines.append(f"FK_CORE_KIND={target}")
        if not saw_api:
            base = "http://llama-core:8000" if target == "llama" else "http://vllm-core:8000"
            out_lines.append(f"FK_CORE_API_BASE={base}")
        try:
            env_path.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
        except Exception as e:
            print(f"Failed to update {env_path}: {e}", file=sys.stderr)
            return 1
        print(f"Updated {env_path} → FK_CORE_KIND={target}")

        if args.no_restart:
            return 0

        # Stop the opposite core to avoid port conflicts
        opposite = "vllm-core" if target == "llama" else "llama-core"
        docker = shutil.which("docker") or "docker"
        try:
            subprocess.call([docker, "compose", "-f", str(root / "docker-compose.yml"), "stop", opposite])
        except Exception:
            pass

        # Restart stack with selected profiles and dynamic proxy
        os.environ["FK_CORE_KIND"] = target
        profiles = ["ui", "inference"] if target == "llama" else ["ui", "inference-vllm"]
        rc = _run_ensure_stack(build=False, include_mongo=False, profiles=profiles, compose_file="docker-compose.yml")
        if rc != 0:
            print("Failed to restart stack; try running 'python -m forgekeeper compose'", file=sys.stderr)
        else:
            core_port = os.getenv("LLAMA_PORT_CORE") if target == "llama" else os.getenv("VLLM_PORT_CORE")
            core_port = core_port or "8001"
            print(f"Switched core to {target}. Core API: http://localhost:{core_port}/v1")
        return rc

    p.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
