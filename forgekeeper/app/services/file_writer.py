# forgekeeper/app/services/file_writer.py
import os

FUNCTION_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "../../../functions"))

def write_function_file(name: str, code: str):
    os.makedirs(FUNCTION_DIR, exist_ok=True)
    filepath = os.path.join(FUNCTION_DIR, f"{name}.py")
    with open(filepath, "w") as f:
        f.write(code)
    return filepath
