
import os
import json
from datetime import datetime

PROPOSALS_FILE = os.path.join(os.path.dirname(__file__), "proposals.json")

def load_proposals():
    if os.path.exists(PROPOSALS_FILE):
        with open(PROPOSALS_FILE, "r") as f:
            return json.load(f)
    return []

def save_proposals(proposals):
    with open(PROPOSALS_FILE, "w") as f:
        json.dump(proposals, f, indent=2)

def propose_code_change(reason, module_path, suggestion, line_number=None):
    proposals = load_proposals()
    proposal = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "reason": reason,
        "module": module_path,
        "line_number": line_number,
        "suggestion": suggestion,
        "status": "pending"
    }
    proposals.append(proposal)
    save_proposals(proposals)
    return f"Proposal saved: {reason}"
