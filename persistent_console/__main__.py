from __future__ import annotations

import json
import os
import sys
import uuid
from pathlib import Path
from typing import List, Dict

import requests

from forgekeeper.llm.clients import client

GRAPHQL_URL = os.environ.get("FORGEKEEPER_GRAPHQL_URL", "http://localhost:4000/graphql")
STATE_PATH = Path(".forgekeeper/cli_state.json")


def _load_state() -> Dict[str, str]:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text())
    return {}


def _save_state(state: Dict[str, str]) -> None:
    STATE_PATH.parent.mkdir(exist_ok=True)
    STATE_PATH.write_text(json.dumps(state))


def _get_conversation_id(state: Dict[str, str]) -> str:
    cid = state.get("conversation_id")
    if not cid:
        cid = str(uuid.uuid4())
        state["conversation_id"] = cid
        _save_state(state)
    return cid


def _send_user_message(conversation_id: str, content: str) -> None:
    query = """
    mutation($topic: String!, $message: JSON!, $idKey: String) {
      sendMessageToForgekeeper(topic: $topic, message: $message, idempotencyKey: $idKey)
    }
    """
    variables = {
        "topic": "forgekeeper/user",
        "message": {"conversationId": conversation_id, "content": content},
        "idKey": str(uuid.uuid4()),
    }
    resp = requests.post(GRAPHQL_URL, json={"query": query, "variables": variables})
    resp.raise_for_status()
    data = resp.json()
    if data.get("errors"):
        raise RuntimeError(data["errors"])


def _append_assistant_message(conversation_id: str, content: str) -> None:
    query = """
    mutation($cid: ID!, $role: String!, $content: String!) {
      appendMessage(conversationId: $cid, role: $role, content: $content)
    }
    """
    variables = {"cid": conversation_id, "role": "assistant", "content": content}
    resp = requests.post(GRAPHQL_URL, json={"query": query, "variables": variables})
    resp.raise_for_status()
    data = resp.json()
    if data.get("errors"):
        raise RuntimeError(data["errors"])


def _fetch_messages(conversation_id: str) -> List[Dict[str, str]]:
    query = """
    query {
      listConversations {
        id
        messages { role content }
      }
    }
    """
    resp = requests.post(GRAPHQL_URL, json={"query": query})
    resp.raise_for_status()
    data = resp.json()
    if data.get("errors"):
        raise RuntimeError(data["errors"])
    conversations = data.get("data", {}).get("listConversations", [])
    for conv in conversations:
        if conv.get("id") == conversation_id:
            return conv.get("messages", [])
    return []


def main() -> None:
    state = _load_state()
    conversation_id = _get_conversation_id(state)
    messages = _fetch_messages(conversation_id)
    for m in messages:
        print(f"{m['role']}: {m['content']}")
    try:
        while True:
            try:
                user_input = input("You > ")
            except (EOFError, KeyboardInterrupt):
                print()
                break
            if not user_input:
                continue
            _send_user_message(conversation_id, user_input)
            messages.append({"role": "user", "content": user_input})
            try:
                stream = client.chat("core", messages, stream=True)
                response_text = ""
                for token in stream:
                    response_text += token
                    print(token, end="", flush=True)
                print()
            except KeyboardInterrupt:
                print("\n[stream interrupted]")
                response_text = ""
            if response_text:
                messages.append({"role": "assistant", "content": response_text})
                _append_assistant_message(conversation_id, response_text)
    finally:
        sys.exit(0)


if __name__ == "__main__":  # pragma: no cover - manual utility
    main()
