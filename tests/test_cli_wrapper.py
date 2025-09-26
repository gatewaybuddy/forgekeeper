from types import SimpleNamespace

import pytest

import forgekeeper.__main__ as entry


def _fake_result(code: int = 0):
    return SimpleNamespace(returncode=code)


def test_main_invokes_start_wrapper(monkeypatch):
    captured = {}

    def fake_builder(extra):  # noqa: ANN001
        captured["extra"] = extra
        return ["/bin/bash", "run.sh"]

    monkeypatch.setattr(entry, "_build_start_command", fake_builder)
    monkeypatch.setattr(entry.subprocess, "run", lambda cmd, check: _fake_result(0))

    rc = entry.main(["--debug"])
    assert rc == 0
    assert captured["extra"] == ["--debug"]


def test_main_cli_only_passthrough(monkeypatch):
    captured = {}

    def fake_run_conv(argv):  # noqa: ANN001
        captured["argv"] = argv
        return 7

    monkeypatch.setattr(entry, "_run_conversation", fake_run_conv)

    rc = entry.main(["--cli-only", "--mode", "single"])
    assert rc == 7
    assert captured["argv"] == ["--mode", "single"]


def test_windows_extra_args_not_supported(monkeypatch):
    monkeypatch.setattr(entry.os, "name", "nt")
    monkeypatch.setattr(entry.shutil, "which", lambda name: "pwsh" if name in {"pwsh", "powershell", "powershell.exe"} else None)

    with pytest.raises(SystemExit) as excinfo:
        entry._build_start_command(["--debug"])  # noqa: SLF001

    assert "Additional options" in str(excinfo.value)
