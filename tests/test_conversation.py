import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from forgekeeper.app.services.conversation import folders, messages


def test_message_and_folder_ops(tmp_path, monkeypatch):
    data_file = tmp_path / "conversations.json"
    monkeypatch.setattr(messages, "DATA_FILE", data_file)

    # Add a message to a conversation
    msg = messages.add_message("conv1", "user", "hello world")
    assert msg.role == "user"

    conversations = messages.list_conversations()
    assert len(conversations) == 1
    assert conversations[0].messages[0].content == "hello world"

    # Folder operations
    folders.create_folder("root")
    assert folders.rename_folder("root", "inbox")
    result = folders.list_folders()
    assert len(result) == 1
    assert result[0].name == "inbox"
