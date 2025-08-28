import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forgekeeper.config import DEFAULT_TINY_MODEL  # noqa: E402
from forgekeeper.llm import get_llm  # noqa: E402
from forgekeeper.llm.transformers_impl import TransformersLLMProvider  # noqa: E402


def test_transformers_default_model(monkeypatch):
    monkeypatch.delenv("FK_LLM_IMPL", raising=False)
    monkeypatch.delenv("FK_MODEL_PATH", raising=False)
    monkeypatch.setenv("FK_DEVICE", "cpu")
    monkeypatch.setenv("FK_DTYPE", "float32")

    provider = get_llm()
    assert isinstance(provider, TransformersLLMProvider)
    assert provider.tokenizer.name_or_path == DEFAULT_TINY_MODEL

    output = provider.generate("Hello", max_new_tokens=1)
    assert isinstance(output, str) and output
