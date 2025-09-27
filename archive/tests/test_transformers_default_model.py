import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

def test_transformers_default_model(monkeypatch):
    monkeypatch.delenv("FK_LLM_IMPL", raising=False)
    monkeypatch.delenv("FK_MODEL_PATH", raising=False)
    monkeypatch.setenv("USE_TINY_MODEL", "true")
    monkeypatch.setenv("FK_DEVICE", "cpu")
    monkeypatch.setenv("FK_DTYPE", "float32")

    import importlib
    import forgekeeper.config as config_module
    importlib.reload(config_module)
    import forgekeeper.llm as llm_module
    importlib.reload(llm_module)
    from forgekeeper.llm import get_llm
    from forgekeeper.llm.transformers_impl import TransformersLLMProvider

    provider = get_llm()
    assert isinstance(provider, TransformersLLMProvider)
    assert provider.tokenizer.name_or_path == config_module.DEFAULT_TINY_MODEL

    output = provider.generate("Hello", max_new_tokens=1)
    assert isinstance(output, str) and output


def test_tiny_model_overrides_other_settings(monkeypatch):
    monkeypatch.setenv("FK_LLM_IMPL", "vllm")
    monkeypatch.setenv("FK_MODEL_PATH", "some/production-model")
    monkeypatch.setenv("USE_TINY_MODEL", "true")
    monkeypatch.setenv("FK_DEVICE", "cpu")
    monkeypatch.setenv("FK_DTYPE", "float32")

    import importlib
    import forgekeeper.config as config_module
    importlib.reload(config_module)
    import forgekeeper.llm as llm_module
    importlib.reload(llm_module)
    from forgekeeper.llm import get_llm
    from forgekeeper.llm.transformers_impl import TransformersLLMProvider

    provider = get_llm()
    assert isinstance(provider, TransformersLLMProvider)
    assert provider.tokenizer.name_or_path == config_module.DEFAULT_TINY_MODEL
