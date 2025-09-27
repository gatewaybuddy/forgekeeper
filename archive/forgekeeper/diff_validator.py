"""Diff validation helpers for staged Python files."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List, Set

from git import Repo

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE

LOG = get_logger(__name__, debug=DEBUG_MODE)

_DEF_REMOVED = re.compile(r"^-\s*(?:def|class)\s+(\w+)\b", re.MULTILINE)
_DEF_ADDED = re.compile(r"^\+\s*(?:def|class)\s+(\w+)\b", re.MULTILINE)


def _extract(pattern: re.Pattern[str], diff: str) -> Set[str]:
    return {match.group(1) for match in pattern.finditer(diff)}


def validate_staged_diffs() -> Dict[str, object]:
    """Check staged diffs for removed definitions still referenced elsewhere."""

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
                continue
            for other in staged_files:
                if other == file or not other.endswith(".py"):
                    continue
                content = (Path(repo.working_tree_dir) / other).read_text(encoding="utf-8")
                if re.search(rf"\b{name}\b", content):
                    issues.append(
                        f"{name} removed from {file} but referenced in {other}"
                    )

    passed = not issues
    if passed:
        LOG.info("Diff validation passed for %d files", len(staged_files))
    else:
        for issue in issues:
            LOG.error(issue)

    return {"passed": passed, "issues": issues, "staged_files": staged_files}


__all__ = ["validate_staged_diffs"]
