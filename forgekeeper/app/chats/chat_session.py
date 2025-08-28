"""Simple chat session backed by the GraphQL conversation service."""

import uuid

from forgekeeper.app.services.graphql_client import (
    append_message,
    delete_conversation,
    list_conversations,
    send_message,
)
from forgekeeper.app.services.llm_service import ask_llm

class ChatSession:
    def __init__(self, session_id):
        self.session_id = session_id
        self.conversation_id = None
        convs = list_conversations(project_id=session_id)
        if convs:
            self.conversation_id = convs[0]["id"]
            self.history = convs[0].get("messages", [])
        else:
            self.history = []

    def user_prompt(self, content):
        if self.conversation_id is None:
            self.conversation_id = str(uuid.uuid4())
        send_message(
            "chat",
            {"conversationId": self.conversation_id, "content": content},
            project_id=self.session_id,
        )
        self.history.append({"role": "user", "content": content})
        return content

    def generate_response(self):
        prompt = "\n".join(f"{m['role']}: {m['content']}" for m in self.history)
        response = ask_llm(prompt)
        content = None
        if isinstance(response, str):
            content = response
        elif isinstance(response, dict) and "content" in response:
            content = response["content"]
        if content:
            append_message(self.conversation_id, "assistant", content)
            self.history.append({"role": "assistant", "content": content})
        return response

    def clear(self):
        if self.conversation_id:
            delete_conversation(self.conversation_id)
            self.conversation_id = None
        self.history = []
