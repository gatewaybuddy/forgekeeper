from __future__ import annotations

import io
import json
from pathlib import Path

import pytest

from tools.nav import __main__ as nav_cli


@pytest.fixture()
def navigation_dataset(tmp_path: Path) -> Path:
    module_index = {
        "packages": [
            {
                "name": "sample",
                "path": "sample",
                "docstring": "Sample package docstring.",
                "modules": [
                    {
                        "name": "sample.alpha",
                        "path": "sample/alpha.py",
                        "docstring": "Alpha module docstring.",
                        "classes": [{"name": "Alpha", "docstring": "Alpha class."}],
                        "functions": [
                            {"name": "make_alpha", "docstring": "Factory helper."},
                        ],
                    }
                ],
            }
        ],
        "standalone_modules": [
            {
                "name": "helpers.utility",
                "path": "helpers/utility.py",
                "docstring": "Utility helpers.",
                "classes": [],
                "functions": [{"name": "helper", "docstring": "Assist."}],
            }
        ],
    }
    (tmp_path / "module_index.json").write_text(json.dumps(module_index))

    cache = tmp_path / ".forgekeeper" / "cache"
    cache.mkdir(parents=True)

    python_graph = {
        "generated_at": "2024-01-01T00:00:00+00:00",
        "module_index": str(tmp_path / "module_index.json"),
        "stats": {"module_count": 2, "import_edges": 2, "internal_edges": 1},
        "modules": {
            "sample.alpha": {
                "path": "sample/alpha.py",
                "imports": ["helpers.utility", "json"],
                "details": [],
                "internal": ["helpers.utility"],
            },
            "helpers.utility": {
                "path": "helpers/utility.py",
                "imports": [],
                "details": [],
                "internal": [],
            },
        },
    }
    (cache / "python_import_graph.json").write_text(json.dumps(python_graph))

    frontend_graph = {
        "generated_at": "2024-01-01T00:00:00+00:00",
        "project_root": str(tmp_path / "frontend"),
        "graph": {
            "status": "ok",
            "tsconfig": "tsconfig.json",
            "fileCount": 2,
            "files": {
                "src/app.ts": ["./util", "./components/Button"],
                "src/util.ts": [],
            },
        },
    }
    (cache / "frontend_dependency_graph.json").write_text(json.dumps(frontend_graph))

    backend_graph = {
        "generated_at": "2024-01-01T00:00:00+00:00",
        "project_root": str(tmp_path / "backend"),
        "graph": {
            "status": "ok",
            "tsconfig": "tsconfig.json",
            "fileCount": 1,
            "files": {
                "services/task_service.ts": ["../shared/util", "./taskPipeline"],
            },
        },
    }
    (cache / "backend_dependency_graph.json").write_text(json.dumps(backend_graph))

    return tmp_path


def invoke(command: list[str], root: Path) -> tuple[str, str, int]:
    stdout = io.StringIO()
    stderr = io.StringIO()
    exit_code = nav_cli.main(["--root", str(root), *command], stdout=stdout, stderr=stderr)
    return stdout.getvalue(), stderr.getvalue(), exit_code


def test_list_modules_shows_index_entries(navigation_dataset: Path) -> None:
    stdout, stderr, code = invoke(["list-modules"], navigation_dataset)
    assert code == 0, stderr
    assert "sample.alpha" in stdout
    assert "helpers.utility" in stdout


def test_show_module_displays_details(navigation_dataset: Path) -> None:
    stdout, stderr, code = invoke(["show-module", "sample.alpha"], navigation_dataset)
    assert code == 0, stderr
    assert "Module: sample.alpha" in stdout
    assert "Alpha" in stdout
    assert "make_alpha" in stdout


def test_related_files_combines_python_and_ts_graphs(navigation_dataset: Path) -> None:
    stdout, stderr, code = invoke(["related-files", "util"], navigation_dataset)
    assert code == 0, stderr
    assert "Python modules:" in stdout
    assert "helpers.utility" in stdout
    assert "Frontend dependencies:" in stdout
    assert "src/app.ts" in stdout
    assert "Backend dependencies:" in stdout
    assert "services/task_service.ts" in stdout
