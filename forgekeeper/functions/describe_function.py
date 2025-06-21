
def describe_function(name):
    """
    Reads and returns the docstring or full source code of a function file.
    Arguments:
        name (str): The name of the function (without .py)
    Returns a dictionary with 'description' or 'error' key.
    """
    try:
        with open(f"functions/{name}.py", "r") as f:
            code = f.read()
        # Extract docstring if available, else return code preview
        if '"""' in code:
            return {"description": code.split('"""')[1].strip()}
        else:
            return {"description": code[:300]}  # partial fallback
    except Exception as e:
        return {"error": str(e)}
