
def read_file(path):
    """
    Reads and returns the contents of a file.
    Arguments:
        path (str): Path to the file (relative to project root).
    Returns:
        dict: { "content": "..." } or { "error": "..." }
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            return {"content": f.read()}
    except Exception as e:
        return {"error": str(e)}
