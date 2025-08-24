import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def init_repo(tmp_path, monkeypatch):
    def _init(checks_py="echo PY", checks_ts="echo TS"):
        repo_dir = tmp_path / "repo"
        pkg_dir = repo_dir / "forgekeeper"
        pkg_dir.mkdir(parents=True)
        for name in [
            "__init__.py",
            "config.py",
            "logger.py",
            "git_committer.py",
            "outbox.py",
            "diff_validator.py",
            "sandbox.py",
        ]:
            shutil.copy(ROOT / "forgekeeper" / name, pkg_dir / name)
        shutil.copytree(ROOT / "forgekeeper" / "git", pkg_dir / "git")
        mem_dir = pkg_dir / "memory"
        mem_dir.mkdir()
        for name in ["__init__.py", "episodic.py", "embeddings.py"]:
            shutil.copy(ROOT / "forgekeeper" / "memory" / name, mem_dir / name)
        emb_pkg = mem_dir / "embedding"
        emb_pkg.mkdir()
        (emb_pkg / "__init__.py").write_text(
            "def LocalEmbedder(*a, **k):\n    return None\n"
            "def SimpleTfidfVectorizer(*a, **k):\n    return None\n"
            "def cosine_similarity(a, b):\n    return 0.0\n"
            "def load_episodic_memory(*a, **k):\n    return []\n"
            "def retrieve_similar_tasks(*a, **k):\n    return []\n"
            "def similar_task_summaries(*a, **k):\n    return []\n",
            encoding="utf-8",
        )
        sr_pkg = pkg_dir / "self_review"
        sr_pkg.mkdir()
        (sr_pkg / "__init__.py").write_text(
            "import subprocess\n"
            "def review_staged_changes(task_id):\n"
            "    result = subprocess.run(['git','diff','--name-only','--cached'], capture_output=True, text=True, check=True)\n"
            "    files = [f for f in result.stdout.splitlines() if f]\n"
            "    return {'passed': True, 'staged_files': files}\n",
            encoding="utf-8",
        )
        subprocess.run(["git", "init"], cwd=repo_dir, check=True)
        subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo_dir, check=True)
        subprocess.run(["git", "config", "user.name", "Test"], cwd=repo_dir, check=True)
        subprocess.run(["git", "commit", "--allow-empty", "-m", "init"], cwd=repo_dir, check=True)
        monkeypatch.syspath_prepend(str(repo_dir))
        monkeypatch.setenv("CHECKS_PY", checks_py)
        monkeypatch.setenv("CHECKS_TS", checks_ts)

        import importlib

        for mod in list(sys.modules):
            if mod.startswith("forgekeeper"):
                sys.modules.pop(mod)

        config = importlib.import_module("forgekeeper.config")
        episodic = importlib.import_module("forgekeeper.memory.episodic")
        gc = importlib.import_module("forgekeeper.git_committer")
        importlib.reload(config)
        importlib.reload(episodic)
        monkeypatch.setattr(
            episodic,
            "MEMORY_FILE",
            repo_dir / ".forgekeeper/memory/episodic.jsonl",
        )
        importlib.reload(gc)
        monkeypatch.setattr(
            gc.sandbox_checks,
            "_run_sandbox_checks",
            lambda files, commit_message, task_id, run_checks, pre_review, diff_validation: {"passed": True, "artifacts_path": "", "results": []},
        )
        monkeypatch.chdir(repo_dir)
        return repo_dir, gc

    return _init
