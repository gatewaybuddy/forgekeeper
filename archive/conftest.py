from __future__ import annotations
import sys
from pathlib import Path
root = Path(__file__).resolve().parent
for p in [root, root / 'forgekeeper-v2']:
    if p.exists() and str(p) not in sys.path:
        sys.path.insert(0, str(p))
