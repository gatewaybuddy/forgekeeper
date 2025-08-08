import difflib
import json
from datetime import datetime
from pathlib import Path

from git import Repo
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE

log = get_logger(__name__, debug=DEBUG_MODE)


def diff_and_stage_changes(
    original_code: str,
    modified_code: str,
    file_path: str,
    auto_stage: bool = True,
    dry_run: bool = False,
) -> None:
    """Compare original and modified content and stage via Git if changed.

    Parameters
    ----------
    original_code: str
        The file's existing content.
    modified_code: str
        The new content to write if staging proceeds.
    file_path: str
        Path to the file relative to the repository root.
    auto_stage: bool, optional
        If ``True`` the file is staged without prompting.
    dry_run: bool, optional
        When ``True`` no changes are written or staged.
    """

    if original_code == modified_code:
        log.info(f"No changes detected for {file_path}")
        return

    diff_lines = difflib.unified_diff(
        original_code.splitlines(),
        modified_code.splitlines(),
        fromfile=f"a/{file_path}",
        tofile=f"b/{file_path}",
        lineterm="",
    )
    diff_text = "\n".join(diff_lines)
    log.info(diff_text)

    proceed = auto_stage
    if not auto_stage:
        resp = input("Stage changes? [y/N]: ").strip().lower()
        proceed = resp.startswith("y")

    if not proceed:
        return

    if dry_run:
        log.info(f"Dry run enabled; skipping write and stage for {file_path}")
        return

    p = Path(file_path).resolve()
    repo = Repo(p.parent, search_parent_directories=True)

    try:
        p.write_text(modified_code, encoding="utf-8")
        repo.index.add([str(p)])

        staged_files = repo.git.diff("--name-only", "--cached").splitlines()
        logs_dir = Path(repo.working_tree_dir) / "logs"
        logs_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        log_file = logs_dir / f"stager-{ts}.json"
        log_file.write_text(json.dumps(staged_files, indent=2), encoding="utf-8")
    except Exception as exc:
        p.write_text(original_code, encoding="utf-8")
        try:
            repo.git.restore("--staged", str(p))
        except Exception as restore_exc:  # pragma: no cover - best effort
            log.warning(f"Failed to unstage {file_path}: {restore_exc}")
        log.error(f"Failed to stage {file_path}: {exc}")
        raise
