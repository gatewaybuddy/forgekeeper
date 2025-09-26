#!/usr/bin/env python3
"""Simple CLI for querying a vLLM OpenAI-compatible endpoint.

The script sends a chat completion request with the provided prompt
and prints the first completion text. By default the target endpoint is
read from ``FK_CORE_API_BASE`` (falling back to ``http://localhost:8001``),
but can be overridden with ``--base-url``.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Dict

import requests


def _normalize_base_url(base_url: str) -> str:
    """Ensure the base URL contains the ``/v1`` prefix expected by OpenAI APIs."""
    base = base_url.rstrip("/")
    if not base.lower().endswith("/v1"):
        base = f"{base}/v1"
    return base


def build_headers(args: argparse.Namespace) -> Dict[str, str]:
    headers: Dict[str, str] = {"Content-Type": "application/json"}
    if args.api_key:
        header_name = args.api_key_header
        value = args.api_key
        if header_name.lower() == "authorization" and not value.lower().startswith("bearer "):
            value = f"Bearer {value}"
        headers[header_name] = value
    return headers


def build_payload(args: argparse.Namespace) -> Dict[str, object]:
    return {
        "model": args.model,
        "messages": [
            {
                "role": "user",
                "content": args.prompt,
            }
        ],
    }


def _default_base_url() -> str:
    env_base = os.environ.get("FK_CORE_API_BASE")
    if env_base:
        return env_base

    host = os.environ.get("VLLM_HOST_CORE")
    port = os.environ.get("VLLM_CONTAINER_PORT", "8000")
    if host:
        return f"http://{host}:{port}"

    return "http://localhost:8001"


def parse_args() -> argparse.Namespace:
    default_base = _default_base_url()
    default_model = os.environ.get("VLLM_MODEL_CORE", "oss-gpt-20b")

    parser = argparse.ArgumentParser(
        description="Send a chat completion request to an OpenAI-compatible endpoint.",
    )
    parser.add_argument(
        "prompt",
        help="User prompt text to send in the chat completion request.",
    )
    parser.add_argument(
        "--model",
        default=default_model,
        help=f"Model name to request (default: {default_model}).",
    )
    parser.add_argument(
        "--base-url",
        default=default_base,
        help=f"Base URL for the API (default: {default_base}).",
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("FK_CORE_API_KEY") or os.environ.get("OPENAI_API_KEY"),
        help="Optional API key value to include in the request headers.",
    )
    parser.add_argument(
        "--api-key-header",
        default="Authorization",
        help="Header name to use for the API key (default: Authorization).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    endpoint = f"{_normalize_base_url(args.base_url)}/chat/completions"
    headers = build_headers(args)
    payload = build_payload(args)

    try:
        response = requests.post(endpoint, headers=headers, data=json.dumps(payload), timeout=60)
    except requests.RequestException as exc:  # pragma: no cover - CLI error path
        print(f"ERROR: failed to reach {endpoint}: {exc}", file=sys.stderr)
        return 1

    if response.status_code != 200:
        detail = response.text
        print(
            f"ERROR: request failed with status {response.status_code}: {detail}",
            file=sys.stderr,
        )
        return 2

    data = response.json()
    try:
        choice = data["choices"][0]
        message = choice.get("message") or {}
        text = message.get("content") or choice.get("text") or ""
    except (KeyError, IndexError, AttributeError, TypeError):  # pragma: no cover
        print("ERROR: unexpected response format", file=sys.stderr)
        return 3

    print(text.strip())
    return 0


if __name__ == "__main__":
    sys.exit(main())
