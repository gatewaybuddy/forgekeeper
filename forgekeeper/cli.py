from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from pathlib import Path
from typing import Dict, List

import requests

from forgekeeper.llm.clients import client
from forgekeeper.main import main as _run_pipeline

GRAPHQL_URL = os.environ.get("FORGEKEEPER_GRAPHQL_URL", "http://localhost:4000/graphql")
STATE_PATH = Path(".forgekeeper/cli_state.json")


def interactive_console() -> None:
    """Run an interactive console with streaming output."""
    messages: List[dict] = []
    try:
        while True:
            try:
                user_input = input("You > ")
            except (EOFError, KeyboardInterrupt):
                print()
                break
            if not user_input:
                continue
            messages.append({"role": "user", "content": user_input})
            try:
                stream = client.chat("core", messages, stream=True)
                response_text = ""
                for token in stream:
                    response_text += token
                    print(token, end="", flush=True)
                print()
            except KeyboardInterrupt:
                # Interrupt the streaming response and continue the loop
                print("\n[stream interrupted]")
                continue
            messages.append({"role": "assistant", "content": response_text})
    finally:
        sys.exit(0)


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


def persistent_console() -> None:
    """Run a console that persists conversation history via GraphQL."""
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
            prev_len = len(messages)
            while True:
                time.sleep(1)
                new_messages = _fetch_messages(conversation_id)
                if len(new_messages) > prev_len:
                    for m in new_messages[prev_len:]:
                        print(f"{m['role']}: {m['content']}")
                    messages = new_messages
                    break
    finally:
        sys.exit(0)


def run_pipeline() -> None:
    _run_pipeline()


def main(argv: List[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Forgekeeper command-line interface")
    subparsers = parser.add_subparsers(dest="command", required=False)

    run_parser = subparsers.add_parser("run", help="Run the Forgekeeper pipeline")
    run_parser.set_defaults(func=lambda _args: run_pipeline())

    console_parser = subparsers.add_parser("console", help="Start an interactive console")
    console_parser.set_defaults(func=lambda _args: interactive_console())

    persistent_parser = subparsers.add_parser(
        "persistent-console", help="Start a console that persists conversation history"
    )
    persistent_parser.set_defaults(func=lambda _args: persistent_console())

    args = parser.parse_args(argv)
    if args.command is None:
        run_pipeline()
    else:
        args.func(args)
