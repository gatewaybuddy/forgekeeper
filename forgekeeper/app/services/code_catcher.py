import os
import re
from forgekeeper.app.services.file_writer import write_to_file



def extract_functions_from_code(text):
    """
    Extract all top-level Python function blocks from a text blob.
    Returns a list of (function_name, function_code) tuples.
    """
    pattern = r"def\s+(\w+)\s*\(.*?\):.*?(?=(?:^def\s+|\Z))"
    matches = re.finditer(pattern, text, re.DOTALL | re.MULTILINE)

    functions = []
    for match in matches:
        func_code = match.group(0).strip()
        func_name = re.match(r"def\s+(\w+)", func_code).group(1)
        functions.append((func_name, func_code))

    return functions

def auto_write_functions_from_response(response_text, base_folder="functions"):
    """
    If the response contains valid function definitions, save each to a file named <function_name>.py in /functions.
    Returns list of written file paths.
    """
    if not os.path.exists(base_folder):
        os.makedirs(base_folder)

    written_files = []
    functions = extract_functions_from_code(response_text)
    for name, code in functions:
        path = os.path.join(base_folder, f"{name}.py")
        write_file(path, code)
        written_files.append(path)

    return written_files
