import json
from pathlib import Path

from forgekeeper.summarizer import summarize_repository
from forgekeeper.file_analyzer import analyze_repo_for_task
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE

MODULE_DIR = Path(__file__).resolve().parents[1]
log = get_logger(__name__, debug=DEBUG_MODE)


def step_analyze(task: str, state: dict) -> bool:
    """Summarize repository and rank files for the given task."""
    summaries = summarize_repository()
    summaries_path = MODULE_DIR / "summaries.json"
    summaries_path.write_text(json.dumps(summaries, indent=2), encoding="utf-8")
    state["analysis"] = analyze_repo_for_task(task, str(summaries_path))
    return True
