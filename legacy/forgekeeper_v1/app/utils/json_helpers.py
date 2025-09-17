import json
import re
# 🔍 Extract valid JSON from a model response
def extract_json(text):
    try:
        return json.loads(text)
    except:
        pass

    match = re.search(r'(\{.*?\}|\[.*?\])', text, re.DOTALL)
    if match:
        snippet = match.group(1)
        try:
            return json.loads(snippet)
        except:
            return {"response": snippet}

    return {"response": text.strip()}

