
import uuid
from forgekeeper.app.chats.memory_store import save_message, load_memory
from forgekeeper.app.self.proposal_engine import propose_code_change
from forgekeeper.app.interpreter.prompt_mapper import interpret_prompt
from forgekeeper.llm.clients import openai_compat_client
from .tool_utils import build_tool_specs, execute_tool_call

class ForgeAgent:
    def __init__(self, name="ForgeKeeper", session_id=None):
        self.name = name
        self.session_id = session_id or str(uuid.uuid4())
        self.memory = load_memory(self.session_id)

    def receive_input(self, user_input):
        save_message(self.session_id, "user", user_input)
        intent_result = interpret_prompt(user_input, self.session_id)
        if intent_result:
            save_message(self.session_id, "assistant", intent_result)
            return intent_result
        return None

    def reflect_on_memory(self):
        thoughts = [m["content"] for m in self.memory.get("internal", [])[-5:]]
        summary = "\n".join([f"- {t}" for t in thoughts])
        reflection = f"Summary of recent thoughts:\n{summary}"
        return reflection

    def propose_fix(self, reason, module_path, suggestion, line_number=None):
        return propose_code_change(reason, module_path, suggestion, line_number)

    def respond(self, llm, user_input):
        """Respond to ``user_input`` using the core model and tool calling."""
        prompt = self.format_prompt(user_input)
        messages = [{"role": "user", "content": prompt}]
        tools = build_tool_specs()
        message = openai_compat_client.chat("core", messages, tools=tools)
        tool_calls = message.get("tool_calls") or []
        if tool_calls:
            messages.append(message)
            for call in tool_calls:
                result = execute_tool_call(call)
                save_message(self.session_id, "tool", result)
                messages.append({"role": "tool", "tool_call_id": call.get("id", ""), "content": result})
            message = openai_compat_client.chat("core", messages)

        content = message.get("content", "")
        save_message(self.session_id, "assistant", content)
        return content

    def format_prompt(self, user_input):
        prompt = f"[SYS]\nYou are {self.name}. Think carefully, then respond.\n[/SYS]\n"
        for msg in self.memory.get("shared", [])[-5:]:
            tag = "[INST]" if msg["role"] == "user" else "[SYS]"
            prompt += f"{tag} {msg['content']} {tag.replace('[', '[/')}\n"
        prompt += f"[INST] {user_input} [/INST]\n"
        return prompt
