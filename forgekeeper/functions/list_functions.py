import os

def list_functions():
    path = os.path.join(os.path.dirname(__file__), ".")
    files = [f[:-3] for f in os.listdir(path) if f.endswith(".py") and f != "__init__.py"]
    return files
