import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from forgekeeper.task_queue import TaskQueue


def test_next_task_priority_ordering(tmp_path):
    tasks_md = tmp_path / "tasks.md"
    tasks_md.write_text(
        """## Canonical Tasks

---
id: A1
title: First task (P2)
status: todo
labels: [one]
---

---
id: A2
title: Second task (P1)
status: todo
labels: [two]
---

---
id: A3
title: Third task (P1)
status: todo
labels: [three]
---
""",
        encoding="utf-8",
    )
    queue = TaskQueue(tasks_md)
    task = queue.next_task()
    assert task["id"] == "A2"
    assert task["priority"] == 1


def test_front_matter_skips_completed(tmp_path):
    tasks_md = tmp_path / "tasks.md"
    tasks_md.write_text(
        """## Canonical Tasks

---
id: C1
title: Done task (P0)
status: done
---

---
id: C2
title: Pending task (P1)
status: in_progress
---
""",
        encoding="utf-8",
    )
    queue = TaskQueue(tasks_md)
    task = queue.next_task()
    assert task["id"] == "C2"
    assert task["status"] == "in_progress"


def test_checkbox_tasks_ignore_completed(tmp_path):
    tasks_md = tmp_path / "tasks.md"
    tasks_md.write_text(
        """## Canonical Tasks

---
id: only_done
title: Only done (P0)
status: done
---

## Active
- [x] finished
- [ ] todo

## Completed
- [ ] should be ignored
""",
        encoding="utf-8",
    )
    queue = TaskQueue(tasks_md)
    task = queue.next_task()
    assert task["title"] == "todo"


def test_memory_weight_affects_order(tmp_path):
    tasks_md = tmp_path / "tasks.md"
    tasks_md.write_text(
        """## Canonical Tasks

---
id: T1
title: First task (P1)
status: todo
---

---
id: T2
title: Second task (P1)
status: todo
---
""",
        encoding="utf-8",
    )
    mem_dir = tmp_path / ".forgekeeper" / "memory"
    mem_dir.mkdir(parents=True)
    mem_file = mem_dir / "episodic.jsonl"
    mem_file.write_text(
        """{"task_id": "T1", "title": "First task", "status": "failed"}
{"task_id": "T2", "title": "Second task", "status": "success"}
{"task_id": "T1", "title": "First task", "status": "failed"}
""",
        encoding="utf-8",
    )
    queue = TaskQueue(tasks_md)
    task = queue.next_task()
    assert task["id"] == "T2"


def test_state_persistence(tmp_path, monkeypatch):
    import sys
    for mod in list(sys.modules):
        if mod.startswith("forgekeeper"):
            sys.modules.pop(mod)
    from forgekeeper import main as fk_main

    tasks_md = tmp_path / "tasks.md"
    tasks_md.write_text(
        """## Canonical Tasks

---
id: B1
title: Persist me (P1)
status: todo
labels: [test]
---
""",
        encoding="utf-8",
    )

    state_path = tmp_path / "state.json"

    monkeypatch.setattr(fk_main, "TASK_FILE", tasks_md)
    monkeypatch.setattr(fk_main, "STATE_PATH", state_path)
    monkeypatch.setattr(fk_main, "_execute_pipeline", lambda task, state: False)

    fk_main.main()

    data = json.loads(state_path.read_text(encoding="utf-8"))
    assert data["current_task"]["id"] == "B1"
    assert data["current_task"]["title"].startswith("Persist me")

    # remove modules to avoid side effects on other tests
    for mod in ["forgekeeper.main", "forgekeeper.git_committer", "forgekeeper.config"]:
        sys.modules.pop(mod, None)


def test_next_task_priority_and_fifo(tmp_path):
    tasks_md = tmp_path / "tasks.md"
    tasks_md.write_text(
        """## Canonical Tasks

---
id: P0_done
title: Completed task (P0)
status: done
---

---
id: P1_first
title: First P1 task (P1)
status: in_progress
---

---
id: P1_second
title: Second P1 task (P1)
status: todo
---

---
id: P2_task
title: P2 task (P2)
status: todo
---

---
id: P3_task
title: P3 task (P3)
status: in_progress
---

## Active
- [ ] legacy task
""",
        encoding="utf-8",
    )
    queue = TaskQueue(tasks_md)
    task = queue.next_task()
    assert task["id"] == "P1_first"
    assert task["priority"] == 1


def test_legacy_checkbox_fallback(tmp_path):
    tasks_md = tmp_path / "tasks.md"
    tasks_md.write_text(
        """## Canonical Tasks

---
id: only_done
title: Done task (P0)
status: done
---

## Active
- [x] completed legacy
- [ ] legacy todo
- [~] legacy in progress

## Backlog
- [ ] backlog todo
""",
        encoding="utf-8",
    )
    queue = TaskQueue(tasks_md)
    task = queue.next_task()
    assert task["title"] == "legacy todo"
    assert task["priority"] == 0
