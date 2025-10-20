from __future__ import annotations

import io
import json
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Optional


DEFAULT_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


def _base_dir() -> Path:
    # Prefer explicit override for tests; else repo-local default
    p = os.getenv("FGK_CONTEXTLOG_DIR")
    if p:
        return Path(p)
    return Path.cwd() / ".forgekeeper" / "context_log"


def _ensure_dir(d: Path) -> None:
    d.mkdir(parents=True, exist_ok=True)


def _hour_key(dt: Optional[datetime] = None) -> str:
    t = dt or datetime.utcnow()
    return t.strftime("%Y%m%d-%H")


def _current_file(dir: Path, dt: Optional[datetime] = None) -> Path:
    key = _hour_key(dt)
    # Base filename for current hour; add numeric suffix when rotating for size
    base = dir / f"ctx-{key}.jsonl"
    if not base.exists():
        return base
    # If the base file exists and rotation was needed, find the next suffix
    i = 1
    while True:
        candidate = dir / f"ctx-{key}-{i}.jsonl"
        if not candidate.exists():
            return candidate if base.stat().st_size >= DEFAULT_MAX_BYTES else base
        i += 1


def append(event: dict[str, Any], *, max_bytes: int | None = None, dir: Path | None = None) -> Path:
    """Append a JSON event to the current log file, rotating on size.

    Returns the file path written to.
    """
    d = dir or _base_dir()
    _ensure_dir(d)
    fp = _current_file(d)
    # Rotate if size exceeds limit
    limit = int(max_bytes or os.getenv("FGK_CONTEXTLOG_MAX_BYTES", DEFAULT_MAX_BYTES))
    if fp.exists() and fp.stat().st_size >= limit:
        # Force next suffix
        fp = _current_file(d, datetime.utcnow())
    # Ensure required fields minimally exist
    if "ts" not in event:
        event = {**event, "ts": datetime.utcnow().isoformat()}
    line = json.dumps(event, ensure_ascii=False)
    with open(fp, "a", encoding="utf-8") as f:
        f.write(line)
        f.write("\n")
    return fp


def _iter_files_newest_first(dir: Path) -> Iterable[Path]:
    files = sorted(dir.glob("ctx-*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
    for p in files:
        yield p


def tail(n: int = 50, *, conv_id: str | None = None, dir: Path | None = None) -> list[dict[str, Any]]:
    """Return the newest N events (optionally filtered by conv_id)."""
    d = dir or _base_dir()
    if not d.exists():
        return []
    out: list[dict[str, Any]] = []
    for fp in _iter_files_newest_first(d):
        try:
            text = fp.read_text(encoding="utf-8")
        except Exception:
            continue
        for line in reversed(text.splitlines()):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue
            if conv_id and str(obj.get("conv_id") or "") != conv_id:
                continue
            out.append(obj)
            if len(out) >= n:
                return out
    return out

