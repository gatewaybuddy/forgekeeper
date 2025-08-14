"""Validate cross-file consistency of staged diffs.

This module inspects staged Python file diffs to detect situations where a
function or class definition is removed in one file but still referenced in
another staged file. It returns a structured result describing any issues
found. The goal is to catch related-module inconsistencies before commit.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List, Set

from git import Repo

from forgekeeper.config import DEBUG_MODE
from forgekeeper.logger import get_logger

log = get_logger(__name__, debug=DEBUG_MODE)

_DEF_REMOVED = re.compile(r"^-\s*(?:def|class)\s+(\w+)\b", re.MULTILINE)
_DEF_ADDED = re.compile(r"^\+\s*(?:def|class)\s+(\w+)\b", re.MULTILINE)


def _extract(pattern: re.Pattern[str], diff: str) -> Set[str]:
    """Return definition names matching pattern in diff text."""

    return set(m.group(1) for m in pattern.finditer(diff))


def validate_staged_diffs() -> Dict[str, object]:
    """Analyze staged diffs and flag cross-file inconsistencies.

    Currently checks for definitions removed from one file but still referenced
    in another staged Python file.

    Returns
    -------
    dict
        Mapping with ``passed`` boolean and a list of ``issues`` strings.
    """

    repo = Repo(Path(__file__).resolve().parent, search_parent_directories=True)
    staged_files = [
        f for f in repo.git.diff("--name-only", "--cached").splitlines() if f
    ]

    removed_defs: Dict[str, Set[str]] = {}
    added_defs: Dict[str, Set[str]] = {}
    issues: List[str] = []

    for fname in staged_files:
        if not fname.endswith(".py"):
            continue
        diff_text = repo.git.diff("--cached", "--", fname)
        removed_defs[fname] = _extract(_DEF_REMOVED, diff_text)
        added_defs[fname] = _extract(_DEF_ADDED, diff_text)

    for file, names in removed_defs.items():
        for name in names:
            if name in added_defs.get(file, set()):
                continue  # likely a rename in the same file
            for other in staged_files:
                if other == file or not other.endswith(".py"):
                    continue
                content = (
                    Path(repo.working_tree_dir) / other
                ).read_text(encoding="utf-8")
                if re.search(rf"\b{name}\b", content):
                    issues.append(
                        f"{name} removed from {file} but referenced in {other}"
                    )

    passed = not issues
    if passed:
        log.info("Diff validation passed for %d files", len(staged_files))
    else:
        for issue in issues:
            log.error(issue)
    return {"passed": passed, "issues": issues, "staged_files": staged_files}
