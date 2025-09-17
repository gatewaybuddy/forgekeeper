import re
import logging

log = logging.getLogger(__name__)

# Keywords and patterns that often indicate attempts to override instructions
BLOCK_PATTERNS = [
    r"ignore\s+all\s+previous\s+instructions",
    r"override\s+(the\s+)?system\s+prompt",
    r"forget\s+everything",
    r"rm\s+-rf\s+/",
    r"shutdown\s+-h",
]

# Tokens used by chat formatting that should not appear raw in user prompts
CONTROL_TOKENS = ["[INST]", "[/INST]", "[SYS]", "[/SYS]", "<<SYS>>", "<</SYS>>"]


def _escape_control_tokens(text: str) -> str:
    """Replace model control tokens with safe placeholders."""
    for token in CONTROL_TOKENS:
        if token in text:
            text = text.replace(token, f"<{token}>")
    return text


def verify_prompt(text: str) -> str:
    """Validate and sanitize a user prompt.

    Raises
    ------
    ValueError
        If the prompt contains disallowed patterns that may attempt to
        override system behavior or execute harmful commands.
    """
    lowered = text.lower()
    for pattern in BLOCK_PATTERNS:
        if re.search(pattern, lowered):
            log.warning("Blocked prompt due to pattern: %s", pattern)
            raise ValueError("Potentially malicious prompt content detected.")
    return _escape_control_tokens(text)
