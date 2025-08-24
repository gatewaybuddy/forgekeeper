"""Simple streaming console for manual testing."""

from __future__ import annotations

import sys
from typing import List

from forgekeeper.llm.clients import client


def main() -> None:
    """Run an interactive console with streaming output.

    Users can press ``Ctrl+C`` during a streaming response to interrupt the
    stream cleanly. This ensures the underlying HTTP connection is closed and
    the console remains responsive for subsequent inputs.
    """

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


if __name__ == "__main__":  # pragma: no cover - manual utility
    main()
