# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| main    | ✅ Active development |
| 1.x.x   | ✅ Security updates  |
| < 1.0   | ❌ No longer supported |

## Reporting a Vulnerability

We take the security of Forgekeeper seriously. If you discover a security vulnerability, please follow these steps:

### 1. Do Not Create a Public Issue

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, report them privately to maintain security until a fix is available.

### 2. Report Via GitHub Security Advisories (Preferred)

1. Go to https://github.com/gatewaybuddy/forgekeeper/security/advisories
2. Click "Report a vulnerability"
3. Fill out the form with:
   - **Description**: Clear description of the vulnerability
   - **Impact**: What an attacker could do
   - **Steps to reproduce**: Detailed steps (if applicable)
   - **Affected versions**: Which versions are vulnerable
   - **Suggested fix**: If you have ideas (optional)

### 3. Alternative: Email Report

If GitHub Security Advisories are not accessible, email:

**Email:** security@forgekeeper.dev *(replace with actual email)*

**Subject:** `[SECURITY] Brief description of the issue`

**Include:**
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Affected versions
- Your contact information (optional, for follow-up)

### 4. What to Expect

**Within 24-48 hours:**
- We'll acknowledge receipt of your report
- Assign a severity level (Critical, High, Medium, Low)
- Begin investigation

**Within 7 days:**
- Confirm the vulnerability and its impact
- Develop a fix or mitigation plan
- Provide an estimated timeline for patch release

**After fix is ready:**
- We'll coordinate disclosure timing with you
- Release patch and security advisory
- Credit you in the advisory (if desired)

## Security Update Process

When a security vulnerability is confirmed:

1. **Triage**: Assess severity and impact
2. **Fix Development**: Create patch on private branch
3. **Testing**: Verify fix resolves issue without regressions
4. **Release**:
   - For Critical/High: Emergency patch release within 48 hours
   - For Medium: Patch in next scheduled release (within 2 weeks)
   - For Low: Include in next minor/major release
5. **Advisory**: Publish security advisory with details
6. **Notification**: Notify users via GitHub releases and README

## Security Best Practices for Users

### For Production Deployments

**1. Keep Dependencies Updated**
- Enable Dependabot alerts (Settings → Security → Dependabot)
- Review and merge Dependabot PRs promptly
- Monitor `npm audit` and `pip-audit` outputs

**2. Secure Configuration**
```bash
# Use strong secrets
GITHUB_TOKEN=<use-github-secrets-not-plaintext>
AUTO_PR_ENABLED=0  # Disable until configured properly

# Restrict tool access
TOOLS_FS_ROOT=.forgekeeper/sandbox  # Use sandboxed directory
TOOL_ALLOW=read,write,bash  # Explicit allowlist only

# Disable unnecessary features
FRONTEND_ENABLE_POWERSHELL=0
FRONTEND_ENABLE_BASH=0  # Unless needed
```

**3. Network Security**
- Run behind reverse proxy (nginx, Caddy)
- Use HTTPS in production
- Set up firewall rules (allow only necessary ports)
- Use Docker network isolation

**4. Access Control**
- Require authentication for production instances
- Use environment-based secrets management
- Rotate API keys regularly
- Implement rate limiting

**5. Monitoring**
```bash
# Enable security logging
SCOUT_ENABLED=1  # Monitor API usage
FGK_CONTEXTLOG_DIR=/secure/logs  # Centralized logging

# Review logs regularly
grep "ERROR\|SECURITY\|UNAUTHORIZED" .forgekeeper/context_log/*.jsonl
```

### For Development

**1. Dependency Scanning**
```bash
# Frontend
cd forgekeeper/frontend
npm audit
npm audit fix

# Python
cd forgekeeper
pip-audit
```

**2. Code Scanning**
- CodeQL runs automatically on PRs
- Review security alerts at `/security/code-scanning`
- Fix high/critical findings before merging

**3. Secret Detection**
- Never commit secrets to git
- Use `.env` files (gitignored)
- Use GitHub Secrets for CI/CD
- Review commits with `git-secrets` or `trufflehog`

**4. Safe Auto-PR (SAPL) Security**
```bash
# Start with dry-run mode
AUTO_PR_DRYRUN=1  # Preview only, no git operations

# Use strict allowlist
AUTO_PR_ALLOW=docs/**/*.md,tests/**/*.mjs  # Docs and tests only

# Disable auto-merge
AUTO_PR_AUTOMERGE=0  # Manual review required
```

## Known Security Considerations

### Tool Execution (By Design)

Forgekeeper executes tools (bash, read, write) as part of its functionality. This is intentional but requires careful configuration:

**Mitigations:**
- Sandboxed filesystem access (`TOOLS_FS_ROOT`)
- Explicit tool allowlist (`TOOL_ALLOW`)
- User approval workflow for sensitive tools
- ContextLog auditing of all tool executions

**User Responsibility:**
- Review tool allowlist before enabling
- Monitor ContextLog for unexpected tool usage
- Run in isolated environment (Docker, VM)

### LLM Prompt Injection

Language models can be susceptible to prompt injection attacks:

**Mitigations:**
- Input validation and sanitization
- Tool execution requires confirmation
- Allowlist-based tool access
- Audit logging of all actions

**User Responsibility:**
- Don't expose to untrusted users without authentication
- Review autonomous agent actions
- Use read-only mode for untrusted inputs

### Dependency Vulnerabilities

Third-party dependencies may have vulnerabilities:

**Mitigations:**
- Automated Dependabot updates
- Regular `npm audit` / `pip-audit` scans
- CodeQL scanning of dependencies
- Pinned versions in package-lock.json

**User Responsibility:**
- Review and merge Dependabot PRs
- Subscribe to security advisories
- Update promptly when patches released

## Security Features

### ContextLog Auditing

All actions are logged to `.forgekeeper/context_log/`:

```jsonl
{"ts":"2025-11-14T...","actor":"tool","act":"bash","cmd":"ls -la","status":"ok"}
{"ts":"2025-11-14T...","actor":"system","act":"auto_pr","files":["README.md"],"status":"ok"}
```

**Use for:**
- Security incident investigation
- Compliance auditing
- Anomaly detection

### SAPL Safety Controls

Safe Auto-PR Loop has multiple safety layers:

1. **Allowlist**: Only safe files (docs, tests, config)
2. **Dry-run**: Preview before execution
3. **Audit log**: All PRs logged to ContextLog
4. **Kill-switch**: `AUTO_PR_ENABLED=0` disables instantly
5. **No auto-merge**: Manual review required by default

### TGT Privacy

Telemetry-Driven Task Generation analyzes local telemetry only:

- No data sent to external services
- All analysis runs locally
- ContextLog stays on your machine
- No tracking or phone-home

## Compliance

### GDPR / Privacy

Forgekeeper is designed for local deployment:

- No personal data collected by default
- No telemetry sent to external servers
- ContextLog is local-only
- User controls all data

### SOC 2 / Enterprise

For enterprise deployments:

- ContextLog provides audit trail
- Access control via reverse proxy
- Secret management via environment variables
- Network isolation via Docker

## Hall of Fame

We recognize security researchers who responsibly disclose vulnerabilities:

<!-- Will be updated as reports come in -->

*No vulnerabilities reported yet. Be the first!*

## Security Contacts

- **GitHub Security Advisories**: https://github.com/gatewaybuddy/forgekeeper/security/advisories
- **Email**: security@forgekeeper.dev *(update with actual email)*
- **PGP Key**: *(add if available)*

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [GitHub Security Best Practices](https://docs.github.com/en/code-security)
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)

---

**Last Updated:** 2025-11-14

**Version:** 1.0

**Thank you for helping keep Forgekeeper secure!**
