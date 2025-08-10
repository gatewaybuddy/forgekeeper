import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forgekeeper.task_queue import TaskQueue


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
