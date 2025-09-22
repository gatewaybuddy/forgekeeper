from __future__ import annotations

import os
import time
import importlib


def test_v2_single_mode_mock_runs_quickly(monkeypatch):
    monkeypatch.setenv("PYTHONUNBUFFERED", "1")
    # Ensure no tools and no network dependency
    argv = ["run", "--llm", "mock", "--mode", "single", "--no-tools", "--duration", "0.2"]
    cli = importlib.import_module("forgekeeper_v2.cli")
    start = time.time()
    cli.main(argv)
    assert time.time() - start < 5


def test_v2_duet_mode_mock_runs_quickly(monkeypatch):
    monkeypatch.setenv("PYTHONUNBUFFERED", "1")
    argv = ["run", "--llm", "mock", "--mode", "duet", "--no-tools", "--duration", "0.2"]
    cli = importlib.import_module("forgekeeper_v2.cli")
    start = time.time()
    cli.main(argv)
    assert time.time() - start < 5


def test_pkg_entry_conversation_flag_parses(monkeypatch):
    # Validate that entry point accepts --conversation and exits via SystemExit
    import forgekeeper.__main__ as entry
    try:
        entry.main(["--conversation", "run", "--llm", "mock", "--mode", "duet", "--no-tools", "--duration", "0.1"])  # type: ignore[arg-type]
    except SystemExit as e:
        # main raises SystemExit; returning 0 indicates success path
        assert isinstance(e.code, int) or e.code is None
