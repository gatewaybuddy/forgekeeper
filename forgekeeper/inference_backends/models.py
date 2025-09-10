from dataclasses import dataclass
from typing import List, Dict, Any


@dataclass
class ChatMessage:
    role: str
    content: str


def to_openai_messages(msgs: List[ChatMessage]) -> List[Dict[str, Any]]:
    return [{"role": m.role, "content": m.content} for m in msgs]
