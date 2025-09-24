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
    try:
        from forgekeeper.core.cli import main as entry_main
    except Exception:
        # Final fallback: try import again without modifying path
        from forgekeeper_v2.cli import main as entry_main  # type: ignore

    if argv is None:
        argv = sys.argv[1:]
    entry_main(argv)


if __name__ == "__main__":  # pragma: no cover
    main()

