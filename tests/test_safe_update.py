import subprocess
import importlib


def test_failed_self_review_resets_commit(tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=repo, check=True)
    initial = repo / "initial.txt"
    initial.write_text("start\n", encoding="utf-8")
    subprocess.run(["git", "add", str(initial)], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=repo, check=True)
    head_before = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo).decode().strip()

    fsu = importlib.import_module("forgekeeper.forgekeeper_safe_update")
    monkeypatch.setattr(fsu, "load_state", lambda: {"review_max_retries": 1})
    monkeypatch.setattr(fsu, "save_state", lambda state: None)

    def failing_pipeline(task, state):
        f = repo / "temp.txt"
        f.write_text("data\n", encoding="utf-8")
        subprocess.run(["git", "add", str(f)], cwd=repo, check=True)
        subprocess.run(["git", "commit", "-m", "temp"], cwd=repo, check=True)
        return False

    monkeypatch.setattr(fsu, "run_update_pipeline", failing_pipeline)
    monkeypatch.setattr(fsu.os, "execv", lambda *args, **kwargs: None)
    monkeypatch.chdir(repo)
    fsu.run_safe_update()

    head_after = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo).decode().strip()
    assert head_before == head_after
