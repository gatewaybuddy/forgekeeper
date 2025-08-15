import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import forgekeeper.commands as cmd


def test_add_command_appends_canonical_task(tmp_path, monkeypatch):
    tasks_md = tmp_path / "tasks.md"
    tasks_md.write_text("## Canonical Tasks\n", encoding="utf-8")

    monkeypatch.setattr(cmd, "TASK_FILE", tasks_md)

    cmd.main([
        "add",
        "FK-123",
        "Demo Task (P1)",
        "--labels",
        "demo,cli",
        "--body",
        "Test body",
    ])

    content = tasks_md.read_text(encoding="utf-8")
    assert "id: FK-123" in content
    assert "title: Demo Task (P1)" in content
    assert 'labels: ["demo", "cli"]' in content
    assert "Test body" in content
