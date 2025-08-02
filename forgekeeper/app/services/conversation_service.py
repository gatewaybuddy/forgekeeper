from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

DATA_FILE = Path(__file__).resolve().parents[1] / "chats" / "conversations.json"


def _ensure_store() -> Dict[str, Any]:
    if not DATA_FILE.exists():
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        DATA_FILE.write_text(json.dumps({"conversations": [], "folders": []}, indent=2))
    with DATA_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def _save_store(store: Dict[str, Any]) -> None:
    DATA_FILE.write_text(json.dumps(store, indent=2), encoding="utf-8")


@dataclass
class Message:
    id: str
    role: str
    content: str
    timestamp: str
    tokens: Optional[int] = None


@dataclass
class Conversation:
    id: str
    title: str
    folder: str
    archived: bool
    messages: List[Message]


@dataclass
class Folder:
    name: str
    children: List["Folder"]


def count_tokens_stub(text: str) -> int:
    """Stub for token counting to be replaced by a real tokenizer."""
    return len(text.split())


def add_message(conversation_id: str, role: str, content: str) -> Message:
    store = _ensure_store()
    conversations = store["conversations"]
    conv = next((c for c in conversations if c["id"] == conversation_id), None)
    if conv is None:
        conv = {
            "id": conversation_id,
            "title": f"Conversation {conversation_id}",
            "folder": "root",
            "archived": False,
            "messages": [],
        }
        conversations.append(conv)
    message = {
        "id": str(uuid.uuid4()),
        "role": role,
        "content": content,
        "timestamp": datetime.utcnow().isoformat(),
        "tokens": count_tokens_stub(content),
    }
    conv["messages"].append(message)
    _save_store(store)
    return Message(**message)


def list_conversations() -> List[Conversation]:
    store = _ensure_store()
    result: List[Conversation] = []
    for c in store["conversations"]:
        messages = [Message(**m) for m in c.get("messages", [])]
        result.append(
            Conversation(
                id=c["id"],
                title=c.get("title", ""),
                folder=c.get("folder", ""),
                archived=c.get("archived", False),
                messages=messages,
            )
        )
    return result


def move_conversation(conversation_id: str, folder: str) -> bool:
    store = _ensure_store()
    conv = next((c for c in store["conversations"] if c["id"] == conversation_id), None)
    if not conv:
        return False
    conv["folder"] = folder
    _save_store(store)
    return True


def delete_conversation(conversation_id: str) -> bool:
    store = _ensure_store()
    before = len(store["conversations"])
    store["conversations"] = [c for c in store["conversations"] if c["id"] != conversation_id]
    if len(store["conversations"]) == before:
        return False
    _save_store(store)
    return True


def archive_conversation(conversation_id: str) -> bool:
    store = _ensure_store()
    conv = next((c for c in store["conversations"] if c["id"] == conversation_id), None)
    if not conv:
        return False
    conv["archived"] = True
    _save_store(store)
    return True


def list_folders() -> List[Folder]:
    store = _ensure_store()
    def build(folder_dict: Dict[str, Any]) -> Folder:
        return Folder(
            name=folder_dict["name"],
            children=[build(ch) for ch in folder_dict.get("children", [])],
        )
    return [build(f) for f in store.get("folders", [])]


def create_folder(name: str, parent: Optional[str] = None) -> bool:
    store = _ensure_store()
    new_folder = {"name": name, "children": []}
    if parent:
        def add_to_parent(folders: List[Dict[str, Any]]) -> bool:
            for f in folders:
                if f["name"] == parent:
                    f.setdefault("children", []).append(new_folder)
                    return True
                if add_to_parent(f.get("children", [])):
                    return True
            return False
        if not add_to_parent(store["folders"]):
            store["folders"].append(new_folder)
    else:
        store.setdefault("folders", []).append(new_folder)
    _save_store(store)
    return True


def rename_folder(old_name: str, new_name: str) -> bool:
    store = _ensure_store()
    def rename(folders: List[Dict[str, Any]]) -> bool:
        for f in folders:
            if f["name"] == old_name:
                f["name"] = new_name
                return True
            if rename(f.get("children", [])):
                return True
        return False
    if rename(store.get("folders", [])):
        _save_store(store)
        return True
    return False
