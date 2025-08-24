from forgekeeper.task_queue import TaskQueue


def test_memory_weight_affects_order(tasks_file):
    tasks_md = tasks_file(
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
"""
    )
    mem_dir = tasks_md.parent / ".forgekeeper" / "memory"
    mem_dir.mkdir(parents=True)
    mem_file = mem_dir / "episodic.jsonl"
    mem_file.write_text(
        """{"task_id": "T1", "title": "First task", "status": "note", "sentiment": "negative"}\n"
        "{"task_id": "T2", "title": "Second task", "status": "note", "sentiment": "positive"}\n"
        "{"task_id": "T1", "title": "First task", "status": "note", "sentiment": "negative"}\n""",
        encoding="utf-8",
    )
    queue = TaskQueue(tasks_md)
    task = queue.next_task()
    assert task["id"] == "T2"
    w1, _ = queue._memory_weight("First task (P1)", "T1")
    w2, _ = queue._memory_weight("Second task (P1)", "T2")
    assert w1 > w2


def test_similarity_recall_affects_order(tasks_file):
    tasks_md = tasks_file(
        """## Canonical Tasks

---
id: N1
title: Implement foo feature (P1)
status: todo
---

---
id: N2
title: Refactor bar module (P1)
status: todo
---
"""
    )
    mem_dir = tasks_md.parent / ".forgekeeper" / "memory"
    mem_dir.mkdir(parents=True)
    mem_file = mem_dir / "episodic.jsonl"
    mem_file.write_text(
        """{"task_id": "old", "title": "Old task", "status": "failed", "summary": "struggled to implement foo feature"}\n""",
        encoding="utf-8",
    )
    queue = TaskQueue(tasks_md)
    task = queue.next_task()
    assert task["id"] == "N2"
    _, related = queue._memory_weight("Implement foo feature (P1)")
    assert any("foo feature" in s for s in related)
