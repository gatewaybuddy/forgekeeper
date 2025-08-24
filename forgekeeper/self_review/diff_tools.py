"""Helpers for running tools and analyzing diffs."""

from __future__ import annotations

import subprocess
from typing import Any, Dict, List, Sequence, Tuple


def _run_tool(cmd: Sequence[str]) -> Tuple[bool, str]:
    """Run a command returning success flag and combined output."""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        output = result.stdout + result.stderr
        return result.returncode == 0, output
    except FileNotFoundError as exc:
        return False, str(exc)


def _collect_feedback(results: Dict[str, Dict[str, Any]]) -> Dict[str, List[str]]:
    """Extract file-specific feedback from tool outputs."""
    feedback: Dict[str, List[str]] = {}
    for info in results.values():
        if info.get("passed"):
            continue
        for line in str(info.get("output", "")).splitlines():
            if not line:
                continue
            file_part = line.split(":", 1)[0]
            if file_part:
                feedback.setdefault(file_part, []).append(line.strip())
    return feedback
