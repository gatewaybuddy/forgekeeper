"""Minimal event bus used by memory agents.

Example:
    >>> from forgekeeper.memory.events import event_from_text, publish
    >>> event = event_from_text("agent_output", "result text", agent="Coder")
    >>> publish(event)
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict
from typing import Callable, List

try:  # pragma: no cover - optional dependency
    import paho.mqtt.client as mqtt  # type: ignore
except Exception:  # pragma: no cover - graceful fallback
    mqtt = None  # type: ignore

from .agentic.base import Event

_subscribers: List[Callable[[Event], None]] = []
_mqtt_client = None


if mqtt and os.getenv("FORGEKPR_MQTT_URL"):
    url = os.environ["FORGEKPR_MQTT_URL"]
    _mqtt_client = mqtt.Client()
    try:  # pragma: no cover - network
        _mqtt_client.connect(url)
        _mqtt_client.loop_start()
    except Exception:
        _mqtt_client = None


def publish(event: Event) -> None:
    if _mqtt_client:
        _mqtt_client.publish("forgekeeper/events", json.dumps(asdict(event)))
    for cb in list(_subscribers):
        cb(event)


def subscribe(callback: Callable[[Event], None]) -> None:
    _subscribers.append(callback)
    if _mqtt_client:

        def _on_message(client, userdata, msg):  # pragma: no cover - network
            data = json.loads(msg.payload)
            callback(Event(**data))

        _mqtt_client.subscribe("forgekeeper/events")
        _mqtt_client.on_message = _on_message


def event_from_text(kind: str, text: str, **meta) -> Event:
    return Event(kind=kind, payload={"text": text}, meta=meta)
