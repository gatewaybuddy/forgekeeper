from forgekeeper.app.chats.memory_service import load_memory

def introspect_state(session_id: str) -> str:
    memory = load_memory(session_id)
    identity = memory.get("identity", {})
    goals = memory.get("goal_stack", [])
    tasks = memory.get("task_queue", [])

    report = ["# 🧠 Core Introspection Report"]

    if identity:
        report.append("## Identity")
        for k, v in identity.items():
            report.append(f"- **{k.capitalize()}**: {v}")

    if goals:
        report.append("## Current Goals")
        for i, g in enumerate(goals, 1):
            report.append(f"{i}. {g}")

    if tasks:
        report.append("## Task Queue")
        for i, t in enumerate(tasks, 1):
            report.append(f"{i}. {t}")

    if not (identity or goals or tasks):
        report.append("No internal memory traits found.")

    return "\n".join(report)
