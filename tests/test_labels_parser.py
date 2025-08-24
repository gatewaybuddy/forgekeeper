from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.labels.parser import parse_tasks_md


def test_parse_tasks_md_multiple_blocks(tmp_path):
    content = (
        "---\n"
        "id: FK-1\n"
        "title: First\n"
        "labels: [foo, bar]\n"
        "---\n"
        "Body one\n"
        "\n"
        "---\n"
        "id: fk-2\n"
        "title: Second\n"
        "---\n"
        "Body two\n"
    )
    p = tmp_path / "tasks.md"
    p.write_text(content)
    tasks = parse_tasks_md(str(p))
    assert set(tasks.keys()) == {"FK-1", "FK-2"}
    assert tasks["FK-1"]["title"] == "First"
    assert tasks["FK-1"]["labels"] == ["foo", "bar"]
    assert tasks["FK-1"]["body"] == "Body one"
    assert tasks["FK-2"]["labels"] == []
    assert tasks["FK-2"]["body"] == "Body two"


def test_parse_tasks_md_ignores_missing_id(tmp_path):
    content = (
        "---\n"
        "title: No ID\n"
        "---\n"
        "Body\n"
    )
    p = tmp_path / "tasks.md"
    p.write_text(content)
    assert parse_tasks_md(str(p)) == {}
