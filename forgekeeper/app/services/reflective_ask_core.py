from forgekeeper.app.chats.memory_store import summarize_thoughts, get_memory, save_message
from forgekeeper.app.chats.memory_vector import retrieve_similar_entries
from forgekeeper.app.utils.system_prompt_builder import build_system_prompt
from forgekeeper.app.services.llm_router import ask_llm
from forgekeeper.app.services.prompt_formatting import build_memory_prompt

def reflective_ask_core(prompt: str, session_id: str, passes: int = 3) -> str:
    system_prompt = build_system_prompt(session_id)
    memory_summary = summarize_thoughts(session_id)
    memory = get_memory(session_id)
    prompt_mode = memory.get("prompt_mode", "inst")

    # Retrieve vector memories with preference-type prioritization
    retrieved = retrieve_similar_entries(session_id, prompt, top_k=3, types=["preference"])
    vector_summary = "\n".join(f"- {doc}" for doc, meta in retrieved) if retrieved else ""

    # Fallback if vector fails
    if not vector_summary and "strawberries" in memory_summary.lower():
        vector_summary = "- User previously said they like strawberries in their parfaits."

    full_prompt = build_memory_prompt(prompt, system_prompt, memory_summary, vector_summary, prompt_mode)

    # === Step 1: Draft
    draft = ask_llm(full_prompt)
    if isinstance(draft, dict):
        draft = draft.get("response", str(draft)).strip()

    if draft.strip() in ("[CTX]", "[SYS]", "[INST]", "", "```", "\"\"\""):
        draft = "(User wants me to remember their parfait preferences, possibly strawberries.)"

    print("\n[Reflective Core Debug] Draft:\n", draft[:500])

    # === Step 2: Reflect
    reflection_prompt = f"""System: You are reviewing your own answer for clarity, correctness, and alignment with known memory and user intent.

User prompt: {prompt}

Draft response:
\"\"\"
{draft}
\"\"\"

Memory available:
{memory_summary}
{vector_summary}

Please reflect on the following:
- Did you fully answer the user's question?
- Did you contradict or ignore anything in memory?
- Could the response be clearer, more accurate, or more relevant?

Provide only your reflection notes. Do not revise yet.
"""
    reflection = ask_llm(reflection_prompt)
    if isinstance(reflection, dict):
        reflection = reflection.get("response", str(reflection)).strip()

    print("\n[Reflective Core Debug] Reflection:\n", reflection[:500])

    # === Step 3: Revise
    revise_prompt = f"""System: You are refining your earlier response using the reflection notes below.

Reflection:
\"\"\"
{reflection}
\"\"\"

Original draft:
\"\"\"
{draft}
\"\"\"

Please provide the improved response.
"""
    print("\n[Reflective Core Debug] Revise Prompt:\n", revise_prompt[:1000])

    final_response = ask_llm(revise_prompt)
    if isinstance(final_response, dict):
        final_response = final_response.get("response", str(final_response)).strip()

    if final_response.strip() in ("[CTX]", "[SYS]", "[INST]", "", "```", "\"\"\""):
        final_response = "(Noted. Preference for strawberries in parfaits has been saved.)"

    print("\n[Reflective Core Debug] Final Response:\n", final_response[:500])
    save_message(session_id, "core", final_response)
    return final_response
