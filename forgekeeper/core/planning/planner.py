"""High-level task planning utilities."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from .agents import split_for_agents
from .analysis import analyze_repo_for_task
from .summaries import summarize_repository

LANG_COMMENT_PREFIX = {
    "python": "# ",
    "typescript": "// ",
}


def _synthesize_edit(original: str, description: str, lang: str, guidelines: str) -> str:
    note = description.strip() or "Update file"
    if guidelines.strip():
        note = f"{note} | {guidelines.strip()}"
    prefix = LANG_COMMENT_PREFIX.get(lang, "# ")
    body = original.rstrip("\n")
    if body:
        body += "\n"
    return body + f"{prefix}TODO: {note}\n"



def _task_description(task: Dict[str, Any]) -> str:
    for key in ("title", "description", "task"):
        value = task.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def plan_for_task(
    task: Dict[str, Any],
    *,
    guidelines: str = "",
    repo_root: Path | str | None = None,
) -> Dict[str, Any]:
    """Generate planning metadata for ``task`` using heuristic analysis."""

    description = _task_description(task)
    root_path = Path(repo_root or task.get("_repo_root") or Path.cwd()).resolve()
    summaries = summarize_repository(root_path)
    ranked = analyze_repo_for_task(description, root=root_path, summaries=summaries)
    plan = split_for_agents(description) if description else []

    edits: List[Dict[str, Any]] = []
    for candidate in ranked[: max(1, min(3, len(ranked)))]:
        file_rel = candidate.get("file")
        if not file_rel:
            continue
        abs_path = (root_path / file_rel).resolve()
        if not abs_path.exists():
            continue
        original = abs_path.read_text(encoding="utf-8", errors="ignore")
        lang = str(candidate.get("lang", ""))
        modified = _synthesize_edit(original, description, lang, guidelines)
        edits.append(
            {
                "path": str(abs_path),
                "original": original,
                "modified": modified,
                "run_sandbox": False,
            }
        )

    payload: Dict[str, Any] = {
        "status": "needs_review",
        "plan": plan,
        "edits": edits,
        "ranked_files": ranked,
        "repo_root": str(root_path),
    }
    if guidelines.strip():
        payload["notes"] = guidelines.strip()
    return payload


__all__ = ["plan_for_task"]
