import json
import subprocess
import sys


def run_cli(args, input_text=""):
    result = subprocess.run(
        [sys.executable, "-m", "forgekeeper.cli.memory_plane"] + args,
        input=input_text,
        text=True,
        capture_output=True,
        check=True,
    )
    return result.stdout


def test_cli_list():
    out = run_cli(["list"])
    assert "mem.reflex.teh-typo" in out


def test_cli_run_and_shadow():
    out = run_cli(["run"], "This is teh best.")
    lines = out.strip().splitlines()
    assert lines[0] == "This is the best."
    data = json.loads("\n".join(lines[1:]))
    assert any(s["type"] == "patch" for s in data)

    out_shadow = run_cli(["shadow"], "This is teh best.")
    lines = out_shadow.strip().splitlines()
    assert lines[0] == "This is teh best."
