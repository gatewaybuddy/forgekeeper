"""Simple file ranking heuristics for task planning."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, Iterable, List

from .summaries import summarize_repository


def _keyword_set(text: str) -> set[str]:
    return {token for token in re.findall(r"[a-zA-Z0-9_]+", text.lower()) if len(token) > 2}


def analyze_repo_for_task(
    task_prompt: str,
    *,
    root: Path | str = ".",
    summaries: Dict[str, Dict[str, object]] | None = None,
) -> List[Dict[str, object]]:
    """Return files ranked by simple keyword overlap with ``task_prompt``."""

    if summaries is None:
        summaries = summarize_repository(root)
    keywords = _keyword_set(task_prompt)
    results: List[Dict[str, object]] = []
    for rel_path, info in summaries.items():
        summary_text = str(info.get("summary", ""))
        summary_keywords = _keyword_set(summary_text)
        overlap = keywords & summary_keywords if keywords else set()
        score = len(overlap) / len(keywords) if keywords else 0.0
        results.append(
            {
                "file": rel_path,
                "summary": summary_text,
                "lang": info.get("lang", ""),
                "score": score,
                "keywords": sorted(overlap),
            }
        )
    results.sort(key=lambda item: item["score"], reverse=True)
    return results


__all__ = ["analyze_repo_for_task"]
