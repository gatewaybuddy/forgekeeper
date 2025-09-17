"""Utilities for updating task review status."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import yaml

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL | re.MULTILINE)

MODULE_DIR = Path(__file__).resolve().parent
TASK_FILE = MODULE_DIR.parent / "tasks.md"


def _mark_task_needs_review(task_id: str) -> None:
    """Update ``tasks.md`` to mark the given task as ``needs_review``."""
    path = TASK_FILE
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    idx = 0
    pieces: list[str] = []
    while True:
        m = FRONTMATTER_RE.search(text, idx)
        if not m:
            pieces.append(text[idx:])
            break
        start, end = m.span()
        pieces.append(text[idx:start])
        fm = yaml.safe_load(m.group(1)) or {}
        if str(fm.get("id", "")).strip().upper() == task_id.upper():
            fm["status"] = "needs_review"
            front = yaml.safe_dump(fm, sort_keys=False).strip()
            pieces.append(f"---\n{front}\n---\n")
        else:
            pieces.append(m.group(0))
        idx = end
    path.write_text("".join(pieces), encoding="utf-8")


def _check_reviewed_tasks() -> None:
    """Update tasks marked ``needs_review`` if their PRs were merged."""
    tasks_file = TASK_FILE
    script = MODULE_DIR.parent / "tools" / "mark_done_if_merged.py"
    if not tasks_file.exists() or not script.exists():
        return
    try:
        import yaml as _yaml  # type: ignore
    except Exception:  # pragma: no cover - optional dependency
        return
    text = tasks_file.read_text(encoding="utf-8")
    ids: list[str] = []
    for m in re.finditer(r"^---\n(.*?)\n---", text, re.MULTILINE | re.DOTALL):
        try:
            data = _yaml.safe_load(m.group(1)) or {}
        except Exception:
            continue
        if isinstance(data, dict) and data.get("status") == "needs_review" and data.get("id"):
            ids.append(str(data["id"]))
    for tid in ids:
        subprocess.run([sys.executable, str(script), tid], check=False)


def _spawn_followup_task(
    parent: dict,
    review: dict,
    tasks_file: Path | None = None,
    logs_root: Path | None = None,
) -> str:
    """Append a new canonical task capturing failing tool output."""
    tasks_file = Path(tasks_file) if tasks_file else TASK_FILE
    logs_root = Path(logs_root) if logs_root else MODULE_DIR.parent

    text = tasks_file.read_text(encoding="utf-8") if tasks_file.exists() else ""
    ids = [int(num) for num in re.findall(r"id:\s*FK-(\d+)", text)]
    new_num = max(ids) + 1 if ids else 1
    new_id = f"FK-{new_num:03d}"

    parent_id = parent.get("task_id", "unknown")
    epic = parent.get("epic", "")

    body_lines: list[str] = []
    for cmd, res in review.get("tools", {}).items():
        if res.get("passed"):
            continue
        output = res.get("output", "").splitlines()[:20]
        body_lines.append(cmd)
        body_lines.extend(output)
        body_lines.append("")
    body = "\n".join(body_lines).rstrip()

    block = [
        "---",
        f"id: {new_id}",
        f"title: Fix failures from {parent_id} (P1)",
        "status: todo",
        f"epic: {epic}",
        "owner: agent",
        "labels: [autofix, reliability]",
        "---",
    ]
    if body:
        block.append(body)
    block_text = "\n".join(block) + "\n"

    with tasks_file.open("a", encoding="utf-8") as fh:
        if text and not text.endswith("\n"):
            fh.write("\n")
        fh.write(block_text)

    log_dir = logs_root / "logs" / parent_id
    log_dir.mkdir(parents=True, exist_ok=True)
    spawned_file = log_dir / "spawned.json"
    spawned: list[str] = []
    if spawned_file.exists():
        try:
            existing = json.loads(spawned_file.read_text(encoding="utf-8"))
            if isinstance(existing, list):
                spawned = existing
        except Exception:
            pass
    spawned.append(new_id)
    spawned_file.write_text(json.dumps(spawned, indent=2), encoding="utf-8")

    return new_id
