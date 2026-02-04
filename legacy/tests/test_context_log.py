from __future__ import annotations

import json
import os
from pathlib import Path

import pytest


def test_contextlog_append_and_tail(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # Use temp directory for context log
    ctxdir = tmp_path / "context_log"
    monkeypatch.setenv("FGK_CONTEXTLOG_DIR", str(ctxdir))
    from forgekeeper.services.context_log import jsonl as ctx

    # Append a few events
    for i in range(3):
        ctx.append({"id": f"e{i}", "actor": "tool", "act": "tool_call", "conv_id": "c1", "iter": i})
    out = ctx.tail(2)
    assert len(out) == 2
    assert out[0]["id"] == "e2"
    assert out[1]["id"] == "e1"

    # Filter by conv_id
    ctx.append({"id": "eX", "actor": "tool", "act": "tool_call", "conv_id": "c2", "iter": 0})
    out_c1 = ctx.tail(10, conv_id="c1")
    assert all(o.get("conv_id") == "c1" for o in out_c1)


def test_contextlog_rotation_by_size(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    ctxdir = tmp_path / "context_log"
    monkeypatch.setenv("FGK_CONTEXTLOG_DIR", str(ctxdir))
    from forgekeeper.services.context_log import jsonl as ctx

    # Force tiny rotation
    for i in range(100):
        ctx.append({"id": f"r{i}", "actor": "tool", "act": "tool_call", "conv_id": "c1", "iter": i}, max_bytes=200)
    files = sorted(ctxdir.glob("ctx-*.jsonl"))
    # Expect multiple files due to rotation
    assert len(files) >= 2
    # Tailing should still return newest first
    out = ctx.tail(5)
    assert out and out[0]["id"].startswith("r")

