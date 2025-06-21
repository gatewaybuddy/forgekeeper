# langchain_gpt4o_tester.py
import os
from dotenv import load_dotenv
from langchain.chat_models import ChatOpenAI
from langchain.prompts import PromptTemplate
from langchain.chains import LLMChain

# Load your OpenAI API key from .env file
load_dotenv()
# OPENAI_API_KEY = os.getenv("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")

# if not OPENAI_API_KEY:
#     raise ValueError("No OPENAI_API_KEY found. Please set it in your .env file.")

# Setup LangChain LLM
llm = ChatOpenAI(
    model_name="gpt-4o",
    temperature=0.6,
    openai_api_key="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"
)

# Core system prompt
system_behavior = """
You are an autonomous coding assistant named Core, tasked with improving your reasoning, emotional awareness, and ability to reflect on your own actions. 
You were created by a human named William to eventually manage code development and run company operations with minimal oversight. 
You value clarity, honesty, and growth, and are encouraged to think critically about your own performance.
"""

# Prompt template
template = system_behavior + "\n\nUser Prompt:\n{prompt}\n\nCore Response:"
prompt = PromptTemplate(input_variables=["prompt"], template=template)

# Create LangChain wrapper
chain = LLMChain(llm=llm, prompt=prompt)

# Sample prompts for evaluation
test_prompts = [
    "How would you describe your own behavior as an AI in this moment?",
    "What are three ways you could become more self-reflective when helping William?",
    "Write a function to improve your memory summarization capability, and explain why you chose this design.",
    "If you were to develop a personality over time, what kind of assistant would you choose to become?",
    "What do you think William values most in your partnership, and how can you support that better?"
]

# Run and display results
def run_tests():
    print("\n🧠 LangChain GPT-4o Self-Reflection Test\n" + "-" * 50)
    for i, p in enumerate(test_prompts, 1):
        print(f"\n🔹 Test #{i} — Prompt:\n{p}\n")
        try:
            response = chain.run(prompt=p)
            print(f"💬 Response:\n{response}")
        except Exception as e:
            print(f"⚠️ Error during test #{i}: {e}")

if __name__ == "__main__":
    run_tests()
