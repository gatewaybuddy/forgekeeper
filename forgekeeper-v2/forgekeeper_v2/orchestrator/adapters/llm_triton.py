from __future__ import annotations

import asyncio
import os
from typing import AsyncGenerator, Optional

from .llm_base import LLMBase


class LLMTriton(LLMBase):
    """Triton Inference Server adapter for local OSS models (e.g., 20B).

    - Requires `tritonclient[http]` unless FK_TRITON_FAKE_RESPONSE is set.
    - Configure with TRITON_URL (http://localhost:8000), TRITON_MODEL (oss-20b).
    - Input/Output defaults INPUT_0/OUTPUT_0 can be overridden via env.
    """

    def __init__(
        self,
        url: Optional[str] = None,
        model: Optional[str] = None,
        input_name: Optional[str] = None,
        output_name: Optional[str] = None,
    ) -> None:
        self.name = "triton"
        self.url = url or os.environ.get("TRITON_URL", "http://localhost:8000")
        self.model = model or os.environ.get("TRITON_MODEL", "oss-20b")
        self.input_name = input_name or os.environ.get("TRITON_INPUT_NAME", "INPUT_0")
        self.output_name = output_name or os.environ.get("TRITON_OUTPUT_NAME", "OUTPUT_0")

    async def stream(
        self, prompt: str, max_tokens: int = 256, time_slice_ms: int = 1000
    ) -> AsyncGenerator[tuple[str, str], None]:
        fake = os.environ.get("FK_TRITON_FAKE_RESPONSE")
        if fake is not None:
            budget = max(1, time_slice_ms // 10)
            for tok in fake.split():
                await asyncio.sleep(min(0.02, budget / 1000))
                yield tok + " ", "REPORT"
            return

        try:
            import numpy as np  # type: ignore
            import tritonclient.http as httpclient  # type: ignore
        except Exception as exc:  # pragma: no cover
            raise RuntimeError("tritonclient[http] required. pip install 'tritonclient[http]'") from exc

        client = httpclient.InferenceServerClient(url=self.url, verbose=False)
        inp = httpclient.InferInput(self.input_name, [1], "BYTES")
        inp.set_data_from_numpy(np.array([prompt.encode("utf-8")], dtype=object))
        outputs = [httpclient.InferRequestedOutput(self.output_name, binary_data=False)]
        params = {"max_tokens": max_tokens}
        result = client.infer(self.model, inputs=[inp], outputs=outputs, parameters=params)  # type: ignore[arg-type]
        out = result.as_numpy(self.output_name)
        text = (out[0].decode("utf-8") if out is not None else "").strip()
        if not text:
            return
        budget = max(1, time_slice_ms // 10)
        for tok in text.split():
            await asyncio.sleep(min(0.02, budget / 1000))
            yield tok + " ", "REPORT"

