from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import List


_CHILD_ENV_FLAG = "FGK_STACK_CHILD"

def _run_conversation(argv: List[str] | None) -> int:
    # Prefer local v2 sources in mono-repo to avoid stale installed copies
    root = Path(__file__).resolve().parents[2]
    candidates = [root / "forgekeeper" / "forgekeeper-v2", root / "forgekeeper-v2"]
    for v2_path in candidates:
        if v2_path.exists():
            sys.path.insert(0, str(v2_path))
            break
    try:
        from forgekeeper.core.cli import main as entry_main
    except Exception:
        # Final fallback: try import again without modifying path
        from forgekeeper_v2.cli import main as entry_main  # type: ignore

    if argv is None:
        argv = sys.argv[1:]
    if '--conversation' in argv:
        argv = ['run', '--mode', 'duet', *[arg for arg in argv if arg != '--conversation']]
    elif not argv:
        argv = ['run']
    elif argv[0] in {'--mode', '--llm', '--duration', '--no-tools'}:
        argv = ['run', *argv]
    try:
        entry_main(argv)
    except SystemExit as exc:  # argparse exits
        return int(exc.code or 0)
    return 0


def _build_start_command(extra: list[str]) -> list[str]:
    repo_root = Path(__file__).resolve().parents[1]
    scripts_dir = repo_root / "scripts"
    if os.name == "nt":
        script_path = scripts_dir / "start_local_stack.ps1"
        if not script_path.exists():
            raise SystemExit(f"Missing PowerShell launcher: {script_path}")
        shell = shutil.which("pwsh") or shutil.which("powershell") or shutil.which("powershell.exe")
        if not shell:
            raise SystemExit("PowerShell (pwsh) is required to start Forgekeeper on Windows")
        if extra:
            raise SystemExit("Additional options are not yet supported via the cross-platform wrapper on Windows; run scripts/start_local_stack.ps1 directly for advanced flags.")
        return [shell, "-NoLogo", "-NoProfile", "-File", str(script_path)]

    script_path = scripts_dir / "start_local_stack.sh"
    if not script_path.exists():
        raise SystemExit(f"Missing startup script: {script_path}")
    shell = shutil.which("bash")
    if not shell:
        raise SystemExit("bash is required to start Forgekeeper on this platform")
    return [shell, str(script_path), *extra]


def main(argv: List[str] | None = None) -> int:
    args_list = list(argv) if argv is not None else sys.argv[1:]
    if os.environ.get(_CHILD_ENV_FLAG) == '1':
        return _run_conversation(args_list)

    parser = argparse.ArgumentParser(
        description="Forgekeeper launcher. Defaults to bringing up the full local stack."
    )
    parser.add_argument(
        "--cli-only",
        dest="cli_only",
        action="store_true",
        help="Run only the CLI agent (no backend/frontend/startup orchestration).",
    )
    known_args, extra = parser.parse_known_args(args_list)

    if known_args.cli_only:
        return _run_conversation(extra)

    cmd = _build_start_command(extra)
    env = os.environ.copy()
    env[_CHILD_ENV_FLAG] = '1'
    result = subprocess.run(cmd, check=False, env=env)
    return int(result.returncode)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())

