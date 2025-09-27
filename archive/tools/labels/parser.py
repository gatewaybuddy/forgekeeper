"""Parse `tasks.md` blocks for metadata used in PR labeling."""

from __future__ import annotations

import re
from typing import Any, Dict

try:
    import yaml  # type: ignore
except Exception as exc:  # pragma: no cover - dependency missing
    raise ImportError("Missing dependency: pyyaml") from exc

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL | re.MULTILINE)


def parse_tasks_md(path: str) -> Dict[str, Dict[str, Any]]:
    """Return a mapping of task ID → metadata parsed from a `tasks.md` file."""
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    tasks: Dict[str, Dict[str, Any]] = {}
    idx = 0
    while True:
        m = FRONTMATTER_RE.search(text, idx)
        if not m:
            break
        fm = yaml.safe_load(m.group(1)) or {}
        _, end = m.span()
        next_m = FRONTMATTER_RE.search(text, end)
        body = text[end : (next_m.start() if next_m else len(text))].strip()
        tid = (fm.get("id") or "").strip()
        if tid:
            key = tid.upper()
            tasks[key] = {
                "id": key,
                "title": (fm.get("title") or "").strip(),
                "labels": fm.get("labels") or [],
                "body": body,
            }
        idx = end
    return tasks
