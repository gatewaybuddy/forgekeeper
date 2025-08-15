import json
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def init_repo(tmp_path: Path, monkeypatch):
    repo_dir = tmp_path / "repo"
    pkg_dir = repo_dir / "forgekeeper"
    pkg_dir.mkdir(parents=True)

    # copy required package files
    for name in [
        "__init__.py",
        "roadmap_updater.py",
        "roadmap_committer.py",
        "logger.py",
        "config.py",
    ]:
        shutil.copy(ROOT / "forgekeeper" / name, pkg_dir / name)
    shutil.copytree(ROOT / "forgekeeper" / "memory", pkg_dir / "memory")
    shutil.copytree(ROOT / "forgekeeper" / "llm", pkg_dir / "llm")
    # lightweight stub for git_committer to satisfy imports
    (pkg_dir / "git_committer.py").write_text(
        "def commit_and_push_changes(*args, **kwargs):\n    return {'passed': True}\n",
        encoding="utf-8",
    )

    (repo_dir / "Roadmap.md").write_text("# Roadmap\n", encoding="utf-8")

    subprocess.run(["git", "init"], cwd=repo_dir, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo_dir, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=repo_dir, check=True)
    subprocess.run(["git", "add", "Roadmap.md"], cwd=repo_dir, check=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=repo_dir, check=True)

    mem_file = repo_dir / ".forgekeeper" / "memory" / "episodic.jsonl"
    mem_file.parent.mkdir(parents=True, exist_ok=True)
    mem_file.write_text(json.dumps({"summary": "did something"}) + "\n", encoding="utf-8")

    monkeypatch.syspath_prepend(str(repo_dir))
    import importlib
    ru = importlib.import_module("forgekeeper.roadmap_updater")
    importlib.reload(ru)
    return repo_dir, ru, mem_file


def test_update_roadmap_appends(tmp_path, monkeypatch):
    orig_modules = {k: v for k, v in sys.modules.items() if k.startswith("forgekeeper")}
    repo, ru, mem_file = init_repo(tmp_path, monkeypatch)
    roadmap = repo / "Roadmap.md"
    ru.update_roadmap(repo_path=repo, roadmap_path=roadmap, memory_file=mem_file, commit_limit=1, memory_limit=1)
    content = roadmap.read_text(encoding="utf-8")
    assert "Summary" in content
    assert "Recent Commits" in content
    assert "did something" in content
    for mod in list(sys.modules):
        if mod.startswith("forgekeeper") and mod not in orig_modules:
            sys.modules.pop(mod)
    sys.modules.update(orig_modules)


def test_commit_logs_memory(tmp_path, monkeypatch):
    orig_modules = {k: v for k, v in sys.modules.items() if k.startswith("forgekeeper")}
    repo, ru, mem_file = init_repo(tmp_path, monkeypatch)
    roadmap = repo / "Roadmap.md"

    import importlib
    rc = importlib.import_module("forgekeeper.roadmap_committer")
    importlib.reload(rc)

    def fake_commit(*args, **kwargs):
        return {"passed": True}

    monkeypatch.setattr(rc, "commit_and_push_changes", fake_commit)

    import os
    cwd = os.getcwd()
    os.chdir(repo)
    try:
        rc.commit_roadmap_update(
            repo_path=repo,
            roadmap_path=roadmap,
            memory_file=mem_file,
            commit_limit=1,
            memory_limit=1,
        )
    finally:
        os.chdir(cwd)

    entries = mem_file.read_text(encoding="utf-8").strip().splitlines()
    assert len(entries) == 2
    data = json.loads(entries[-1])
    assert data["task_id"] == "roadmap-update"
    assert data["status"] == "done"
    for mod in list(sys.modules):
        if mod.startswith("forgekeeper") and mod not in orig_modules:
            sys.modules.pop(mod)
    sys.modules.update(orig_modules)

