import sys
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forgekeeper.llm.triton_impl import TritonRTLLMProvider


def test_fake_response(monkeypatch):
    """Triton provider returns fake response when stubbed."""
    monkeypatch.setenv("FK_TRITON_FAKE_RESPONSE", "fake-output")
    monkeypatch.delenv("TRITON_MODEL", raising=False)
    monkeypatch.delenv("TRITON_CHECKPOINT", raising=False)

    provider = TritonRTLLMProvider()
    assert provider.generate("Hi") == "fake-output"


def test_missing_model_path_raises(monkeypatch):
    """Missing TRITON_MODEL env var triggers a clear error."""
    monkeypatch.delenv("FK_TRITON_FAKE_RESPONSE", raising=False)
    monkeypatch.delenv("TRITON_MODEL", raising=False)
    monkeypatch.setenv("TRITON_CHECKPOINT", "/tmp/checkpoint.pt")

    with pytest.raises(ValueError) as exc:
        TritonRTLLMProvider()
    assert "TRITON_MODEL environment variable must be set" in str(exc.value)
