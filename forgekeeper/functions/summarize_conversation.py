from forgekeeper.app.chats.memory_store import load_memory

def summarize_conversation(session_id: str) -> str:
    memory = load_memory(session_id)
    messages = memory.get("shared", [])
    summary = []

    for msg in messages:
        role = msg.get("role", "unknown")
        content = msg.get("content", "").strip()
        if content:
            summary.append(f"**{role.capitalize()}:** {content[:200]}{'...' if len(content) > 200 else ''}")

    if not summary:
        return "No conversation history found."

    return "\n".join(summary)
