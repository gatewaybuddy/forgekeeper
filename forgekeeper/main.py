"""Main entrypoint for Forgekeeper."""

import json
import re
from pathlib import Path

from git import Repo

from forgekeeper.state_manager import load_state, save_state
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE, ENABLE_RECURSIVE_FIX
from forgekeeper.file_summarizer import summarize_repository
from forgekeeper.file_analyzer import analyze_repo_for_task
from forgekeeper.code_editor import generate_code_edit, apply_unified_diff
from forgekeeper.change_stager import diff_and_stage_changes
from forgekeeper.git_committer import commit_and_push_changes
from forgekeeper.self_review import run_self_review, review_change_set
from forgekeeper.task_queue import TaskQueue

MODULE_DIR = Path(__file__).resolve().parent
STATE_PATH = MODULE_DIR / "state.json"
TASK_FILE = MODULE_DIR.parent / "tasks.md"
TOP_N_FILES = 3

log = get_logger(__name__, debug=DEBUG_MODE)


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _step_analyze(task: str, state: dict) -> bool:
    """Summarize repository and rank files for the given task."""
    summaries = summarize_repository()
    summaries_path = MODULE_DIR / "summaries.json"
    summaries_path.write_text(json.dumps(summaries, indent=2), encoding="utf-8")
    state["analysis"] = analyze_repo_for_task(task, str(summaries_path))
    return True


def _step_edit(task: str, state: dict) -> bool:
    """Generate code edits for top relevant files and stage changes."""
    analysis = state.get("analysis", [])
    if not analysis:
        return True
    meta = state.get("current_task", {})
    task_id = meta.get("task_id", "task")
    log_dir = MODULE_DIR.parent / "logs" / task_id
    log_dir.mkdir(parents=True, exist_ok=True)
    patch_texts: list[str] = []
    changed_files: list[str] = []
    guidelines = state.get("fix_guidelines", "")
    for item in analysis[:TOP_N_FILES]:
        file_path = item["file"]
        summary = item.get("summary", "")
        p = Path(file_path)
        if not p.exists():
            log.warning(f"File not found: {file_path}")
            continue
        original_code = p.read_text(encoding="utf-8")
        patch = generate_code_edit(task, file_path, summary, guidelines)
        if not patch.strip():
            continue
        try:
            changed = apply_unified_diff(patch)
        except Exception as exc:
            log.error(f"Patch apply failed for {file_path}: {exc}")
            continue
        if not changed:
            continue
        modified_code = p.read_text(encoding="utf-8")
        diff_and_stage_changes(original_code, modified_code, file_path)
        patch_texts.append(patch)
        changed_files.extend(changed)
    if patch_texts:
        (log_dir / "patch.diff").write_text("\n".join(patch_texts), encoding="utf-8")
        (log_dir / "files.json").write_text(
            json.dumps(sorted(set(changed_files)), indent=2), encoding="utf-8"
        )
    state["changed_files"] = sorted(set(changed_files))
    state["fix_guidelines"] = ""
    return True


def _step_commit(task: str, state: dict) -> bool:
    """Commit staged changes on a task-specific branch and mark status."""
    meta = state.get("current_task", {})
    task_id = meta.get("task_id", "task")
    slug = meta.get("slug", _slugify(task))
    branch = f"fk/{task_id}-{slug}"
    repo = Repo(MODULE_DIR.parent)
    try:
        repo.git.checkout("-b", branch)
    except Exception:
        repo.git.checkout(branch)
    result = commit_and_push_changes(task, autonomous=True)
    if not result.get("passed", True):
        return False
    queue = TaskQueue(TASK_FILE)
    t = queue.get_task(task)
    if t:
        queue.mark_needs_review(t)
    log_dir = MODULE_DIR.parent / "logs" / task_id
    if result.get("artifacts_path"):
        src = Path(result["artifacts_path"])
        if src.exists():
            dst = log_dir / src.name
            dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    return True


PIPELINE = [_step_analyze, _step_edit, _step_commit]


def _execute_pipeline(task: str, state: dict) -> bool:
    """Run pipeline steps sequentially, saving progress after each step.

    The ``pipeline_step`` value in ``state`` tracks the next step to run so
    the pipeline can resume if interrupted.
    """
    step_index = state.get("pipeline_step", 0)
    for idx in range(step_index, len(PIPELINE)):
        step = PIPELINE[idx]
        log.info(f"Executing step {idx + 1}/{len(PIPELINE)}: {step.__name__}")
        try:
            success = step(task, state)
        except Exception as exc:  # pragma: no cover - defensive
            log.error(f"Step {step.__name__} failed: {exc}")
            state["pipeline_step"] = idx
            return False
        if not success:
            if idx == 1:
                state["analysis"] = []
            state["pipeline_step"] = idx
            return False
        state["pipeline_step"] = idx + 1
        save_state(state, STATE_PATH)
    return True


def main() -> None:
    state = load_state(STATE_PATH)
    queue = TaskQueue(TASK_FILE)
    current = state.get("current_task")
    if current:
        task_obj = queue.get_task(current["description"])
        if task_obj:
            task = task_obj.description
            log.info(f"Resuming task: {task}")
        else:
            current = None
    if not current:
        task_obj = queue.next_task()
        if not task_obj:
            log.info("No tasks available. Exiting.")
            return
        task = task_obj.description
        task_id = f"{abs(hash(task)) % 1000000:06d}"
        slug = _slugify(task)[:40]
        state["current_task"] = {**task_obj.to_dict(), "task_id": task_id, "slug": slug}
        state["pipeline_step"] = 0
        state["attempt"] = 1
        state["fix_guidelines"] = ""
        log.info(f"Starting new task: {task}")
        log_dir = MODULE_DIR.parent / "logs" / task_id
        log_dir.mkdir(parents=True, exist_ok=True)
        (log_dir / "prompt.txt").write_text(task, encoding="utf-8")
        queue.mark_in_progress(task_obj)
        save_state(state, STATE_PATH)

    task = state["current_task"]["description"]
    task_id = state["current_task"]["task_id"]
    state.setdefault("attempt", 1)

    while True:
        log.info("Dispatching task to execution pipeline...")
        success = _execute_pipeline(task, state)
        if not success:
            log.info("Pipeline incomplete. Progress saved for resume.")
            save_state(state, STATE_PATH)
            return

        review = review_change_set(task_id)
        if review["passed"]:
            log.info("Change-set review passed. Running self-review...")
            review_passed = run_self_review(state, STATE_PATH)
            if review_passed:
                log.info("Task completed successfully. Updating task list.")
                task_obj = queue.get_task(task)
                if task_obj:
                    queue.mark_done(task_obj)
                state.clear()
            else:
                log.error("Self-review failed. Progress saved for inspection.")
            break

        log.error("Change-set review failed.")
        if not ENABLE_RECURSIVE_FIX or state.get("attempt", 1) >= 3:
            log.error(
                "Maximum attempts reached or recursive fix disabled. Marking task blocked."
            )
            task_obj = queue.get_task(task)
            if task_obj:
                queue.mark_blocked(task_obj)
            artifact = Path("logs") / task_id / "self-review.json"
            state.clear()
            state["blocked_artifact"] = str(artifact)
            break

        errors = "\n\n".join(
            res["output"] for res in review["tools"].values() if not res["passed"]
        )
        state["fix_guidelines"] = f"Fix these exact lints/tests:\n{errors}"
        state["attempt"] = state.get("attempt", 1) + 1
        state["pipeline_step"] = 1
        save_state(state, STATE_PATH)

    save_state(state, STATE_PATH)


if __name__ == "__main__":
    main()
