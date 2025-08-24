from forgekeeper.tasks.queue import TaskQueue


def test_find_canonical_tasks(queue_from_text):
    content = """## Canonical Tasks

---
id: A1
title: First task (P2)
status: todo
labels: [one]
---

---
id: A2
title: Second task (P1)
status: in_progress
labels: [two]
---
"""
    queue = queue_from_text(content)
    parsed = queue._find_canonical_tasks(content)
    assert [t["id"] for t in parsed] == ["A1", "A2"]
    assert parsed[1]["priority"] == 1


def test_select_best_task_prefers_canonical(queue_from_text):
    content = """## Canonical Tasks

---
id: C1
title: Canon task (P2)
status: todo
---

## Active
- [ ] legacy task
"""
    queue = queue_from_text(content)
    canonical = queue._find_canonical_tasks(content)
    best = queue._select_best_task(canonical, queue.list_tasks())
    assert best["id"] == "C1"


def test_select_best_task_falls_back(queue_from_text):
    content = """## Active
- [ ] do something
"""
    queue = queue_from_text(content)
    canonical = queue._find_canonical_tasks(content)
    best = queue._select_best_task(canonical, queue.list_tasks())
    assert best["title"] == "do something"
    assert best["id"] == ""
