import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forgekeeper.memory import query_similar_tasks


def test_query_similar_tasks(tmp_path):
    mem_dir = tmp_path / ".forgekeeper" / "memory"
    mem_dir.mkdir(parents=True)
    mem_file = mem_dir / "episodic.jsonl"
    entries = [
        {"task_id": "1", "summary": "add numbers", "status": "success"},
        {"task_id": "2", "summary": "subtract numbers", "status": "success"},
        {"task_id": "3", "summary": "multiply values", "status": "success"},
    ]
    mem_file.write_text("\n".join(json.dumps(e) for e in entries))

    results = query_similar_tasks("add", mem_path=mem_file)
    assert any("add numbers" in r for r in results)
