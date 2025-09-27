#!/usr/bin/env python3
"""
Validate local wiring for Forgekeeper services and configs.

Checks:
- .env presence and key flags (BACKEND_PORT, FGK_USE_INFERENCE, FK_*_API_BASE)
- GraphQL service health (/health, /healthz) and a minimal appendMessage mutation
- Inference gateway (if FGK_USE_INFERENCE=1): basic reachability
- vLLM base URLs (FK_CORE_API_BASE/FK_CODER_API_BASE): healthz/models
- Presence of runtime state files under .forgekeeper/

Exit codes: 0 = all pass, 1 = warnings, 2+ = failures
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, Tuple

try:
    import requests
except Exception:  # pragma: no cover
    requests = None  # type: ignore


ROOT = Path(__file__).resolve().parents[1]
DOT_ENV = ROOT / '.env'


def load_dotenv(path: Path) -> Dict[str, str]:
    data: Dict[str, str] = {}
    if not path.is_file():
        return data
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        m = re.match(r'([A-Za-z_][A-Za-z0-9_]*)=(.*)', line)
        if not m:
            continue
        key, val = m.group(1), m.group(2)
        data[key] = val
    return data


def get(url: str, timeout: float = 5.0) -> Tuple[int, Any]:
    if requests is None:
        # Fallback: urllib
        import urllib.request
        try:
            with urllib.request.urlopen(url, timeout=timeout) as resp:  # type: ignore
                status = resp.getcode()
                body = resp.read().decode('utf-8')
                try:
                    return status, json.loads(body)
                except Exception:
                    return status, body
        except Exception as e:  # pragma: no cover
            return 0, str(e)
    try:
        r = requests.get(url, timeout=timeout)
        ctype = r.headers.get('content-type', '')
        if 'application/json' in ctype:
            return r.status_code, r.json()
        return r.status_code, r.text
    except Exception as e:  # pragma: no cover
        return 0, str(e)


def post_json(url: str, payload: Dict[str, Any], timeout: float = 8.0) -> Tuple[int, Any]:
    if requests is None:
        import urllib.request
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:  # type: ignore
                status = resp.getcode()
                body = resp.read().decode('utf-8')
                try:
                    return status, json.loads(body)
                except Exception:
                    return status, body
        except Exception as e:  # pragma: no cover
            return 0, str(e)
    try:
        r = requests.post(url, json=payload, timeout=timeout)
        ctype = r.headers.get('content-type', '')
        if 'application/json' in ctype:
            return r.status_code, r.json()
        return r.status_code, r.text
    except Exception as e:  # pragma: no cover
        return 0, str(e)


def check_graphql(base: str) -> Tuple[bool, str]:
    health_url = f'{base}/health'
    healthz_url = f'{base}/healthz'
    s1, b1 = get(health_url)
    s2, b2 = get(healthz_url)
    ok1 = s1 == 200
    ok2 = s2 == 200
    if not (ok1 and ok2):
        return False, f'GraphQL health failed: /health={s1} /healthz={s2}'

    # Minimal appendMessage mutation
    gql = f'{base}/graphql'
    query = """
    mutation Append($conversationId: ID!, $role: String!, $content: String!) {
      appendMessage(conversationId: $conversationId, role: $role, content: $content)
    }
    """
    variables = {"conversationId": "wiring-check", "role": "assistant", "content": "hello"}
    code, res = post_json(gql, {"query": query, "variables": variables})
    if code != 200 or not isinstance(res, dict) or not res.get('data'):
        return False, f'GraphQL append failed: code={code} body={res!r}'
    if res.get('errors'):
        return False, f'GraphQL append errors: {res["errors"]!r}'
    if not res['data'].get('appendMessage'):
        return False, f'GraphQL append returned false: {res!r}'
    return True, 'GraphQL OK'


def check_gateway(url: str) -> Tuple[bool, str]:
    # Try a simple GET on root or /health
    for path in ('', '/health', '/v1/models'):
        s, _ = get(url.rstrip('/') + path)
        if s == 200:
            return True, f'Gateway reachable at {url}{path or "/"}'
    return False, f'Gateway not reachable at {url}'


def check_vllm(base: str) -> Tuple[bool, str]:
    for path in ('/healthz', '/v1/models'):
        s, _ = get(base.rstrip('/') + path)
        if s == 200:
            return True, f'vLLM reachable at {base}{path}'
    return False, f'vLLM not reachable at {base}'


def main() -> int:
    print('==> Validating Forgekeeper wiring')
    env = load_dotenv(DOT_ENV)
    warn = 0
    fail = 0

    # GraphQL base
    port = int(env.get('BACKEND_PORT') or os.environ.get('BACKEND_PORT') or '4000')
    gql_base = os.environ.get('FGK_BACKEND_URL')
    if not gql_base:
        gql_base = f'http://localhost:{port}'

    ok, msg = check_graphql(gql_base)
    print(('[OK]   ' if ok else '[ERR]  ') + msg)
    fail += 0 if ok else 1

    # Prisma connection env sanity
    if env.get('MONGO_URI') and not env.get('DATABASE_URL') and not os.environ.get('DATABASE_URL'):
        print('[WARN] MONGO_URI set but DATABASE_URL is unset; start scripts map this automatically, but backend dev needs DATABASE_URL')
        warn += 1

    # Gateway
    use_gateway = str(env.get('FGK_USE_INFERENCE') or os.environ.get('FGK_USE_INFERENCE') or '1')
    if use_gateway.strip() == '1':
        gw = env.get('FGK_INFER_URL') or os.environ.get('FGK_INFER_URL') or 'http://localhost:8080'
        ok, msg = check_gateway(gw)
        print(('[OK]   ' if ok else '[WARN] ') + msg)
        warn += 0 if ok else 1

    # vLLM endpoints (optional)
    core = env.get('FK_CORE_API_BASE') or os.environ.get('FK_CORE_API_BASE')
    coder = env.get('FK_CODER_API_BASE') or os.environ.get('FK_CODER_API_BASE')
    for base in filter(None, [core, coder]):
        ok, msg = check_vllm(base)  # type: ignore[arg-type]
        print(('[OK]   ' if ok else '[WARN] ') + msg)
        warn += 0 if ok else 1

    # State files
    state_dir = ROOT / '.forgekeeper'
    expected = [state_dir / 'events.jsonl', state_dir / 'agentic_memory.json', state_dir / 'facts.json']
    for p in expected:
        if p.exists():
            print(f'[OK]   state: {p}')
        else:
            print(f'[WARN] state missing: {p}')
            warn += 1

    # Summary
    if fail:
        print(f'==> Wiring FAILED (failures={fail}, warnings={warn})')
        return 2
    if warn:
        print(f'==> Wiring OK with WARNINGS (warnings={warn})')
        return 1
    print('==> Wiring OK')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
