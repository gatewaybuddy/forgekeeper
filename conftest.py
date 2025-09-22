from __future__ import annotations

import sys
from pathlib import Path


def _ensure_paths() -> None:
    root = Path(__file__).resolve().parent
    # Add repo root to path
    repo = root
    if str(repo) not in sys.path:
        sys.path.insert(0, str(repo))
    # Add v2 package parent path
    v2_parent = repo / "forgekeeper-v2"
    if v2_parent.exists() and str(v2_parent) not in sys.path:
        sys.path.insert(0, str(v2_parent))


_ensure_paths()

