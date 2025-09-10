from typing import List, Dict, Optional


ROLE_TOKENS = {
    "system": "<<SYS>>",
    "user": "<<USER>>",
    "assistant": "<<ASSISTANT>>",
}

SEP = "\n<|sep|>\n"


def _escape(text: str) -> str:
    # Minimal passthrough: ensure no accidental double markers
    return text.replace(SEP, " ")


def render_harmony(messages: List[Dict], system: Optional[str] = None) -> str:
    parts: List[str] = []
    if system:
        parts.append(f"{ROLE_TOKENS['system']}\n{_escape(system).strip()}")
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        tok = ROLE_TOKENS.get(role, ROLE_TOKENS["user"])
        parts.append(f"{tok}\n{_escape(str(content)).strip()}")
    return SEP.join(parts) + "\n"
