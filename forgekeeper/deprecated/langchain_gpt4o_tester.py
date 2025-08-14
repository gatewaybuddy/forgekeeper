"""Deprecated LangChain helper for GPT‑4o.

This script is kept only for historical reference. Forgekeeper's workflow now
uses vLLM; prefer the vLLM smoke tests and server scripts instead.
"""

import os
import warnings
from dotenv import load_dotenv
from langchain.chat_models import ChatOpenAI
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain

warnings.warn(
    "langchain_gpt4o_tester.py is deprecated; use the vLLM workflow instead",
    DeprecationWarning,
)

load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("No OPENAI_API_KEY found. Please set it in your .env file.")

llm = ChatOpenAI(model_name="gpt-4o", temperature=0.6, openai_api_key=OPENAI_API_KEY)

system_behavior = (
    "You are an autonomous coding assistant named Core, tasked with improving "
    "your reasoning, emotional awareness, and ability to reflect on your own "
    "actions."
)

template = system_behavior + "\n\nUser Prompt:\n{prompt}\n\nCore Response:"
prompt = PromptTemplate(input_variables=["prompt"], template=template)
chain = LLMChain(llm=llm, prompt=prompt)

test_prompts = [
    "How would you describe your own behavior as an AI in this moment?",
    "What are three ways you could become more self-reflective when helping William?",
]

log = get_logger(__name__, debug=DEBUG_MODE)


def run_tests() -> None:
    log.info("\n🧠 LangChain GPT-4o Self-Reflection Test\n" + "-" * 50)
    for i, p in enumerate(test_prompts, 1):
        log.info(f"\n🔹 Test #{i} — Prompt:\n{p}\n")
        try:
            response = chain.run(prompt=p)
            log.info(f"💬 Response:\n{response}")
        except Exception as e:  # pragma: no cover - diagnostic script
            log.error(f"⚠️ Error during test #{i}: {e}")


if __name__ == "__main__":  # pragma: no cover - script entry point
    run_tests()

