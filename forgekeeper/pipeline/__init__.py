from .analyze import step_analyze
from .edit import step_edit
from .commit import step_commit, commit_with_log, slugify
from .runner import PIPELINE, execute_pipeline
from .update import run_update_pipeline
from .main import TaskPipeline
from .undo import undo_last_commit

# Re-export helpers used by tests for monkeypatching
from forgekeeper.file_summarizer import summarize_repository
from forgekeeper.file_analyzer import analyze_repo_for_task
from forgekeeper.code_edit.llm_diff import generate_code_edit
from forgekeeper.code_edit.patcher import apply_unified_diff
from forgekeeper.change_stager import diff_and_stage_changes
from forgekeeper.git_committer import commit_and_push_changes
from forgekeeper.self_review import run_self_review
from forgekeeper import self_review

__all__ = [
    "step_analyze",
    "step_edit",
    "step_commit",
    "commit_with_log",
    "slugify",
    "PIPELINE",
    "execute_pipeline",
    "run_update_pipeline",
    "TaskPipeline",
    "undo_last_commit",
    "summarize_repository",
    "analyze_repo_for_task",
    "generate_code_edit",
    "apply_unified_diff",
    "diff_and_stage_changes",
    "commit_and_push_changes",
    "run_self_review",
    "self_review",
]
