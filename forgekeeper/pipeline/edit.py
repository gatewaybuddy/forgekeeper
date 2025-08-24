import json
from pathlib import Path

from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from forgekeeper.code_edit.llm_diff import generate_code_edit
from forgekeeper.code_edit.patcher import apply_unified_diff
from forgekeeper.change_stager import diff_and_stage_changes

MODULE_DIR = Path(__file__).resolve().parents[1]
log = get_logger(__name__, debug=DEBUG_MODE)

TOP_N_FILES = 3


def step_edit(task: str, state: dict) -> bool:
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
