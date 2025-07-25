import difflib
from pathlib import Path

from git import Repo


def diff_and_stage_changes(original_code: str, modified_code: str, file_path: str, auto_stage: bool = True) -> None:
    """Compare original and modified content and stage via Git if changed."""
    if original_code == modified_code:
        print(f"No changes detected for {file_path}")
        return

    diff_lines = difflib.unified_diff(
        original_code.splitlines(),
        modified_code.splitlines(),
        fromfile=f"a/{file_path}",
        tofile=f"b/{file_path}",
        lineterm="",
    )
    diff_text = "\n".join(diff_lines)
    print(diff_text)

    proceed = auto_stage
    if not auto_stage:
        resp = input("Stage changes? [y/N]: ").strip().lower()
        proceed = resp.startswith("y")

    if proceed:
        repo = Repo(Path(file_path).resolve().parent, search_parent_directories=True)
        repo.index.add([file_path])

