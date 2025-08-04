import json
from pathlib import Path

from forgekeeper.file_summarizer import summarize_repository
from forgekeeper.file_analyzer import analyze_repo_for_task
from forgekeeper.code_editor import generate_code_edit
from forgekeeper.change_stager import diff_and_stage_changes
from forgekeeper.git_committer import commit_and_push_changes
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE

log = get_logger(__name__, debug=DEBUG_MODE)


def run_update_pipeline(task_prompt: str) -> None:
    """Run a full self-edit cycle for the given task."""
    log.info("Summarizing repository")
    summaries = summarize_repository()
    summaries_path = Path("forgekeeper/summaries.json")
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
        modified_code = generate_code_edit(file_path, task_prompt, summary)
        diff_and_stage_changes(original_code, modified_code, file_path)

    commit_and_push_changes(task_prompt)
