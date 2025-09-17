from __future__ import annotations

from forgekeeper.config import DEBUG_MODE
from forgekeeper.logger import get_logger

from .task_retriever import get_next_task
from .coder_io import request_coder_update
from .task_committer import stage_and_commit_task
from forgekeeper.memory.agentic.orchestrator import MemoryOrchestrator
from forgekeeper.memory.agentic.registry import all as all_agents
from forgekeeper.memory.agentic.feedback import credit_assignment, record_application
from forgekeeper.memory.events import event_from_text, publish

import json
import os
from pathlib import Path

log = get_logger(__name__, debug=DEBUG_MODE)


def execute_next_task(session_id: str) -> None:
    """Execute the next queued task using the coder agent."""
    task = get_next_task(session_id)
    if not task:
        log.info("No tasks available.")
        return

    task_id = f"{abs(hash(task.description)) % 1000000:06d}"
    file_path, updated_code = request_coder_update(
        task.description, session_id, task_id
    )
    if not file_path:
        return
    mode = os.getenv("FORGEKPR_MODE", "interactive")
    orchestrator = MemoryOrchestrator(all_agents(), mode=mode)
    event = event_from_text(
        "agent_output",
        updated_code,
        agent="Coder",
        task_id=task_id,
        path=file_path,
    )
    publish(event)
    suggestions = orchestrator.handle(event)
    patched = orchestrator.apply_patches(updated_code, suggestions)
    for s in suggestions:
        if s.type == "patch" and s.span:
            record_application("applied", s.agent_id, s)

    non_patch = [s.__dict__ for s in suggestions if s.type != "patch"]
    if non_patch:
        logs_dir = Path("logs") / task_id
        logs_dir.mkdir(parents=True, exist_ok=True)
        (logs_dir / "memory_suggestions.json").write_text(
            json.dumps(non_patch, indent=2),
            encoding="utf-8",
        )

    stage_and_commit_task(file_path, patched, task.description, task_id)
    credit_assignment()
