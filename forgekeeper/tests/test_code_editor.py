import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forgekeeper.code_editor import generate_code_edit


def test_generate_code_edit_inserts_task_comment(tmp_path):
    sample = "def foo():\n    pass\n"
    file_path = tmp_path / "sample.py"
    file_path.write_text(sample, encoding="utf-8")

    task = "add logging"
    summary = "simple function"

    edited = generate_code_edit(str(file_path), task, summary)

    assert edited != sample
    assert task in edited
    assert summary in edited
    assert edited.index(task) < edited.index("def foo")
