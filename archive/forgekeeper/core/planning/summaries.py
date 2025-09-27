"""Repository summarisation helpers."""

from __future__ import annotations

from pathlib import Path
from typing import Dict

_SUPPORTED_EXTENSIONS = {".py": "python", ".ts": "typescript", ".tsx": "typescript"}
_IGNORE_PARTS = {".git", ".venv", "node_modules", "__pycache__", ".pytest_cache", "dist", "build"}


def _should_ignore(parts: tuple[str, ...]) -> bool:
    return any(part in _IGNORE_PARTS for part in parts if part)


def summarize_file(path: Path) -> Dict[str, object]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()
    first_meaningful = next((line.strip() for line in lines if line.strip()), "")
    lang = _SUPPORTED_EXTENSIONS.get(path.suffix.lower(), "")
    summary = first_meaningful[:200]
    return {"summary": summary, "lines": len(lines), "lang": lang}


def summarize_repository(root: Path | str = ".") -> Dict[str, Dict[str, object]]:
    root_path = Path(root).resolve()
    summaries: Dict[str, Dict[str, object]] = {}
    for path in root_path.rglob("*"):
        try:
            rel = path.relative_to(root_path)
        except ValueError:
            continue
        if _should_ignore(rel.parts):
            continue
        try:
            is_file = path.is_file()
        except OSError:
            continue
        if not is_file:
            continue
        if path.suffix.lower() not in _SUPPORTED_EXTENSIONS:
            continue
        summaries[str(rel)] = summarize_file(path)
    return summaries


__all__ = ["summarize_repository", "summarize_file"]
