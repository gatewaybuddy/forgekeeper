
def test_front_matter_skips_completed(queue_from_text):
    queue = queue_from_text(
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
"""
    )
    task = queue.next_task()
    assert task["id"] == "C2"
    assert task["status"] == "in_progress"


def test_checkbox_tasks_ignore_completed(queue_from_text):
    queue = queue_from_text(
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
"""
    )
    task = queue.next_task()
    assert task["title"] == "todo"


def test_legacy_checkbox_fallback(queue_from_text):
    queue = queue_from_text(
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
"""
    )
    task = queue.next_task()
    assert task["title"] == "legacy todo"
    assert task["priority"] == 0
