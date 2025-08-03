from __future__ import annotations

import json
import os
import uuid
from typing import List, Optional

import strawberry
from strawberry.scalars import JSON
import paho.mqtt.publish as publish

from forgekeeper.app.services import conversation_service

MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
TASK_TOPIC = "forgekeeper/task"
STOP_TOPIC = "forgekeeper/stop"


@strawberry.type
class Message:
    id: str
    role: str
    content: str
    timestamp: str
    tokens: Optional[int]


@strawberry.type
class Conversation:
    id: str
    title: str
    folder: str
    archived: bool
    messages: List[Message]


@strawberry.type
class Folder:
    name: str
    children: List["Folder"]


def _folder_from_dict(data: dict) -> Folder:
    return Folder(name=data["name"], children=[_folder_from_dict(c) for c in data.get("children", [])])


@strawberry.type
class Query:
    @strawberry.field
    def list_conversations(self) -> List[Conversation]:
        return conversation_service.list_conversations()

    @strawberry.field
    def list_folders(self) -> List[Folder]:
        return [_folder_from_dict(f) for f in conversation_service.list_folders()]


@strawberry.type
class Mutation:
    @strawberry.mutation
    def send_message_to_forgekeeper(self, topic: str, message: JSON) -> bool:
        payload = json.dumps(message)
        try:
            publish.single(topic, payload, hostname=MQTT_BROKER)
        except Exception:
            pass
        content = message.get("content", "") if isinstance(message, dict) else ""
        conversation_id = message.get("conversationId", str(uuid.uuid4())) if isinstance(message, dict) else str(uuid.uuid4())
        conversation_service.add_message(conversation_id, "user", content)
        return True

    @strawberry.mutation
    def stop_message(self) -> bool:
        try:
            publish.single(STOP_TOPIC, json.dumps({"stop": True}), hostname=MQTT_BROKER)
        except Exception:
            pass
        return True

    @strawberry.mutation
    def move_conversation_to_folder(self, conversation_id: strawberry.ID, folder: str) -> bool:
        return conversation_service.move_conversation(str(conversation_id), folder)

    @strawberry.mutation
    def delete_conversation(self, conversation_id: strawberry.ID) -> bool:
        return conversation_service.delete_conversation(str(conversation_id))

    @strawberry.mutation
    def archive_conversation(self, conversation_id: strawberry.ID) -> bool:
        return conversation_service.archive_conversation(str(conversation_id))

    @strawberry.mutation
    def create_folder(self, name: str, parent: Optional[str] = None) -> bool:
        return conversation_service.create_folder(name, parent)

    @strawberry.mutation
    def rename_folder(self, old_name: str, new_name: str) -> bool:
        return conversation_service.rename_folder(old_name, new_name)


schema = strawberry.Schema(Query, Mutation)
