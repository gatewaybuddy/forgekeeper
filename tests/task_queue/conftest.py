import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from forgekeeper.tasks.queue import TaskQueue


@pytest.fixture
def tasks_file(tmp_path):
    def _write(text: str):
        path = tmp_path / "tasks.md"
        path.write_text(text, encoding="utf-8")
        return path
    return _write


@pytest.fixture
def queue_from_text(tasks_file):
    def _queue(text: str):
        return TaskQueue(tasks_file(text))
    return _queue
