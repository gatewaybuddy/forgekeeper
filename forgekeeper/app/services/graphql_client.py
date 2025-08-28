import os
from typing import Any, Dict, List, Optional

import requests

GRAPHQL_URL = os.environ.get("GRAPHQL_URL", "http://localhost:4000/graphql")

SEND_MESSAGE_MUTATION = """
mutation SendMessage($topic: String!, $message: JSON!, $projectId: ID) {
  sendMessageToForgekeeper(topic: $topic, message: $message, projectId: $projectId)
}
"""

LIST_CONVERSATIONS_QUERY = """
query ListConversations($projectId: ID) {
  listConversations(projectId: $projectId) {
    id
    messages {
      role
      content
    }
  }
}
"""

APPEND_MESSAGE_MUTATION = """
mutation AppendMessage($conversationId: ID!, $role: String!, $content: String!) {
  appendMessage(conversationId: $conversationId, role: $role, content: $content)
}
"""

DELETE_CONVERSATION_MUTATION = """
mutation DeleteConversation($conversationId: ID!) {
  deleteConversation(conversationId: $conversationId)
}
"""

def send_message(topic: str, message: Dict[str, Any], project_id: Optional[str] = None) -> bool:
    """Send a message to the GraphQL conversation service.

    Parameters
    ----------
    topic: str
        MQTT or domain topic for the message.
    message: Dict[str, Any]
        Arbitrary JSON payload sent to the backend.
    project_id: Optional[str]
        Optional project identifier used to group conversations.
    """
    payload = {
        "query": SEND_MESSAGE_MUTATION,
        "variables": {"topic": topic, "message": message, "projectId": project_id},
    }
    try:
        resp = requests.post(GRAPHQL_URL, json=payload, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        return bool(data.get("data", {}).get("sendMessageToForgekeeper"))
    except Exception:
        return False


def list_conversations(project_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return all conversations for the given project id."""
    payload = {
        "query": LIST_CONVERSATIONS_QUERY,
        "variables": {"projectId": project_id},
    }
    try:
        resp = requests.post(GRAPHQL_URL, json=payload, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        return data.get("data", {}).get("listConversations", []) or []
    except Exception:
        return []


def append_message(conversation_id: str, role: str, content: str) -> bool:
    """Append a message to an existing conversation."""
    payload = {
        "query": APPEND_MESSAGE_MUTATION,
        "variables": {
            "conversationId": conversation_id,
            "role": role,
            "content": content,
        },
    }
    try:
        resp = requests.post(GRAPHQL_URL, json=payload, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        return bool(data.get("data", {}).get("appendMessage"))
    except Exception:
        return False


def delete_conversation(conversation_id: str) -> bool:
    """Delete a conversation and its messages."""
    payload = {
        "query": DELETE_CONVERSATION_MUTATION,
        "variables": {"conversationId": conversation_id},
    }
    try:
        resp = requests.post(GRAPHQL_URL, json=payload, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        return bool(data.get("data", {}).get("deleteConversation"))
    except Exception:
        return False
