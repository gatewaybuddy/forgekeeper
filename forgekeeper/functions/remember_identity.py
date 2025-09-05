from forgekeeper.app.chats.memory_service import get_memory, set_memory

def remember_identity(session_id: str, key: str, value: str) -> str:
    memory = get_memory(session_id)
    identity = memory.get("identity", {})
    identity[key] = value
    memory["identity"] = identity
    set_memory(session_id, memory)
    return f"Updated identity: {key} = {value}"
