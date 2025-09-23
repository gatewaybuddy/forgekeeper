from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Callable


def _ensure_repo_paths() -> None:
    """Prefer local mono-repo sources when available."""
    root = Path(__file__).resolve().parents[2]
    v2_path = root / "forgekeeper-v2"
    if v2_path.exists():
        v2_path_str = str(v2_path)
        if v2_path_str not in sys.path:
            sys.path.insert(0, v2_path_str)


def _load_core_entrypoint() -> Callable[[list[str]], None] | None:
    try:
        from forgekeeper.core.cli import main as entry_main
    except Exception:
        return None
    return entry_main


def _run_conversation(argv: list[str]) -> int:
    from forgekeeper_v2.cli import main as v2_main

    v2_main(argv)
    return 0


def _run_single(argv: list[str]) -> int:
    return _run_conversation(["run", "--mode", "single", *argv])


def main(argv: list[str] | None = None) -> None:  # pragma: no cover
    _ensure_repo_paths()
    entry_main = _load_core_entrypoint()
    if entry_main is not None:
        if argv is None:
            argv = sys.argv[1:]
        entry_main(argv)
        return

    p = argparse.ArgumentParser(prog="forgekeeper", description="Forgekeeper CLI")
    p.add_argument("--conversation", action="store_true", help="Run multi-agent conversation mode (v2)")
    p.add_argument("--v2", action="store_true", help="Alias for --conversation")
    args, rest = p.parse_known_args(argv)
    if args.conversation or args.v2:
        raise SystemExit(_run_conversation(rest))
    raise SystemExit(_run_single(rest))


if __name__ == "__main__":  # pragma: no cover
    main()
