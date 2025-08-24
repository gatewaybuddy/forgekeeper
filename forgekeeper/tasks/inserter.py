from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Any
import json
import re

from ..memory.episodic import append_entry

TASK_FILE = Path(__file__).resolve().parents[2] / "tasks.md"


def sanitize_and_insert_tasks(
    tasks: List[Dict[str, Any]], task_file: Path = TASK_FILE
) -> List[str]:
    """Sanitize and append canonical tasks to ``tasks.md``.

    Each task dictionary may contain ``id``, ``title``, ``status``, ``epic``,
    ``owner``, ``labels``, and ``body``/``description`` fields. Existing task
    IDs are preserved and duplicates are skipped. All string values are
    stripped and ``---`` sequences removed to avoid corrupting the YAML
    structure. A record of each inserted task is written to episodic memory.

    Parameters
    ----------
    tasks:
        Iterable of task dictionaries to insert.
    task_file:
        Optional path to the ``tasks.md`` file.

    Returns
    -------
    List[str]
        The IDs of tasks that were inserted.
    """

    text = task_file.read_text(encoding="utf-8") if task_file.exists() else ""
    existing = set(re.findall(r"^id:\s*(.+)$", text, flags=re.MULTILINE))
    if text and not text.endswith("\n"):
        text += "\n"

    def _clean(value: Any) -> str:
        return str(value).replace("---", "").strip()

    inserted: List[str] = []
    for raw in tasks:
        tid = _clean(raw.get("id", ""))
        if not tid or tid in existing:
            continue
        title = _clean(raw.get("title", ""))
        status = _clean(raw.get("status", "todo"))
        epic = _clean(raw.get("epic", ""))
        owner = _clean(raw.get("owner", ""))
        labels = raw.get("labels") or []
        body = _clean(raw.get("body", raw.get("description", "")))

        block = [
            "---",
            f"id: {tid}",
            f"title: {title}",
            f"status: {status}",
            f"epic: {epic}",
            f"owner: {owner}",
            f"labels: {json.dumps(labels)}",
            "---",
        ]
        if body:
            block.append(body)
        block.append("")
        text += "\n".join(block)
        append_entry(tid, title, "generated", [], body, [])
        inserted.append(tid)
        existing.add(tid)

    task_file.write_text(text, encoding="utf-8")
    return inserted
