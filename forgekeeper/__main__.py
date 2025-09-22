from __future__ import annotations

import argparse
import sys
from pathlib import Path


def _run_conversation(argv: list[str]) -> int:
    # Prefer local v2 sources in mono-repo to avoid stale installed copies
    root = Path(__file__).resolve().parents[2]
    v2_path = root / "forgekeeper-v2"
    if v2_path.exists():
        sys.path.insert(0, str(v2_path))
    from forgekeeper_v2.cli import main as v2_main
    v2_main(argv)
    return 0


def _run_single(argv: list[str]) -> int:
    # Route to v2 single-agent mode by default
    return _run_conversation(["run", "--mode", "single", *argv])


def main(argv: list[str] | None = None) -> None:  # pragma: no cover
    p = argparse.ArgumentParser(prog="forgekeeper", description="Forgekeeper CLI")
    p.add_argument("--conversation", action="store_true", help="Run multi-agent conversation mode (v2)")
    p.add_argument("--v2", action="store_true", help="Alias for --conversation")
    # Forward remaining args to selected mode
    args, rest = p.parse_known_args(argv)
    if args.conversation or args.v2:
        raise SystemExit(_run_conversation(rest))
    else:
        raise SystemExit(_run_single(rest))


if __name__ == "__main__":  # pragma: no cover
    main()
