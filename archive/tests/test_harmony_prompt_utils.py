import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from forgekeeper.app.services.harmony.prompt_utils import extract_directives


def test_extract_directives():
    directives, text = extract_directives("Temperature: 0.2\nHello")
    assert directives == {"temperature": "0.2"}
    assert text == "Hello"


def test_extract_directives_multiple():
    sample = "Reasoning: high\nTop_P: 0.5\n\nDo something"
    directives, text = extract_directives(sample)
    assert directives == {"reasoning": "high", "top_p": "0.5"}
    assert text == "Do something"
