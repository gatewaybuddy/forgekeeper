# Capability Layers Guide

**Status**: Active
**Version**: 1.0.0
**Date**: 2025-11-21

---

## Overview

Forgekeeper implements a **capability-first architecture** with three configurable security layers. By default, the system provides maximum capability with zero artificial restrictions. Users can opt-in to guardrails based on their environment and requirements.

**Philosophy**: Local development = unlimited iterations at no cost. Restrictions should exist only when explicitly needed, not as defaults.

---

## Three Capability Layers

### Layer 1: Maximum Capability (Default)

**Use Case**: Local development, maximum iteration speed

**Configuration**:
```bash
# Filesystem: Full access
ENABLE_FS_SANDBOX=0
TOOLS_FS_ROOT=/workspace

# Logging: Full transparency
ENABLE_LOG_REDACTION=0
REDACTION_MODE=off

# Performance: Unlimited
RATE_LIMIT_ENABLED=0
RESOURCE_QUOTAS_ENABLED=0

# Tools: Unrestricted
FRONTEND_ENABLE_BASH=1
FRONTEND_ENABLE_POWERSHELL=1
FRONTEND_ENABLE_REPO_WRITE=1
```

**Characteristics**:
- ✅ Full filesystem access (read/write anywhere in /workspace)
- ✅ No log redaction (see everything for debugging)
- ✅ No rate limits (unlimited local execution)
- ✅ No resource quotas (no disk/memory/CPU limits)
- ✅ Maximum transparency and capability

**Recommended For**:
- Local development environments
- Rapid prototyping and experimentation
- Maximum iteration speed
- Solo developer workflows

---

### Layer 2: Team Environment

**Use Case**: Shared development, team collaboration with minimal guardrails

**Configuration**:
```bash
# Filesystem: Still full access
ENABLE_FS_SANDBOX=0
TOOLS_FS_ROOT=/workspace

# Logging: Minimal redaction
ENABLE_LOG_REDACTION=1
REDACTION_MODE=minimal
REDACTION_CONTEXT=dev

# Performance: Still unlimited
RATE_LIMIT_ENABLED=0
RESOURCE_QUOTAS_ENABLED=0

# Tools: Unrestricted
FRONTEND_ENABLE_BASH=1
FRONTEND_ENABLE_POWERSHELL=1
FRONTEND_ENABLE_REPO_WRITE=1
```

**Characteristics**:
- ✅ Full filesystem access (team trusts each other)
- ⚠️ Minimal log redaction (only critical secrets like API keys)
- ✅ No rate limits (trust team members)
- ✅ No resource quotas (team environment has resources)
- 📝 Shared visibility with basic privacy

**Recommended For**:
- Shared development servers
- Team collaboration environments
- CI/CD pipelines (non-production)
- Staging environments

---

### Layer 3: Production (Compliance)

**Use Case**: Production deployments, compliance requirements, untrusted environments

**Configuration**:
```bash
# Filesystem: Sandboxed
ENABLE_FS_SANDBOX=1
TOOLS_FS_ROOT=/workspace/sandbox

# Logging: Aggressive redaction
ENABLE_LOG_REDACTION=1
REDACTION_MODE=aggressive
REDACTION_CONTEXT=production

# Performance: Rate limited
RATE_LIMIT_ENABLED=1
RATE_LIMIT_CAPACITY=100
RATE_LIMIT_REFILL_RATE=10

# Resource Quotas: Enforced
RESOURCE_QUOTAS_ENABLED=1
TOOL_RATE_LIMIT_PER_MIN=30
TOOL_DISK_QUOTA_BYTES=10485760  # 10MB
TOOL_MEMORY_LIMIT_MB=512
TOOL_CPU_TIMEOUT_MS=30000

# Tools: Restricted as needed
FRONTEND_ENABLE_BASH=0  # Or 1 if needed
FRONTEND_ENABLE_POWERSHELL=0  # Or 1 if needed
FRONTEND_ENABLE_REPO_WRITE=0  # Usually disabled
```

**Characteristics**:
- 🔒 Sandboxed filesystem (confined to designated directory)
- 🔒 Aggressive log redaction (emails, phones, IPs, all secrets)
- 🔒 Rate limiting (prevent runaway execution)
- 🔒 Resource quotas (prevent resource exhaustion)
- 🔒 Maximum security and compliance

**Recommended For**:
- Production deployments
- Compliance-regulated environments (SOC2, HIPAA, etc.)
- Untrusted or multi-tenant environments
- Public-facing instances

---

## Configuration Reference

### Filesystem Sandbox

**Variable**: `ENABLE_FS_SANDBOX`

**Options**:
- `0` (default): **Disabled** - Full filesystem access
  - Paths resolve from `/workspace` or absolute paths
  - Can read/write anywhere in mounted volumes
  - Maximum capability for local development

- `1`: **Enabled** - Sandboxed access
  - Paths confined to `TOOLS_FS_ROOT` directory
  - Attempts to escape sandbox throw errors
  - Required for production/untrusted environments

**Related Variables**:
- `TOOLS_FS_ROOT`: Base directory (default: `/workspace`)
  - When sandbox disabled: Working directory for relative paths
  - When sandbox enabled: Boundary for file operations

---

### Log Redaction

**Variable**: `ENABLE_LOG_REDACTION`

**Options**:
- `0` (default): **Disabled** - Full transparency
  - No redaction applied to logs
  - See exact API keys, passwords, etc.
  - Maximum debugging capability

- `1`: **Enabled** - Redaction active
  - Applies redaction based on `REDACTION_MODE`
  - Context-aware based on `REDACTION_CONTEXT`

**Related Variables**:

**`REDACTION_MODE`** (when `ENABLE_LOG_REDACTION=1`):
- `off` (default): No redaction (same as `ENABLE_LOG_REDACTION=0`)
- `minimal`: Redact only critical secrets
  - API keys (OpenAI, Anthropic, AWS, Stripe, GitHub)
  - Passwords, SSH keys, JWT tokens
  - Database connection strings
- `standard`: Redact common sensitive data
  - All minimal patterns
  - Credit card numbers, SSNs
  - Generic API tokens
- `aggressive`: Redact all potentially sensitive data
  - All standard patterns
  - Email addresses, phone numbers, IP addresses
  - Long alphanumeric strings (32+ chars)

**`REDACTION_CONTEXT`** (when `ENABLE_LOG_REDACTION=1`):
- `dev` (default): Development rules
  - Minimal redaction even if mode is standard
  - Favor transparency for debugging
- `staging`: Staging environment rules
  - Standard redaction baseline
  - Balance security and debuggability
- `production`: Production rules
  - Aggressive redaction by default
  - Maximum compliance and privacy

---

### Rate Limiting

**Variable**: `RATE_LIMIT_ENABLED`

**Options**:
- `0` (default): **Disabled** - Unlimited execution
  - No limits on request rates
  - Maximum iteration speed
  - Recommended for local development

- `1`: **Enabled** - Token bucket rate limiting
  - Limits requests to prevent runaway loops
  - Configurable capacity and refill rate

**Related Variables** (when `RATE_LIMIT_ENABLED=1`):
- `RATE_LIMIT_CAPACITY=100`: Maximum burst size (tokens)
- `RATE_LIMIT_REFILL_RATE=10`: Tokens per second
- `RATE_LIMIT_COST_PER_REQUEST=1`: Tokens per request

**Behavior**:
- Initial burst up to `CAPACITY` requests
- After burst, steady rate of `REFILL_RATE` requests/sec
- Returns `429 Too Many Requests` when bucket empty
- Includes `Retry-After` header for client guidance

---

### Resource Quotas

**Variable**: `RESOURCE_QUOTAS_ENABLED`

**Options**:
- `0` (default): **Disabled** - No limits
  - Unlimited disk writes per tool
  - No memory limits
  - No CPU timeouts (beyond general `TOOL_TIMEOUT_MS`)

- `1`: **Enabled** - Per-tool resource quotas
  - Enforce disk, memory, and request rate limits
  - Prevent resource exhaustion

**Related Variables** (when `RESOURCE_QUOTAS_ENABLED=1`):
- `TOOL_RATE_LIMIT_PER_MIN=30`: Requests per minute per tool
- `TOOL_DISK_QUOTA_BYTES=10485760`: Disk quota (10MB default)
- `TOOL_MEMORY_LIMIT_MB=512`: Memory limit (512MB default)
- `TOOL_CPU_TIMEOUT_MS=30000`: CPU timeout (30s default)

**Behavior**:
- Tracks disk writes per tool
- Monitors request rates per tool
- Returns errors when quotas exceeded
- Resets on server restart (in-memory tracking)

---

## Migration Guide

### Upgrading from Old Defaults

If you're upgrading from a previous version with restrictive defaults:

**Before (Old Defaults)**:
```bash
# Old: Sandbox enabled by default
TOOLS_FS_ROOT=.forgekeeper/sandbox  # Restrictive

# Old: Rate limiting enabled
RATE_LIMIT_ENABLED=1  # Restricts throughput

# Old: Aggressive redaction always on
# No flag - always redacted
```

**After (Capability-First Defaults)**:
```bash
# New: Sandbox disabled by default
ENABLE_FS_SANDBOX=0  # Full access
TOOLS_FS_ROOT=/workspace

# New: Rate limiting disabled
RATE_LIMIT_ENABLED=0  # Unlimited

# New: Redaction disabled
ENABLE_LOG_REDACTION=0  # Full transparency
```

**To Keep Old Behavior** (if desired):
```bash
# Opt-in to Layer 3 (production) configuration
ENABLE_FS_SANDBOX=1
TOOLS_FS_ROOT=.forgekeeper/sandbox
RATE_LIMIT_ENABLED=1
ENABLE_LOG_REDACTION=1
REDACTION_MODE=aggressive
RESOURCE_QUOTAS_ENABLED=1
```

---

## Best Practices

### For Local Development
1. **Use Layer 1 (default)**: No configuration needed
2. **Keep logs transparent**: `ENABLE_LOG_REDACTION=0`
3. **Allow unlimited execution**: `RATE_LIMIT_ENABLED=0`
4. **Debug freely**: Full filesystem access

### For Team Environments
1. **Use Layer 2**: Minimal redaction only
2. **Share visibility**: Logs readable but secrets redacted
3. **Trust team**: No rate limits or quotas
4. **Document overrides**: If specific restrictions needed

### For Production
1. **Use Layer 3**: Full guardrails enabled
2. **Enforce sandbox**: `ENABLE_FS_SANDBOX=1`
3. **Aggressive redaction**: `REDACTION_MODE=aggressive`
4. **Rate limit**: Prevent abuse
5. **Resource quotas**: Prevent exhaustion
6. **Monitor**: Track rejection rates

### For Compliance (SOC2, HIPAA, etc.)
1. **Start with Layer 3**
2. **Audit logs**: Enable ContextLog with redaction
3. **Document policy**: Which data is redacted
4. **Test redaction**: Verify PII/PHI is redacted
5. **Regular review**: Ensure patterns up-to-date

---

## Troubleshooting

### "Path escapes sandbox" Error
**Cause**: Trying to access file outside `TOOLS_FS_ROOT` when `ENABLE_FS_SANDBOX=1`

**Solutions**:
1. **Disable sandbox** (dev): `ENABLE_FS_SANDBOX=0`
2. **Adjust TOOLS_FS_ROOT** (if sandbox needed): Set to parent directory
3. **Use absolute paths** (if sandbox disabled): Will resolve correctly

### Rate Limit 429 Errors
**Cause**: Hit rate limit when `RATE_LIMIT_ENABLED=1`

**Solutions**:
1. **Disable rate limiting** (dev): `RATE_LIMIT_ENABLED=0`
2. **Increase capacity** (if needed): `RATE_LIMIT_CAPACITY=500`
3. **Increase refill rate** (if needed): `RATE_LIMIT_REFILL_RATE=50`
4. **Wait**: Respect `Retry-After` header

### Missing Data in Logs
**Cause**: Data redacted when `ENABLE_LOG_REDACTION=1`

**Solutions**:
1. **Disable redaction** (dev): `ENABLE_LOG_REDACTION=0`
2. **Use minimal mode** (if needed): `REDACTION_MODE=minimal`
3. **Check context** (if enabled): Set `REDACTION_CONTEXT=dev`

### Resource Quota Errors
**Cause**: Exceeded quota when `RESOURCE_QUOTAS_ENABLED=1`

**Solutions**:
1. **Disable quotas** (dev): `RESOURCE_QUOTAS_ENABLED=0`
2. **Increase limits** (if needed):
   - `TOOL_DISK_QUOTA_BYTES=52428800` (50MB)
   - `TOOL_MEMORY_LIMIT_MB=2048` (2GB)

---

## FAQ

### Why are guardrails opt-in instead of opt-out?

**Philosophy**: Forgekeeper is designed for local development where unlimited iteration at no cost is the primary goal. Artificial restrictions:
- Slow development velocity
- Create debugging friction
- Hide useful information
- Add cognitive overhead

Guardrails are provided for production/compliance contexts where they're actually needed, not imposed on development where they're counterproductive.

### Is this secure?

**Yes**, when configured appropriately for the environment:
- **Local dev**: No restrictions needed (you trust your local machine)
- **Team dev**: Minimal restrictions (you trust your team)
- **Production**: Full restrictions (untrusted or compliance-required)

The three-layer model ensures you can choose the right security posture for your context.

### Can I create custom layers?

**Absolutely!** The three layers are templates. You can mix and match settings:

```bash
# Custom: Team with sandboxing
ENABLE_FS_SANDBOX=1  # From Layer 3
ENABLE_LOG_REDACTION=1  # From Layer 2
REDACTION_MODE=minimal  # From Layer 2
RATE_LIMIT_ENABLED=0  # From Layer 1
RESOURCE_QUOTAS_ENABLED=0  # From Layer 1
```

### How do I know which layer I'm using?

Check your `.env` or environment variables. Missing variables default to Layer 1 (maximum capability).

### What if I need different settings per tool?

Currently, settings are global. Future enhancements may support per-tool configuration. For now, use tool allowlists (`TOOL_ALLOW`) to restrict which tools are available.

---

## Related Documentation

- [Capability Expansion Plan](../planning/CAPABILITY_EXPANSION_PLAN.md) - Full architectural vision
- [Capability Expansion Summary](../planning/CAPABILITY_EXPANSION_SUMMARY.md) - Quick reference
- [Tool Security Guide](../TOOL_SECURITY_GUIDE.md) - Tool-specific security
- [CLAUDE.md](../../CLAUDE.md) - Architecture overview

---

**Status**: ✅ Implemented (Sprint 1 Complete)
**Version**: 1.0.0
**Last Updated**: 2025-11-21
