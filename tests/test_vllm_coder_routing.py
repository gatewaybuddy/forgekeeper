"""Regression tests for the vLLM coder endpoint routing."""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _alias_module(src: str, dest: str) -> None:
    module = importlib.import_module(src)
    sys.modules[dest] = module


_alias_module("legacy.forgekeeper_v1", "forgekeeper")
_alias_module("legacy.forgekeeper_v1.config", "forgekeeper.config")
_alias_module("legacy.forgekeeper_v1.logger", "forgekeeper.logger")
_alias_module("legacy.forgekeeper_v1.telemetry", "forgekeeper.telemetry")
_alias_module("legacy.forgekeeper_v1.app", "forgekeeper.app")
_alias_module("legacy.forgekeeper_v1.app.utils", "forgekeeper.app.utils")
_alias_module("legacy.forgekeeper_v1.llm", "forgekeeper.llm")
_alias_module("legacy.forgekeeper_v1.llm.clients", "forgekeeper.llm.clients")
_alias_module("legacy.forgekeeper_v1.llm.clients.client", "forgekeeper.llm.clients.client")
_alias_module("legacy.forgekeeper_v1.llm.clients.config", "forgekeeper.llm.clients.config")
_alias_module("legacy.forgekeeper_v1.app.utils.prompt_guard", "forgekeeper.app.utils.prompt_guard")
_alias_module("legacy.forgekeeper_v1.app.utils.json_helpers", "forgekeeper.app.utils.json_helpers")
_alias_module("legacy.forgekeeper_v1.inference_backends", "forgekeeper.inference_backends")
_alias_module("legacy.forgekeeper_v1.inference_backends.harmony", "forgekeeper.inference_backends.harmony")


def _reload_vllm_module():
    import legacy.forgekeeper_v1.llm.llm_service_vllm as module

    return importlib.reload(module)


def test_llm_coder_falls_back_to_core_when_unavailable(monkeypatch):
    """If the coder endpoint is missing, core should service the request."""

    monkeypatch.setenv("FK_HEALTHZ_CHECK", "0")
    monkeypatch.setenv("FK_CORE_API_BASE", "http://core")
    monkeypatch.delenv("FK_CODER_API_BASE", raising=False)
    monkeypatch.delenv("VLLM_MODEL_CODER", raising=False)

    from legacy.forgekeeper_v1.llm.clients import client

    calls: list[tuple[str, dict]] = []

    def fake_chat(alias: str, messages, **params):  # type: ignore[override]
        calls.append((alias, params))
        return {"content": f"{alias}-response"}

    monkeypatch.setattr(client, "chat", fake_chat)

    module = _reload_vllm_module()

    text = module.llm_coder.ask("hello from tests")
    assert text == "core-response"
    assert calls and calls[0][0] == "core"


def test_llm_coder_uses_coder_when_configured(monkeypatch):
    """When coder configuration is present we should call that endpoint."""

    monkeypatch.setenv("FK_HEALTHZ_CHECK", "0")
    monkeypatch.setenv("FK_CORE_API_BASE", "http://core")
    monkeypatch.setenv("FK_CODER_API_BASE", "http://coder")
    monkeypatch.setenv("VLLM_MODEL_CODER", "coder-model")

    from legacy.forgekeeper_v1.llm.clients import client

    calls: list[tuple[str, dict]] = []

    def fake_chat(alias: str, messages, **params):  # type: ignore[override]
        calls.append((alias, params))
        return {"content": f"{alias}-response"}

    monkeypatch.setattr(client, "chat", fake_chat)

    module = _reload_vllm_module()

    text = module.llm_coder.ask("hello coder")
    assert text == "coder-response"
    assert calls and calls[0][0] == "coder"
