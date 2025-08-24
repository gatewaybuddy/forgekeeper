import os
from typing import Any, Dict, Optional

import requests

GRAPHQL_URL = os.environ.get("GRAPHQL_URL", "http://localhost:4000/graphql")

SEND_MESSAGE_MUTATION = """
mutation SendMessage($topic: String!, $message: JSON!, $projectId: ID) {
  sendMessageToForgekeeper(topic: $topic, message: $message, projectId: $projectId)
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
