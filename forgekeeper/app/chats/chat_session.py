# forgekeeper/app/chat_session.py

from forgekeeper.app.memory_store import load_memory, save_message
from forgekeeper.app.llm_interface import ask_llm  # assume this handles OpenAI or LM Studio

class ChatSession:
    def __init__(self, session_id):
        self.session_id = session_id
        self.history = load_memory(session_id)["messages"]

    def user_prompt(self, content):
        save_message(self.session_id, "user", content, project_id=self.session_id)
        self.history.append({"role": "user", "content": content})
        return content

    def generate_response(self):
        response = ask_llm(self.history)
        if isinstance(response, str):  # handle raw string output
            save_message(self.session_id, "assistant", response, project_id=self.session_id)
            self.history.append({"role": "assistant", "content": response})
        elif isinstance(response, dict) and "content" in response:
            save_message(self.session_id, "assistant", response["content"], project_id=self.session_id)
            self.history.append({"role": "assistant", "content": response["content"]})
        return response

    def clear(self):
        from forgekeeper.app.memory_store import clear_memory
        clear_memory(self.session_id)
        self.history = []
