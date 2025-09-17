import os
import importlib.util
from forgekeeper.logger import get_logger
from forgekeeper.config import DEBUG_MODE

log = get_logger(__name__, debug=DEBUG_MODE)

def load_functions(directory="functions"):
    functions = {}

    # Resolve absolute path to functions directory based on this script's location
    base_path = os.path.dirname(os.path.abspath(__file__))
    full_path = os.path.join(base_path, "..", "..", directory)
    full_path = os.path.normpath(full_path)

    if not os.path.isdir(full_path):
        log.warning(f"Function directory '{full_path}' not found.")
        return functions

    for filename in os.listdir(full_path):
        if filename.endswith(".py"):
            module_name = filename[:-3]
            path = os.path.join(full_path, filename)
            spec = importlib.util.spec_from_file_location(module_name, path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            for attr in dir(mod):
                obj = getattr(mod, attr)
                if callable(obj):
                    functions[attr] = obj
    return functions
