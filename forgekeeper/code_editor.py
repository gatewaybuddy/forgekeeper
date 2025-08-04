"""Utilities to modify code files based on a task prompt."""

from pathlib import Path


def generate_code_edit(file_path: str, task_prompt: str, file_summary: str) -> str:
    """Return the file content with an inline task comment.

    The previous implementation simply appended a TODO marker to the end of
    the file.  Instead, this function injects a short comment near the start of
    the file that references both the ``task_prompt`` and ``file_summary``.  A
    lightweight rule-based approach is used so that the edit is performed
    without requiring network calls to a language model.  The comment is placed
    directly before the first function or class definition when possible,
    otherwise it is inserted at the beginning of the file.
    """

    p = Path(file_path)
    original = p.read_text(encoding="utf-8")

    insertion = f"# TASK: {task_prompt}\n# SUMMARY: {file_summary}\n"
    lines = original.splitlines()

    for idx, line in enumerate(lines):
        stripped = line.lstrip()
        if stripped.startswith("def ") or stripped.startswith("class "):
            lines.insert(idx, insertion.rstrip("\n"))
            break
    else:
        lines.insert(0, insertion.rstrip("\n"))

    return "\n".join(lines) + ("\n" if original.endswith("\n") else "")
