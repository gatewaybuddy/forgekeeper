from __future__ import annotations

import subprocess
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forgekeeper.tools.patch_caps import apply_unified_diff


def _init_repo(path: Path) -> None:
    subprocess.run(["git", "init"], cwd=path, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def test_apply_unified_diff_within_caps(tmp_path: Path) -> None:
    _init_repo(tmp_path)
    file_path = tmp_path / "notes.txt"
    file_path.write_text("hello\n", encoding="utf-8")
    subprocess.run(["git", "add", "notes.txt"], cwd=tmp_path, check=True)

    file_path.write_text("hello\nworld\n", encoding="utf-8")
    diff = subprocess.run(
        ["git", "diff"],
        cwd=tmp_path,
        check=True,
        stdout=subprocess.PIPE,
        text=True,
    ).stdout
    file_path.write_text("hello\n", encoding="utf-8")

    result = apply_unified_diff(diff, tmp_path)
    assert result.applied is True
    assert result.rollback_path is not None
    assert (tmp_path / "notes.txt").read_text(encoding="utf-8") == "hello\nworld\n"


def test_apply_unified_diff_enforces_file_cap(tmp_path: Path) -> None:
    diff = """diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -0,0 +1 @@\n+one\ndiff --git a/b.txt b/b.txt\n--- a/b.txt\n+++ b/b.txt\n@@ -0,0 +1 @@\n+two\ndiff --git a/c.txt b/c.txt\n--- a/c.txt\n+++ b/c.txt\n@@ -0,0 +1 @@\n+three\ndiff --git a/d.txt b/d.txt\n--- a/d.txt\n+++ b/d.txt\n@@ -0,0 +1 @@\n+four\n"""
    result = apply_unified_diff(diff, tmp_path)
    assert result.applied is False
    assert "exceeds cap" in result.message


def test_apply_unified_diff_enforces_line_cap(tmp_path: Path) -> None:
    additions = "\n".join(f"+line {i}" for i in range(260))
    diff = (
        "diff --git a/long.txt b/long.txt\n"
        "--- a/long.txt\n"
        "+++ b/long.txt\n"
        "@@ -0,0 +1,260 @@\n"
        f"{additions}\n"
    )
    result = apply_unified_diff(diff, tmp_path)
    assert result.applied is False
    assert "exceeds cap" in result.message

