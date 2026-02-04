"""Docker stack management for Forgekeeper CLI."""

from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from .environment import load_dotenv, get_repo_root, get_core_kind


def _hash_file(path: Path) -> str:
    """Compute SHA256 hash of a file.

    Args:
        path: Path to file

    Returns:
        Hexadecimal hash string, or empty string on error
    """
    try:
        data = path.read_bytes()
        return hashlib.sha256(data).hexdigest()
    except Exception:
        return ""


def _hash_directory(base: Path, excludes: list[str] | None = None) -> str:
    """Compute SHA256 hash of directory contents.

    Args:
        base: Base directory path
        excludes: List of directory/file names to exclude

    Returns:
        Hexadecimal hash string, or empty string on error
    """
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


def _get_env_value(path: Path, key: str, default: str) -> str:
    """Get value from .env file.

    Args:
        path: Path to .env file
        key: Environment variable name
        default: Default value if not found

    Returns:
        Environment variable value or default
    """
    try:
        for line in path.read_text(encoding='utf-8').splitlines():
            s = line.strip()
            if not s or s.startswith('#'):
                continue
            if '=' in s:
                k, v = s.split('=', 1)
                if k.strip() == key:
                    return v.strip()
    except Exception as e:
        print(f"Warning: Could not read {key} from {path}: {e}", file=sys.stderr)
    return default


def compose_down(compose_file: str | None = None, stop_only: bool = False) -> int:
    """Stop or tear down Docker Compose services.

    Args:
        compose_file: Path to docker-compose.yml (default: docker-compose.yml in repo root)
        stop_only: If True, stop containers without removing them

    Returns:
        Exit code from docker compose command
    """
    root = get_repo_root()
    cf = compose_file or "docker-compose.yml"
    cmd = [shutil.which("docker") or "docker", "compose", "-f", str(root / cf)]
    cmd += ["stop"] if stop_only else ["down"]
    return subprocess.call(cmd)


def run_up_core() -> int:
    """Start only the inference core (llama.cpp or vLLM).

    Returns:
        Exit code
    """
    root = get_repo_root()
    # Load .env to get FK_CORE_KIND
    load_dotenv(root / ".env")

    core_kind = get_core_kind()
    gpu_pref = os.getenv("FK_CORE_GPU", "1").strip()

    # Try platform-specific ensure script first
    if platform.system() == "Windows":
        script_name = "ensure_vllm_core.ps1" if core_kind == "vllm" else "ensure_llama_core.ps1"
        ps1 = root / "scripts" / script_name
        shell = shutil.which("pwsh") or shutil.which("powershell") or shutil.which("powershell.exe")
        if shell and ps1.exists():
            return subprocess.call([
                shell, "-NoLogo", "-NoProfile", "-File", str(ps1),
                "-ProjectDir", str(root),
                "-ComposeFile", "docker-compose.yml"
            ])

    # Fallback: shell ensure script
    script_name = "ensure_vllm_core.sh" if core_kind == "vllm" else "ensure_llama_core.sh"
    sh_ensure = root / "scripts" / script_name
    bash = shutil.which("bash")
    if bash and sh_ensure.exists():
        env = os.environ.copy()
        env["PROJECT_DIR"] = str(root)
        env["COMPOSE_FILE"] = "docker-compose.yml"
        return subprocess.call([bash, str(sh_ensure)], env=env)

    # Final fallback: direct docker compose up
    if core_kind == "vllm":
        service = "vllm-core"
    else:
        service = "llama-core-cpu" if gpu_pref == "0" else "llama-core"

    cmd = [
        shutil.which("docker") or "docker", "compose",
        "-f", str(root / "docker-compose.yml"),
        "up", "-d", service
    ]
    return subprocess.call(cmd)


def run_ensure_stack(
    build: bool,
    include_mongo: bool,
    profiles: list[str] | None,
    compose_file: str | None
) -> int:
    """Ensure full stack is running via ensure-stack scripts.

    Args:
        build: Whether to build images
        include_mongo: Whether to include MongoDB
        profiles: Docker Compose profiles to activate
        compose_file: Path to compose file (default: docker-compose.yml)

    Returns:
        Exit code
    """
    root = get_repo_root()

    # Prefer platform-native ensure scripts
    if platform.system() == "Windows":
        ps1 = root / "scripts" / "ensure_stack.ps1"
        shell = shutil.which("pwsh") or shutil.which("powershell") or shutil.which("powershell.exe")
        if shell and ps1.exists():
            cmd = [shell, "-NoLogo", "-NoProfile", "-File", str(ps1), "-ProjectDir", str(root)]
            if compose_file:
                cmd += ["-ComposeFile", compose_file]
            if profiles:
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


def run_compose() -> int:
    """Run full Docker Compose stack with auto-rebuild detection.

    This is the main entry point for starting Forgekeeper. It:
    - Detects config changes and rebuilds only when needed
    - Starts appropriate profiles based on FK_CORE_KIND
    - Performs health checks
    - Holds foreground until Ctrl+C

    Returns:
        Exit code
    """
    print("Ensuring stack via ensure-stack (build + profiles); Ctrl+C to tear down.")
    compose_file = "docker-compose.yml"
    root = get_repo_root()
    cf_path = root / compose_file
    env_path = root / ".env"

    # Load .env into environment
    load_dotenv(env_path)

    # Compute fingerprints for change detection
    compose_hash_before = _hash_file(cf_path)
    env_hash_before = _hash_file(env_path)
    frontend_hash = _hash_directory(root / 'frontend', excludes=['node_modules', 'dist'])

    # Check if rebuild is needed
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

    # Determine profiles based on core kind
    core_kind = get_core_kind()
    gpu_pref = os.getenv("FK_CORE_GPU", "1").strip()

    if core_kind == "vllm":
        profiles = ["ui", "inference-vllm"]
    else:
        profiles = ["ui", "inference-cpu"] if gpu_pref == "0" else ["ui", "inference"]

    # Start stack
    rc = run_ensure_stack(
        build=should_build,
        include_mongo=False,
        profiles=profiles,
        compose_file=compose_file
    )

    if rc != 0:
        # Fallback to legacy start scripts
        print("ensure-stack failed; attempting legacy start script...", file=sys.stderr)
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

    # Persist fingerprint
    try:
        state_dir.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(curr_fingerprint))
    except Exception:
        pass

    # Print friendly URLs
    frontend_port = _get_env_value(env_path, 'FRONTEND_PORT', '3000')
    core_port = _get_env_value(
        env_path, 'LLAMA_PORT_CORE',
        _get_env_value(env_path, 'VLLM_PORT_CORE', '8001')
    )

    print(f"Forgekeeper UI: http://localhost:{frontend_port}")
    print(f"Frontend health: http://localhost:{frontend_port}/health-ui")
    print(f"Core API: http://localhost:{core_port}/v1")
    print(f"Thought World Test: http://localhost:{frontend_port}/test-thought-world.html")

    # Health check with timeout
    try:
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
        # Persist fingerprint for next run
        try:
            state_dir.mkdir(parents=True, exist_ok=True)
            state_path.write_text(json.dumps(curr_fingerprint))
        except Exception:
            pass

        # Check if config changed - if not, just stop instead of down
        compose_hash_after = _hash_file(cf_path)
        env_hash_after = _hash_file(env_path)
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
        compose_down(compose_file, stop_only=unchanged)
        print("Done.")
        return 0


__all__ = [
    "compose_down",
    "run_up_core",
    "run_ensure_stack",
    "run_compose",
]
