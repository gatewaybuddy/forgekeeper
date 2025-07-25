"""Utilities to modify code files based on a task prompt."""

from pathlib import Path


def generate_code_edit(file_path: str, task_prompt: str, file_summary: str) -> str:
    """Load the file and return a modified version with task instructions."""
    p = Path(file_path)
    original = p.read_text(encoding="utf-8")
    header = f"# TASK: {task_prompt}\n"
    todo = "\n# TODO: revise this file based on the task and summary above\n"
    return header + original + todo
