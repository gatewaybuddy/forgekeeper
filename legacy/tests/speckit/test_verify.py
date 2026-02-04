from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forgekeeper.speckit.adapter import SpecRepoReader, SpecRepoWriter
from forgekeeper.speckit.verify import verify_repo
from forgekeeper.toolspec import ToolRegistry
from forgekeeper.toolspec.speckit_tools import register_speckit_tools


def test_verify_success_and_failure(tmp_path: Path) -> None:
    registry = ToolRegistry()
    register_speckit_tools(registry)
    registry.invoke("speckit.init", {"root": str(tmp_path)})

    ok_result = verify_repo(tmp_path)
    assert ok_result["ok"] is True

    reader = SpecRepoReader(tmp_path)
    tasks = reader.read_tasks()
    tasks[0].acceptance_tests = []
    writer = SpecRepoWriter(tmp_path)
    writer.write_tasks(tasks)

    bad_result = verify_repo(tmp_path)
    assert bad_result["ok"] is False
    assert any("acceptance_tests" in err for err in bad_result["errors"])

