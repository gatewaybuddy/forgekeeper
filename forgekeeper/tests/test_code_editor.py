import difflib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import forgekeeper.code_editor as code_editor
from forgekeeper.code_editor import generate_code_edit, apply_unified_diff


def test_generate_code_edit_returns_diff(monkeypatch, tmp_path):
    file_path = tmp_path / "sample.py"
    file_path.write_text("a = 1\n", encoding="utf-8")

    diff = "".join(
        difflib.unified_diff(
            ["a = 1\n"],
            ["a = 2\n"],
            fromfile=str(file_path),
            tofile=str(file_path),
            lineterm="",
        )
    )

    captured = {}

    def fake_ask(prompt: str) -> str:
        captured["prompt"] = prompt
        return diff

    monkeypatch.setattr(code_editor, "ask_coder", fake_ask)

    patch = generate_code_edit(
        "update value", str(file_path), "simple file", "PEP8 guidelines"
    )

    assert patch.strip() == diff.strip()
    assert "update value" in captured["prompt"]
    assert "simple file" in captured["prompt"]
    assert "PEP8 guidelines" in captured["prompt"]


def test_apply_unified_diff(tmp_path):
    file_path = tmp_path / "sample.py"
    original = "a = 1\nb = 2\n"
    file_path.write_text(original, encoding="utf-8")
    modified = "a = 1\nb = 3\n"
    patch = "".join(
        difflib.unified_diff(
            original.splitlines(True),
            modified.splitlines(True),
            fromfile=str(file_path),
            tofile=str(file_path),
        )
    )

    changed = apply_unified_diff(patch)

    assert str(file_path) in changed
    assert file_path.read_text(encoding="utf-8") == modified

