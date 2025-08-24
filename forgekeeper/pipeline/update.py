import json
from pathlib import Path

from forgekeeper.summarizer import summarize_repository
from forgekeeper.file_analyzer import analyze_repo_for_task
from forgekeeper.code_edit.llm_diff import generate_code_edit
from forgekeeper.code_edit.patcher import apply_unified_diff
from forgekeeper.change_stager import diff_and_stage_changes
from forgekeeper.git_committer import commit_and_push_changes
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.self_review import run_self_review
from forgekeeper import self_review

log = get_logger(__name__, debug=DEBUG_MODE)

MODULE_DIR = Path(__file__).resolve().parents[1]


def run_update_pipeline(task_prompt: str, state: dict) -> bool:
    """Run a full self-edit cycle for the given task and review the commit.

    Parameters
    ----------
    task_prompt : str
        Description of the current task guiding repository updates.
    state : dict
        Mutable state dictionary persisted between iterations.

    Returns
    -------
    bool
        ``True`` if the self-review passes, otherwise ``False``.
    """
    log.info("Summarizing repository")
    summaries = summarize_repository()
    summaries_path = MODULE_DIR / "summaries.json"
    summaries_path.write_text(json.dumps(summaries, indent=2), encoding="utf-8")

    log.info("Analyzing repository for task relevance")
    ranked_files = analyze_repo_for_task(task_prompt, str(summaries_path))

    for item in ranked_files:
        file_path = item["file"]
        summary = item.get("summary", "")
        p = Path(file_path)
        if not p.exists():
            log.warning(f"File not found: {file_path}")
            continue
        original_code = p.read_text(encoding="utf-8")
        patch = generate_code_edit(task_prompt, file_path, summary, "")
        changed = apply_unified_diff(patch)
        if str(p) in changed or file_path in changed:
            modified_code = p.read_text(encoding="utf-8")
            diff_and_stage_changes(original_code, modified_code, file_path)

    task_id = state.get("current_task", {}).get("task_id", "manual")
    commit_result = commit_and_push_changes(task_prompt, task_id=task_id)
    if not commit_result.get("passed", False):
        return False

    review = self_review.review_change_set(task_id)
    review_passed = review.get("passed", False)
    return review_passed and run_self_review(state)
