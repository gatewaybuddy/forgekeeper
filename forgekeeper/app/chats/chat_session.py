# forgekeeper/app/chat_session.py

from forgekeeper.app.chats.memory import load_memory, save_message, reset_memory
from forgekeeper.app.services.llm_service import ask_llm

class ChatSession:
    def __init__(self, session_id):
        self.session_id = session_id
        self.history = load_memory(session_id)["messages"]

    def user_prompt(self, content):
        save_message(self.session_id, "user", content, project_id=self.session_id)
        self.history.append({"role": "user", "content": content})
        return content

    def generate_response(self):
        prompt = "\n".join(f"{m['role']}: {m['content']}" for m in self.history)
        response = ask_llm(prompt)
        if isinstance(response, str):
            save_message(self.session_id, "assistant", response, project_id=self.session_id)
            self.history.append({"role": "assistant", "content": response})
        elif isinstance(response, dict) and "content" in response:
            save_message(self.session_id, "assistant", response["content"], project_id=self.session_id)
            self.history.append({"role": "assistant", "content": response["content"]})
        return response

    def clear(self):
        reset_memory(self.session_id)
        self.history = []
