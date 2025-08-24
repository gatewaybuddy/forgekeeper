from __future__ import annotations

from typing import Any, Dict, List, Optional

from .messages import Folder, _ensure_store, _save_store


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
