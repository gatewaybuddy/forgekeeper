from forgekeeper.app.chats.memory_store import get_memory, set_memory

def remember_name(session_id: str, name: str) -> str:
    memory = get_memory(session_id)
    identity = memory.get("identity", {})
    identity["name"] = name
    memory["identity"] = identity
    set_memory(session_id, memory)
    return f"My name is now remembered as {name}."
