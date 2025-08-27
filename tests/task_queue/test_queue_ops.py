import json
import sys


def test_next_task_priority_ordering(queue_from_text):
    queue = queue_from_text(
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
"""
    )
    task = queue.next_task()
    assert task["id"] == "A2"
    assert task["priority"] == 1


def test_state_persistence(tasks_file, monkeypatch):
    for mod in list(sys.modules):
        if mod.startswith("forgekeeper"):
            sys.modules.pop(mod)
    from forgekeeper import main as fk_main

    tasks_md = tasks_file(
        """## Canonical Tasks

---
id: B1
title: Persist me (P1)
status: todo
labels: [test]
---
"""
    )

    state_path = tasks_md.parent / "state.json"

    monkeypatch.setattr(fk_main, "TASK_FILE", tasks_md)
    monkeypatch.setattr(fk_main, "STATE_PATH", state_path)
    from forgekeeper.pipeline import loop as fk_loop
    from forgekeeper.tasks.queue import TaskQueue
    from forgekeeper.state_manager import save_state

    def fake_run(state, path):
        queue = TaskQueue(tasks_md)
        state.update({"current_task": queue.next_task()})
        save_state(state, path)

    monkeypatch.setattr(fk_loop, "run", fake_run)
    monkeypatch.setattr(fk_main, "load_state", lambda path: {})

    fk_main.main()

    data = json.loads(state_path.read_text(encoding="utf-8"))
    assert data["current_task"]["id"] == "B1"
    assert data["current_task"]["title"].startswith("Persist me")

    for mod in ["forgekeeper.main", "forgekeeper.git_committer", "forgekeeper.config"]:
        sys.modules.pop(mod, None)


def test_next_task_priority_and_fifo(queue_from_text):
    queue = queue_from_text(
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
"""
    )
    task = queue.next_task()
    assert task["id"] == "P1_first"
    assert task["priority"] == 1
