from .crud import load_memory, set_memory


def request_think_aloud(session_id: str) -> bool:
    memory = load_memory(session_id)
    return memory.get("consent_to_think_aloud", False)


def set_think_aloud(session_id: str, user_request: bool) -> bool:
    memory = load_memory(session_id)
    if user_request and not memory.get("consent_to_think_aloud", False):
        return False
    memory["think_aloud"] = user_request
    set_memory(session_id, memory)
    return True


def grant_think_aloud_consent(session_id: str, consent: bool) -> None:
    memory = load_memory(session_id)
    memory["consent_to_think_aloud"] = consent
    set_memory(session_id, memory)


def get_think_aloud(session_id: str) -> bool:
    return load_memory(session_id).get("think_aloud", False)
