#!/usr/bin/env python3
import os
import sys
import json
import time
import uuid
from urllib.request import Request, urlopen
from urllib.error import URLError


def post_json(url: str, payload: dict, timeout: float = 5.0) -> dict:
    data = json.dumps(payload).encode('utf-8')
    req = Request(url, data=data, headers={'Content-Type': 'application/json'})
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode('utf-8'))


def main() -> int:
    url = os.environ.get('FGK_BACKEND_URL', 'http://localhost:4000/graphql')
    conv_id = f"smoke-{uuid.uuid4()}"
    role = 'assistant'
    content = 'graph-hello'

    query = """
    mutation Append($conversationId: ID!, $role: String!, $content: String!) {
      appendMessage(conversationId: $conversationId, role: $role, content: $content)
    }
    """
    variables = {"conversationId": conv_id, "role": role, "content": content}
    payload = {"query": query, "variables": variables}

    # Optional warmup delay
    time.sleep(0.1)
    try:
        res = post_json(url, payload, timeout=10.0)
    except URLError as e:
        print(f"ERROR: backend not reachable at {url}: {e}")
        return 2

    if 'errors' in res:
        print("ERROR: GraphQL returned errors:")
        print(json.dumps(res['errors'], indent=2))
        return 3

    ok = res.get('data', {}).get('appendMessage') is True
    if ok:
        print('APPEND_MESSAGE_GRAPHQL_OK')
        return 0
    else:
        print('ERROR: appendMessage returned false or missing data')
        print(json.dumps(res, indent=2))
        return 4


if __name__ == '__main__':
    sys.exit(main())

