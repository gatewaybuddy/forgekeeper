def build_memory_prompt(prompt, system_prompt, summary, vector_summary, prompt_mode="inst"):
    memory_block = ""
    
    if summary:
        memory_block += "Summary of past thoughts:\n" + summary.strip() + "\n"
    
    if vector_summary:
        memory_block += "\nRelated memory entries:\n" + vector_summary.strip()

    if prompt_mode == "inst":
        return f"""[SYS]
{system_prompt.strip()}
[/SYS]

[INST]
Consider the following context as part of your memory:

{memory_block}

Now respond to the user prompt:

{prompt}
[/INST]"""
    else:
        return f"{system_prompt.strip()}\n\n{memory_block}\n\nUser: {prompt}"
