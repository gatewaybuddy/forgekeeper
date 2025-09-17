from __future__ import annotations

import sys
from pathlib import Path


def main(argv: list[str] | None = None) -> None:  # pragma: no cover
    # Prefer local v2 sources in mono-repo to avoid stale installed copies
    root = Path(__file__).resolve().parents[2]
    v2_path = root / "forgekeeper-v2"
    if v2_path.exists():
        sys.path.insert(0, str(v2_path))
    try:
        from forgekeeper_v2.cli import main as v2_main
    except Exception:
        # Final fallback: try import again without modifying path
        from forgekeeper_v2.cli import main as v2_main  # type: ignore

    if argv is None:
        argv = sys.argv[1:]
    v2_main(argv)


if __name__ == "__main__":  # pragma: no cover
    main()
