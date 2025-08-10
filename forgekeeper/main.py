"""Main entrypoint for Forgekeeper."""

import json
import re
import subprocess
import sys
from pathlib import Path

from git import Repo
import yaml

from forgekeeper.state_manager import load_state, save_state
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE, ENABLE_RECURSIVE_FIX, AUTONOMY_MODE
from forgekeeper.file_summarizer import summarize_repository
from forgekeeper.file_analyzer import analyze_repo_for_task
from forgekeeper.code_editor import generate_code_edit, apply_unified_diff
from forgekeeper.change_stager import diff_and_stage_changes
from forgekeeper.git_committer import commit_and_push_changes
from forgekeeper.self_review import run_self_review, review_change_set
from forgekeeper.task_queue import TaskQueue
from forgekeeper.memory.episodic import append_entry
from forgekeeper.vcs.pr_api import create_draft_pr
from tools.auto_label_pr import FRONTMATTER_RE

MODULE_DIR = Path(__file__).resolve().parent
STATE_PATH = MODULE_DIR / "state.json"
TASK_FILE = MODULE_DIR.parent / "tasks.md"
TOP_N_FILES = 3

log = get_logger(__name__, debug=DEBUG_MODE)


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _mark_task_needs_review(task_id: str) -> None:
    """Update ``tasks.md`` to mark the given task as ``needs_review``."""
    path = TASK_FILE
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    idx = 0
    pieces: list[str] = []
    while True:
        m = FRONTMATTER_RE.search(text, idx)
        if not m:
            pieces.append(text[idx:])
            break
        start, end = m.span()
        pieces.append(text[idx:start])
        fm = yaml.safe_load(m.group(1)) or {}
        if str(fm.get("id", "")).strip().upper() == task_id.upper():
            fm["status"] = "needs_review"
            front = yaml.safe_dump(fm, sort_keys=False).strip()
            pieces.append(f"---\n{front}\n---\n")
        else:
            pieces.append(m.group(0))
        idx = end
    path.write_text("".join(pieces), encoding="utf-8")


def _check_reviewed_tasks() -> None:
    """Update tasks marked ``needs_review`` if their PRs were merged."""
    tasks_file = TASK_FILE
    script = MODULE_DIR.parent / "tools" / "mark_done_if_merged.py"
    if not tasks_file.exists() or not script.exists():
        return
    try:
        import yaml as _yaml  # type: ignore
    except Exception:  # pragma: no cover - optional dependency
        return
    text = tasks_file.read_text(encoding="utf-8")
    ids: list[str] = []
    for m in re.finditer(r"^---\n(.*?)\n---", text, re.MULTILINE | re.DOTALL):
        try:
            data = _yaml.safe_load(m.group(1)) or {}
        except Exception:
            continue
        if data.get("status") == "needs_review" and data.get("id"):
            ids.append(str(data["id"]))
    for tid in ids:
        subprocess.run([sys.executable, str(script), tid], check=False)


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
    """Commit staged changes on a task-specific branch."""
    meta = state.get("current_task", {})
    task_id = meta.get("task_id", "task")
    slug = meta.get("slug", _slugify(task))
    branch = f"fk/{task_id}-{slug}"
    repo = Repo(MODULE_DIR.parent)
    try:
        repo.git.checkout("-b", branch)
    except Exception:
        repo.git.checkout(branch)
    result = commit_and_push_changes(
        task,
        autonomous=True,
        task_id=task_id,
        auto_push=AUTONOMY_MODE,
    )
    if not result.get("passed", True):
        return False
    # logs are already written within commit_and_push_changes
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


def _spawn_followup_task(
    parent: dict,
    review: dict,
    tasks_file: Path | None = None,
    logs_root: Path | None = None,
) -> str:
    """Append a new canonical task capturing failing tool output."""
    tasks_file = Path(tasks_file) if tasks_file else TASK_FILE
    logs_root = Path(logs_root) if logs_root else MODULE_DIR.parent

    text = tasks_file.read_text(encoding="utf-8") if tasks_file.exists() else ""
    ids = [int(num) for num in re.findall(r"id:\s*FK-(\d+)", text)]
    new_num = max(ids) + 1 if ids else 1
    new_id = f"FK-{new_num:03d}"

    parent_id = parent.get("task_id", "unknown")
    epic = parent.get("epic", "")

    body_lines: list[str] = []
    for cmd, res in review.get("tools", {}).items():
        if res.get("passed"):
            continue
        output = res.get("output", "").splitlines()[:20]
        body_lines.append(cmd)
        body_lines.extend(output)
        body_lines.append("")
    body = "\n".join(body_lines).rstrip()

    block = [
        "---",
        f"id: {new_id}",
        f"title: Fix failures from {parent_id} (P1)",
        "status: todo",
        f"epic: {epic}",
        "owner: agent",
        "labels: [autofix, reliability]",
        "---",
    ]
    if body:
        block.append(body)
    block_text = "\n".join(block) + "\n"

    with tasks_file.open("a", encoding="utf-8") as fh:
        if text and not text.endswith("\n"):
            fh.write("\n")
        fh.write(block_text)

    log_dir = logs_root / "logs" / parent_id
    log_dir.mkdir(parents=True, exist_ok=True)
    spawned_file = log_dir / "spawned.json"
    spawned: list[str] = []
    if spawned_file.exists():
        try:
            existing = json.loads(spawned_file.read_text(encoding="utf-8"))
            if isinstance(existing, list):
                spawned = existing
        except Exception:
            pass
    spawned.append(new_id)
    spawned_file.write_text(json.dumps(spawned, indent=2), encoding="utf-8")

    return new_id


def main() -> None:
    _check_reviewed_tasks()
    state = load_state(STATE_PATH)
    current = state.get("current_task")
    if current:
        task = current.get("title") or current.get("description", "")
        # ensure title is set for downstream logic
        state["current_task"].setdefault("title", task)
        log.info(f"Resuming task: {task}")
    else:
        queue = TaskQueue(TASK_FILE)
        meta = queue.next_task()
        if not meta:
            log.info("No tasks available. Exiting.")
            return
        task = meta["title"]
        task_id = meta.get("id", f"{abs(hash(task)) % 1000000:06d}")
        slug = _slugify(task)[:40]
        state["current_task"] = {**meta, "task_id": task_id, "slug": slug}
        state["pipeline_step"] = 0
        state["attempt"] = 1
        state["fix_guidelines"] = ""
        log.info(f"Starting new task: {task}")
        log_dir = MODULE_DIR.parent / "logs" / task_id
        log_dir.mkdir(parents=True, exist_ok=True)
        (log_dir / "prompt.txt").write_text(task, encoding="utf-8")
        save_state(state, STATE_PATH)

    task = state["current_task"].get("title") or state["current_task"].get("description", "")
    task_id = state["current_task"]["task_id"]
    state.setdefault("attempt", 1)

    while True:
        log.info("Dispatching task to execution pipeline...")
        success = _execute_pipeline(task, state)
        attempt_num = state.get("attempt", 1)
        changed_files = state.get("changed_files", [])
        log_dir = Path("logs") / task_id
        artifacts = [str(log_dir)] if log_dir.exists() else []

        if not success:
            log.info("Pipeline incomplete. Progress saved for resume.")
            save_state(state, STATE_PATH)
            summary = f"Attempt {attempt_num} for task '{task}' did not complete the pipeline."
            append_entry(
                task_id,
                task,
                "pipeline-incomplete",
                changed_files,
                summary,
                artifacts,
            )
            return

        review = review_change_set(task_id)
        review_artifact = Path("logs") / task_id / "self-review.json"
        append_entry(
            task_id,
            task,
            "change-set-review",
            review.get("changed_files", []),
            review.get("summary", ""),
            [str(review_artifact)],
        )
        if review["passed"]:
            log.info("Change-set review passed. Running self-review...")
            review_passed = run_self_review(state, STATE_PATH)
            if review_passed:
                log.info("Task completed successfully.")
                # Try to open a draft PR and mark the task for human review
                try:
                    pr = create_draft_pr(state["current_task"], str(TASK_FILE))
                except Exception as exc:  # pragma: no cover - best effort
                    log.error(f"PR creation failed: {exc}")
                    pr = {}
                else:
                    pr_dir = MODULE_DIR.parent / "logs" / task_id
                    pr_dir.mkdir(parents=True, exist_ok=True)
                    (pr_dir / "pr.json").write_text(
                        json.dumps({"url": pr.get("html_url")}, indent=2),
                        encoding="utf-8",
                    )
                _mark_task_needs_review(state["current_task"].get("id", ""))

                # Record episodic memory success
                summary = f"Attempt {attempt_num} for task '{task}' succeeded."
                append_entry(task_id, task, "success", changed_files, summary, artifacts)

                state.clear()
            else:
                log.error("Self-review failed. Progress saved for inspection.")
                summary = f"Attempt {attempt_num} for task '{task}' failed self-review."
                append_entry(task_id, task, "self-review-failed", changed_files, summary, artifacts)
                _spawn_followup_task(state["current_task"], review)
            break

        # change-set review failed
        log.error("Change-set review failed.")
        if not ENABLE_RECURSIVE_FIX or state.get("attempt", 1) >= 3:
            log.error("Maximum attempts reached or recursive fix disabled.")
            artifact = Path("logs") / task_id / "self-review.json"
            state.clear()
            state["blocked_artifact"] = str(artifact)
            artifacts.append(str(artifact))
            summary = f"Attempt {attempt_num} for task '{task}' failed change-set review."
            append_entry(task_id, task, "failed", changed_files, summary, artifacts)
            break

        errors = "\n\n".join(
            res["output"] for res in review["tools"].values() if not res["passed"]
        )
        state["fix_guidelines"] = f"Fix these exact lints/tests:\n{errors}"
        state["attempt"] = attempt_num + 1
        state["pipeline_step"] = 1
        save_state(state, STATE_PATH)

        summary = f"Attempt {attempt_num} for task '{task}' failed review; retrying."
        append_entry(task_id, task, "retry", changed_files, summary, artifacts)

    save_state(state, STATE_PATH)


if __name__ == "__main__":
    main()
