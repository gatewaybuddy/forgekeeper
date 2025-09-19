#!/usr/bin/env python3
import os
import sys
import json
import uuid
import subprocess
from urllib.request import Request, urlopen


def post_json(url: str, payload: dict, timeout: float = 8.0) -> dict:
    data = json.dumps(payload).encode('utf-8')
    req = Request(url, data=data, headers={'Content-Type': 'application/json'})
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode('utf-8'))


def gql_append(url: str, conversation_id: str, role: str, content: str) -> bool:
    query = """
    mutation Append($conversationId: ID!, $role: String!, $content: String!) {
      appendMessage(conversationId: $conversationId, role: $role, content: $content)
    }
    """
    variables = {"conversationId": conversation_id, "role": role, "content": content}
    res = post_json(url, {"query": query, "variables": variables})
    if 'errors' in res:
        raise RuntimeError(f"GraphQL errors: {res['errors']}")
    return bool(res.get('data', {}).get('appendMessage'))


def run_cli(prompt: str) -> str:
    cmd = [sys.executable, 'forgekeeper/scripts/infer_cli.py', '--mode', 'http', '--prompt', prompt]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=20)
    # The CLI prints the text then latency_ms; take the first line
    line = res.stdout.strip().splitlines()[0] if res.stdout else ''
    if res.returncode != 0:
        raise RuntimeError(f"infer_cli failed: rc={res.returncode} out=\n{res.stdout}")
    return line


def main() -> int:
    gql_url = os.environ.get('FGK_BACKEND_URL', 'http://localhost:4000/graphql')
    convo = f"e2e-{uuid.uuid4()}"
    user_prompt = "Say hello."

    if not gql_append(gql_url, convo, 'user', user_prompt):
        print('E2E_FAIL: append user message false')
        return 2

    assistant_text = run_cli(user_prompt)
    if not assistant_text:
        print('E2E_FAIL: empty assistant text')
        return 3

    if not gql_append(gql_url, convo, 'assistant', assistant_text):
        print('E2E_FAIL: append assistant message false')
        return 4

    print('E2E_ROUNDTRIP_OK')
    return 0


if __name__ == '__main__':
    sys.exit(main())

