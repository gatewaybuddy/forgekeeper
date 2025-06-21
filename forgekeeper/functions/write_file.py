
def write_file(path, content):
    """
    Writes content to a file.
    Arguments:
        path (str): Path to the file (relative to project root).
        content (str): Content to write to the file.
    Returns:
        dict: { "result": "success" } or { "error": "..." }
    """
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return {"result": "success"}
    except Exception as e:
        return {"error": str(e)}
