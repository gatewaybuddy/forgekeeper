import os
from typing import Any, Dict, List

import httpx

from .config import get_inference_config
from .harmony import render_harmony


class OpenAICompatClient:
    def __init__(self, base_url: str | None = None, api_key: str | None = None):
        cfg = get_inference_config()
        self.base_url = base_url or cfg.base_url
        self.api_key = api_key or cfg.api_key
        self._client = httpx.AsyncClient(base_url=self.base_url, headers={
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        })

    async def chat(self, model: str, messages: List[Dict[str, Any]], system: str | None = None, **gen_kwargs) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"model": model, "messages": messages}
        payload.update(gen_kwargs)
        if model == "gpt-oss-20b-harmony":
            harmony = render_harmony(messages, system)
            payload["messages"] = [{"role": "user", "content": harmony}]
        r = await self._client.post("/v1/chat/completions", json=payload)
        r.raise_for_status()
        return r.json()

    async def aclose(self):
        await self._client.aclose()
