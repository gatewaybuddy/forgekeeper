"""MQTT listener for Forgekeeper tasks.

Connects to a local broker, subscribes to ``forgekeeper/task``, decodes JSON
instructions, and publishes simple acknowledgements on ``forgekeeper/status``.
"""

import json
import logging
import time

import paho.mqtt.client as mqtt

MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_TOPIC = "forgekeeper/task"
MQTT_STATUS_TOPIC = "forgekeeper/status"

logging.basicConfig(level=logging.INFO)


def process_forgekeeper_message(client: mqtt.Client, message_dict: dict) -> None:
    """Stub handler for Forgekeeper messages.

    Currently logs the incoming message and publishes a simple acknowledgement
    to the Forgekeeper status topic. Future implementations may perform actions
    such as loading files, summarising, editing, and sending richer status
    updates.
    """
    logging.info("Processing message: %s", message_dict)
    try:
        client.publish(
            MQTT_STATUS_TOPIC,
            json.dumps({"status": "received", "instruction": message_dict}),
        )
    except Exception as exc:
        logging.error("Failed to publish status update: %s", exc)


def on_connect(client: mqtt.Client, userdata, flags, rc) -> None:
    if rc == 0:
        logging.info("Connected to MQTT broker at %s:%s", MQTT_BROKER, MQTT_PORT)
        client.subscribe(MQTT_TOPIC)
    else:
        logging.warning("Failed to connect, return code %s", rc)


def on_disconnect(client: mqtt.Client, userdata, rc) -> None:
    if rc != 0:
        logging.warning("Unexpected disconnection (rc=%s). Reconnecting...", rc)
        try:
            client.reconnect()
        except Exception as e:
            logging.error("Reconnect attempt failed: %s", e)
    else:
        logging.info("Disconnected from MQTT broker.")


def on_message(client: mqtt.Client, userdata, msg: mqtt.MQTTMessage) -> None:
    try:
        payload = msg.payload.decode("utf-8")
        message_dict = json.loads(payload)
        logging.info("[Forgekeeper] Received instruction: %s", message_dict)
        process_forgekeeper_message(client, message_dict)
    except json.JSONDecodeError as exc:
        logging.error("Invalid JSON payload: %s", exc)


def main() -> None:
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message

    client.reconnect_delay_set(min_delay=1, max_delay=30)

    while True:
        try:
            client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
            client.loop_forever()
        except Exception as exc:
            logging.error("MQTT connection error: %s", exc)
            time.sleep(5)


if __name__ == "__main__":
    main()
