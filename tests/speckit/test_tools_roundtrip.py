from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forgekeeper.toolspec import ToolRegistry
from forgekeeper.toolspec.speckit_tools import register_speckit_tools


def test_tools_roundtrip(tmp_path: Path) -> None:
    registry = ToolRegistry()
    register_speckit_tools(registry)

    tools = [record for record in registry.list_tools() if record.namespace == "speckit"]
    assert len(tools) == 8

    init_result = registry.invoke("speckit.init", {"root": str(tmp_path)})
    assert init_result["ok"] is True
    assert "spec/spec.md" in init_result["created"]

    repeat_result = registry.invoke("speckit.init", {"root": str(tmp_path)})
    assert repeat_result["created"] == []

    sync_from = registry.invoke("speckit.sync_from_repo", {"root": str(tmp_path)})
    artifacts = sync_from["artifacts"]

    sync_to = registry.invoke(
        "speckit.sync_to_repo",
        {"root": str(tmp_path), "artifacts": artifacts},
    )
    assert sync_to["ok"] is True

    sync_after = registry.invoke("speckit.sync_from_repo", {"root": str(tmp_path)})
    assert sync_after["artifacts"]["spec:root"]["metadata"] == artifacts["spec:root"]["metadata"]
    assert sync_after["artifacts"]["plan:root"]["metadata"] == artifacts["plan:root"]["metadata"]
    assert sync_after["artifacts"]["tickets"] == artifacts["tickets"]

