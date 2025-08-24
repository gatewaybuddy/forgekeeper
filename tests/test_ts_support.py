import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from forgekeeper.summarizer import summarize_file
from forgekeeper.file_analyzer import analyze_repo_for_task


FIXTURES = Path(__file__).parent / "fixtures"


def test_ts_summary_extraction():
    info = summarize_file(FIXTURES / "sample.ts")
    summary = info["summary"]
    assert info["lang"] == "ts"
    assert "react" in summary
    assert "greet" in summary and "helper" in summary
    assert "value" in summary
    assert "Sample utility" in summary


def test_tsx_summary_extraction():
    info = summarize_file(FIXTURES / "component.tsx")
    summary = info["summary"]
    assert info["lang"] == "tsx"
    assert "Component docs" in summary
    assert "react" in summary
    assert "MyComponent" in summary


def test_analyzer_ranks_ts_files(tmp_path):
    sample_ts = FIXTURES / "sample.ts"
    py_file = tmp_path / "other.py"
    py_file.write_text("def other():\n    pass\n")

    summaries = {
        "sample.ts": summarize_file(sample_ts),
        "other.py": summarize_file(py_file),
    }
    summary_path = tmp_path / "summaries.json"
    summary_path.write_text(json.dumps(summaries))

    results = analyze_repo_for_task("greet", summary_path=str(summary_path))
    assert results[0]["file"] == "sample.ts"
