# Fence Compliance Checklist

**Plan reference:** Task T9 deliverable "Fence compliance checklist"

| Item | Description | Owner | Status |
|------|-------------|-------|--------|
| Tool allowlist | Verify `safety/fence_wrappers.py` allowlist matches policy doc. | Safety Officer | |
| Argument validation | Confirm schema validation rejects disallowed arguments. | Engineering | |
| Resource limits | CPU/memory quotas configured for sandbox runner. | SRE | |
| Audit logging | Tool executions emit JSONL with `tool`, `args_hash`, `result_size`. | Engineering | |
| Escalation path | HITL escalation configured for fence breaches. | Policy | |
| Test coverage | Automated tests cover allowlist bypass attempts. | QA | |
| Documentation | Playbook updated with latest fence behavior. | Safety | |
| Access review | Quarterly review of service accounts permitted to invoke fences. | Security | |

## Notes
- Checklist executed per release candidate.
- Store completed checklists in `workflows/hitl_hooks.yaml` attachments.
