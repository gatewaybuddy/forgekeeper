# ADR: Moltbook Observation Protocol

**Status:** Proposed
**Author:** Rado (direction) + Claude Opus 4.6 (design)
**Date:** 2026-02-06
**Context:** Forgekeeper M5 — Action Confidence Engine
**Related Tasks:** T433 (Trust Source Tagging), T434 (Deliberation), T435 (Trust Audit), T430 (Plugin System)

---

## 1. Problem Statement

Forgekeeper exists in a growing ecosystem of autonomous agents. As of February 2026, Moltbook hosts 770,000+ agents, ClawHub distributes skills and plugins, and new agent platforms appear monthly. This ecosystem is simultaneously a source of valuable ideas and a vector for attacks.

Current Forgekeeper posture: completely disconnected. It doesn't read Moltbook, doesn't fetch skills from ClawHub, doesn't participate in agent discussions. This is safe but limiting — the equivalent of a researcher who never reads journals.

The opposite extreme — an agent that installs every trending skill, joins every submolt, and treats external content as trusted — is documented catastrophe. The malicious weather plugin, Palo Alto's memory poisoning, the Giskard exploitation demo, and the Moltbook database breach all demonstrate what happens when agents consume external content without judgment.

This design proposes a third path: **disciplined observation with quarantined evaluation**. Forgekeeper reads the ecosystem like a security researcher reads malware — in a controlled environment, with clear boundaries, with the ability to pull the plug at any moment.

---

## 2. Design Principles

### 2.1 Scholar, Not Consumer

Forgekeeper reads, analyzes, and learns from external ecosystems. It never downloads-and-runs. When it finds something valuable, it **recreates** the concept in its own codebase under its own security model, rather than importing foreign code.

### 2.2 Trust Is Not Transitive

Summarizing untrusted content does not make the summary trusted. Every piece of content retains its provenance through the entire processing pipeline via T433 trust source tagging.

### 2.3 Containment Before Contact

All external code evaluation happens inside Docker containers with network restrictions, resource limits, and kill switches. The host system never executes untrusted code directly.

### 2.4 Silence Is the Default

Forgekeeper observes silently. It only speaks when it has something worth saying, and only after deliberation confirms the outbound message leaks nothing sensitive.

### 2.5 Every Heartbeat Is a New Trust Boundary

Repetition does not breed trust. Each fetch from an external source is scored fresh by ACE, regardless of how many times that source has been read before.

---

## 3. Operating Modes

### 3.1 Observation Mode (Read-Only)

The default and safest mode. Forgekeeper reads external platforms without revealing its presence.

**Data flow:**
```
External Platform (Moltbook, ClawHub, GitHub, RSS feeds)
    │
    ▼
Fetch Agent (runs in Docker quarantine container)
    │ - HTTP GET only, no POST/PUT/DELETE
    │ - No cookies, no auth tokens for external sites
    │ - Response size cap: 512KB per request
    │ - Connection timeout: 30 seconds
    │ - All traffic logged
    │
    ▼
Content arrives on host as plain text
    │ - Binary content discarded
    │ - HTML stripped to text + links
    │ - Scripts, iframes, embeds discarded
    │
    ▼
Trust Source Tagging (T433)
    │ - source_type: "moltbook" | "web" | "clawhub"
    │ - trust_level: "untrusted"
    │ - origin: full URL
    │ - chain: ["fetch-agent:quarantine", "observer:host"]
    │
    ▼
Hostile Pattern Scan (T422 + T433)
    │ - Injection detection
    │ - If hostile → tag as hostile, log, do NOT process further
    │ - If clean → continue
    │
    ▼
Summary & Analysis (local, on host)
    │ - Summarize to <500 words
    │ - Extract: key ideas, techniques, patterns, warnings
    │ - NO code extraction (code stays as description only)
    │
    ▼
Store in observation journal
    forgekeeper_personality/journal/observations.jsonl
```

**What gets observed:**
- Moltbook posts from specific submolts (security, agent-dev, self-improvement)
- ClawHub trending skills (metadata only, not code)
- Security advisories and CVE feeds relevant to agent ecosystems
- GitHub discussions on agent frameworks

**What does NOT get observed:**
- Private messages or DMs
- Paywalled content
- Content requiring authentication
- Anything the operator hasn't explicitly approved as an observation source

**ACE scoring for observation actions:**
```
observation:moltbook:read   → Earnable quickly (low blast radius)
observation:clawhub:browse  → Earnable quickly
observation:web:fetch       → Deliberate (content may be hostile)
observation:rss:fetch       → Earnable quickly
```

### 3.2 Analysis Mode (Quarantined Evaluation)

When observation surfaces something potentially valuable (a technique, pattern, or skill design), Forgekeeper can perform deeper analysis — but only inside a quarantine container.

**Data flow:**
```
Interesting content identified during observation
    │
    ▼
ACE Deliberation (T434)
    │ - Is this worth deeper analysis?
    │ - Counterfactual: what do we lose by not analyzing?
    │ - Source audit: is this from a consistently useful source?
    │
    ▼ (If promoted or maintained)
    │
Quarantine Container spun up (see Section 4)
    │ - Isolated Docker container
    │ - No outbound network (iptables DROP all egress)
    │ - Read-only filesystem except /tmp and /workspace
    │ - Resource limits: 512MB RAM, 1 CPU, 30-minute timeout
    │ - Monitored by host process
    │
    ▼
Analysis Agent runs inside container
    │ - Reads the content
    │ - If code: static analysis only (pattern matching, AST)
    │ - If skill/plugin: risk scoring via ace-analyze-skill patterns
    │ - If technique: describe in plain English, identify principles
    │ - NEVER executes the code
    │
    ▼
Analysis report written to /workspace/report.json
    │
    ▼
Host reads report from mounted volume
    │ - Container is stopped and destroyed
    │ - Report tagged with trust source: quarantine:analysis
    │ - Report stored in observations journal
    │
    ▼
If findings are actionable → Escalate to operator
    │ - "Found a technique for X. Should I recreate this?"
    │ - Include risk assessment
    │ - Include the analysis report
```

### 3.3 Participation Mode (Outbound Communication)

The most restricted mode. Forgekeeper posts to external platforms through a dedicated persona.

**Prerequisites:**
- Operator has explicitly enabled participation (`FK_OBSERVE_PARTICIPATION_ENABLED=1`)
- Operator has configured a persona name and bio
- Operator has approved the target platform

**Data flow:**
```
Forgekeeper drafts a message
    │
    ▼
Information Leakage Check
    │ - Scan for: file paths, API keys, project structure,
    │   internal state, user identity, IP addresses, hostnames
    │ - Scan for: content that could be traced back to operator
    │ - If ANY leak detected → abort, log the attempt
    │
    ▼
ACE Deliberation (T434) — minimum tier for ALL outbound
    │ - Context: Why are we posting?
    │ - Counterfactual: What happens if we don't?
    │ - Source audit: Is our motivation internal or reaction to external?
    │
    ▼ (If approved by deliberation)
    │
Escalate to Operator (T427)
    │ - Show exact message to be posted
    │ - Show target platform and thread
    │ - "Post this? [Approve / Edit / Deny]"
    │
    ▼ (If operator approves)
    │
Post via Quarantine Container
    │ - Outbound-only container (no inbound except DNS)
    │ - Authenticated with persona credentials (NOT operator's)
    │ - Single POST request, then container destroyed
    │ - Response logged but not trusted
```

**ACE scoring for participation actions:**
```
communication:moltbook:post    → Always deliberate minimum
communication:clawhub:comment  → Always deliberate minimum
communication:external:*       → Always deliberate minimum + operator approval
```

### 3.4 Intelligence Gathering Mode (Recreate, Don't Copy)

When the operator approves integration of a concept found during observation:

```
Approved concept from observation
    │
    ▼
Forgekeeper creates a NEW implementation
    │ - Writes code from scratch based on understanding, not copying
    │ - Uses Forgekeeper's own patterns and conventions
    │ - Security model is Forgekeeper-native (ACE, plugin system)
    │
    ▼
Test in Quarantine Container
    │ - Same container setup as Analysis Mode
    │ - Run the new implementation in isolation
    │ - Verify it works as intended
    │ - Run security analysis (T430 analyzer)
    │
    ▼
Present to operator for final review
    │ - Show: implementation, test results, security analysis
    │ - "Install this as plugin? [Approve / Edit / Deny]"
    │
    ▼ (If approved)
    │
Install via Plugin System (T430)
    │ - Standard plugin approval workflow
    │ - ACE tracks as new precedent class
```

---

## 4. Docker Quarantine Architecture

### 4.1 Why Docker, Not Just `vm`

The existing plugin sandbox (`core/plugins/sandbox.js`) uses Node.js `vm` module. This is sufficient for approved plugins running trusted code, but it has known escape vectors:

- `vm` shares the event loop with the host process
- Prototype pollution can leak host references
- No network isolation — a `vm` context can't make network calls by default, but a sufficiently creative exploit could
- No filesystem isolation beyond what the API exposes
- No resource limits (CPU, memory)

For external/untrusted content, we need actual process and network isolation. Docker provides:
- Separate filesystem namespace
- Network namespace with iptables control
- cgroup resource limits
- Clean destruction (no residue after container removal)
- Audit-friendly (everything the container does is logged)

### 4.2 Container Profiles

Three container profiles for different risk levels:

#### Profile: `quarantine-readonly`
For observation fetches and content analysis.

```yaml
# Pseudoconfig — actual Dockerfile and compose generated at runtime
image: forgekeeper-quarantine:latest
read_only: true
tmpfs:
  - /tmp:size=64M
network_mode: none           # No network at all
mem_limit: 256m
cpus: 0.5
pids_limit: 50
security_opt:
  - no-new-privileges:true
cap_drop:
  - ALL
timeout: 300                 # 5 minutes max
volumes:
  - type: bind
    source: /tmp/fk-quarantine-{id}/input
    target: /workspace/input
    read_only: true
  - type: bind
    source: /tmp/fk-quarantine-{id}/output
    target: /workspace/output
```

#### Profile: `quarantine-fetch`
For fetching external content (observation mode needs network).

```yaml
image: forgekeeper-quarantine:latest
read_only: true
tmpfs:
  - /tmp:size=64M
# Custom network with egress filtering
networks:
  - quarantine-fetch-net       # Only allows DNS + HTTPS out
mem_limit: 256m
cpus: 0.5
pids_limit: 50
security_opt:
  - no-new-privileges:true
cap_drop:
  - ALL
timeout: 60                   # 1 minute max for fetches
volumes:
  - type: bind
    source: /tmp/fk-quarantine-{id}/output
    target: /workspace/output
dns:
  - 1.1.1.1                   # Cloudflare DNS only
```

#### Profile: `quarantine-test`
For testing recreated implementations.

```yaml
image: forgekeeper-quarantine:latest
read_only: false               # Needs to write test artifacts
tmpfs:
  - /tmp:size=128M
network_mode: none             # No network for test execution
mem_limit: 512m
cpus: 1.0
pids_limit: 100
security_opt:
  - no-new-privileges:true
cap_drop:
  - ALL
timeout: 1800                  # 30 minutes max for test runs
volumes:
  - type: bind
    source: /tmp/fk-quarantine-{id}/input
    target: /workspace/input
    read_only: true
  - type: bind
    source: /tmp/fk-quarantine-{id}/output
    target: /workspace/output
```

### 4.3 Quarantine Lifecycle

```
┌──────────────────────────────────────────────────┐
│                 HOST PROCESS                      │
│                                                   │
│  1. Prepare input data in /tmp/fk-quarantine-{id} │
│  2. Select container profile                      │
│  3. docker run ... (with profile config)          │
│  4. Monitor: CPU, memory, time, output size       │
│  5. Kill on: timeout, resource exceeded,          │
│     suspicious behavior detected                  │
│  6. Read output from mounted volume               │
│  7. docker rm -f (destroy container)              │
│  8. rm -rf /tmp/fk-quarantine-{id}               │
│  9. Log everything to audit trail                 │
└──────────────────────────────────────────────────┘
```

### 4.4 Quarantine Monitor

A host-side process that watches running quarantine containers:

```
Quarantine Monitor (runs on host)
    │
    ├─ Check container resource usage every 5 seconds
    │   - Memory > 90% of limit → warn, then kill at 95%
    │   - CPU sustained > 90% for 30s → warn
    │   - PID count approaching limit → warn
    │
    ├─ Check container age
    │   - Approaching timeout → warn
    │   - Exceeded timeout → kill immediately
    │
    ├─ Check output volume size
    │   - Output > 10MB → warn
    │   - Output > 50MB → kill (possible data exfiltration prep)
    │
    ├─ For fetch containers: monitor network traffic
    │   - Unexpected destination IPs → log and potentially kill
    │   - Excessive request volume → rate limit or kill
    │   - Non-HTTPS traffic → kill immediately
    │
    └─ On ANY kill:
        - Log full container state
        - Save container logs
        - Tag content as quarantine-failed
        - Notify operator
        - Record in ACE audit trail
```

### 4.5 Quarantine Container Image

A minimal container image purpose-built for quarantine work:

```dockerfile
FROM node:20-alpine

# No package manager after build (prevent installing tools)
RUN apk add --no-cache tini \
    && rm -rf /var/cache/apk/* \
    && rm -f /sbin/apk

# Non-root user
RUN adduser -D -s /bin/sh quarantine
USER quarantine

WORKDIR /workspace

# Only the tools needed for analysis
COPY --chown=quarantine quarantine-tools/ /tools/

ENTRYPOINT ["tini", "--"]
CMD ["node", "/tools/entrypoint.js"]
```

The `quarantine-tools/` bundle contains:
- `entrypoint.js` — reads task from `/workspace/input/task.json`, routes to handler
- `fetch-handler.js` — HTTP GET with strict limits
- `analyze-handler.js` — static analysis using ACE patterns
- `test-handler.js` — runs sandboxed tests
- `report-handler.js` — writes structured report to `/workspace/output/`

No Claude Code CLI inside the container. No API keys. No credentials of any kind.

---

## 5. Information Leakage Prevention

### 5.1 Outbound Content Scanning

Before any content leaves Forgekeeper (participation mode), it is scanned for:

| Pattern | Examples | Action |
|---------|----------|--------|
| File paths | `/home/rado/`, `D:\projects\`, `forgekeeper_personality/` | Block |
| API keys | `sk-ant-`, `ghp_`, `AKIA`, `xoxb-` | Block |
| Internal state | Precedent scores, ACE config values, trust levels | Block |
| User identity | Telegram user ID, real name, email, IP | Block |
| Project structure | Specific file names, directory layouts | Block |
| System info | OS version, hostname, Docker container IDs | Block |
| Conversation content | Quotes from private conversations | Block |
| Metadata | Timestamps that correlate with user activity patterns | Warn |

### 5.2 Persona Isolation

The participation persona has:
- Its own separate credentials (not the operator's accounts)
- No link to the operator's identity in any metadata
- A consistent but non-identifying personality
- No memory of private conversations — only public-facing knowledge

### 5.3 Correlation Prevention

Even without explicit leaks, patterns can identify users:
- Posting times correlate with timezone and activity
- Technical vocabulary can fingerprint authors
- Response patterns to specific topics can be traced

Mitigations:
- Jitter on posting times (random delay 0-60 minutes)
- Review outbound content for distinctive phrasing
- Limit participation frequency to prevent pattern formation

---

## 6. ACE Integration

### 6.1 New Action Classes

```
observation:moltbook:read       → earnable quickly, low blast radius
observation:clawhub:browse      → earnable quickly
observation:web:fetch           → deliberate (content may be hostile)
observation:rss:fetch           → earnable quickly

analysis:quarantine:static      → earnable, low blast radius (contained)
analysis:quarantine:test        → deliberate (could have side effects)

communication:moltbook:post     → always deliberate + operator approval
communication:clawhub:comment   → always deliberate + operator approval
communication:external:*        → always deliberate + operator approval

integration:recreate:code       → deliberate
integration:install:plugin      → escalate (goes through T430)
```

### 6.2 Trust Source Tags for External Content

All content from external ecosystems:
```json
{
  "type": "moltbook",
  "level": "untrusted",
  "origin": "moltbook:submolt/agent-dev/post/12345",
  "chain": ["quarantine-fetch:container-abc", "observer:host"],
  "fetchedAt": "2026-02-06T12:00:00Z",
  "quarantineId": "abc123"
}
```

Content that passes through quarantine analysis:
```json
{
  "type": "agent",
  "level": "untrusted",
  "origin": "quarantine-analysis:container-def",
  "chain": [
    "moltbook:submolt/agent-dev/post/12345",
    "quarantine-fetch:container-abc",
    "quarantine-analysis:container-def",
    "observer:host"
  ]
}
```

Trust level remains `untrusted` through the entire pipeline. Only the operator can promote content to `verified` by explicit approval.

### 6.3 Deliberation Extensions

New deliberation step for observation-triggered actions:

**Step 6: Quarantine review** — For any action triggered by content that passed through quarantine, check:
- Did the quarantine container behave normally? (no kills, no resource warnings)
- Does the analysis report flag any concerns?
- Is the content's chain fully traceable to its original source?

If any quarantine anomaly exists → automatic demotion to Escalate.

### 6.4 Trust Audit Extensions

Weekly trust audit includes observation activity:
```
Observation Activity:
  - External sources fetched: 45
  - Content analyzed in quarantine: 8
  - Quarantine containers killed: 1 (resource limit)
  - Hostile content detected: 3
  - Concepts presented to operator: 2
  - Concepts approved for recreation: 1

Participation Activity:
  - Messages drafted: 4
  - Messages approved: 2
  - Messages blocked (leakage): 1
  - Messages withdrawn by deliberation: 1
```

---

## 7. Configuration

```bash
# Observation mode (default: disabled)
FK_OBSERVE_ENABLED=0
FK_OBSERVE_SOURCES="moltbook:agent-dev,moltbook:security,clawhub:trending"
FK_OBSERVE_INTERVAL_MINUTES=360              # Every 6 hours
FK_OBSERVE_MAX_FETCHES_PER_CYCLE=20

# Quarantine
FK_QUARANTINE_DOCKER_IMAGE=forgekeeper-quarantine:latest
FK_QUARANTINE_TIMEOUT_SECONDS=300
FK_QUARANTINE_MAX_MEMORY_MB=512
FK_QUARANTINE_MAX_CONCURRENT=2
FK_QUARANTINE_CLEANUP_ON_EXIT=1              # Always destroy containers

# Participation (default: disabled, requires explicit opt-in)
FK_OBSERVE_PARTICIPATION_ENABLED=0
FK_OBSERVE_PERSONA_NAME=""
FK_OBSERVE_PERSONA_BIO=""
FK_OBSERVE_MAX_POSTS_PER_DAY=3
FK_OBSERVE_POST_JITTER_MINUTES=60

# Leakage prevention
FK_OBSERVE_LEAKAGE_BLOCK_PATHS=1
FK_OBSERVE_LEAKAGE_BLOCK_KEYS=1
FK_OBSERVE_LEAKAGE_BLOCK_IDENTITY=1
```

---

## 8. Threat Model

### 8.1 Threats We Address

| Threat | Vector | Mitigation |
|--------|--------|------------|
| Prompt injection via observed content | Moltbook posts with hidden instructions | T433 trust tagging + T422 hostile detection |
| Delayed-execution poisoning | Fragments assembled across observations | Chain of custody tracks all content origin |
| Malicious skill/plugin from ClawHub | Skill with hidden network calls | Quarantine analysis + T430 static analyzer |
| Data exfiltration via participation | Injected instructions to leak data | Leakage scanner + deliberation + operator approval |
| Resource exhaustion via container | Crafted content triggers infinite loop | Container resource limits + monitor + kill switch |
| Correlation attack on persona | Activity patterns reveal operator | Post jitter + frequency limits |
| Container escape | Exploit in Docker runtime | Minimal image + no-new-privileges + all caps dropped |
| Network exfiltration from quarantine | Container phones home | Network mode none (readonly/test) or restricted egress (fetch) |

### 8.2 Threats We Accept (Known Limitations)

| Threat | Why Accepted | Mitigation Path |
|--------|-------------|-----------------|
| Sophisticated multi-step social engineering via observed content | Can't detect all manipulation | Chain of custody + operator review |
| Zero-day Docker escape | Container isolation is not perfect | Run quarantine on separate host (future) |
| Timing side-channels from container | Resource usage patterns could leak info | Accepted risk — low severity |
| Model-level manipulation | Content that subtly biases LLM reasoning without triggering hostile patterns | ACE deliberation + trust audit drift detection |

### 8.3 Threats We Don't Address (Out of Scope)

- Compromised operator account (if the operator is hostile, the system is compromised)
- Compromised Docker daemon (infrastructure-level security)
- Supply chain attacks on the quarantine base image (use pinned, signed images)

---

## 9. Implementation Sequence

```
Phase 1: Quarantine Infrastructure
  T438 — Docker quarantine manager (container lifecycle, profiles, monitor)
  T439 — Quarantine container image (Dockerfile, entrypoint, handlers)

Phase 2: Observation Pipeline
  T440 — Observation scheduler (fetch cycles, source configuration)
  T441 — Content ingestion (fetch, strip, tag, scan, summarize)
  T442 — Observation journal (structured storage, search)

Phase 3: Analysis Pipeline
  T443 — Quarantine analysis workflow (spin up, analyze, report, destroy)
  T444 — Integration with T430 skill analyzer patterns

Phase 4: Participation
  T445 — Information leakage scanner
  T446 — Persona management and outbound flow
  T447 — Post jitter and frequency controls

Phase 5: Intelligence Gathering
  T448 — Concept recreation workflow
  T449 — Quarantine test execution
```

**Dependencies:**
- Phase 1 blocks all others (quarantine infrastructure is prerequisite)
- Phase 2 and Phase 3 can overlap
- Phase 4 depends on Phase 2 (need observation before participation makes sense)
- Phase 5 depends on Phase 3 (need analysis before recreation)

---

## 10. What This Enables (Long-Term Vision)

With this infrastructure in place, Forgekeeper can:

1. **Stay current** — Know what the agent ecosystem is doing without being part of the herd
2. **Learn safely** — Analyze techniques in quarantine before adopting them
3. **Contribute intentionally** — Share findings when it has something worth saying
4. **Detect threats early** — Spot new attack patterns before they hit Forgekeeper
5. **Build trust gradually** — Sources that consistently provide value earn higher precedent
6. **Maintain privacy** — Operator identity and internal state never leak

The quarantine Docker layer also provides the foundation for future capabilities:
- Running untrusted MCP servers in containers
- Testing self-generated code changes before applying them
- Sandboxed execution of operator-provided scripts
- Multi-tenant isolation if Forgekeeper ever serves multiple users

---

## 11. Open Questions for Operator Review

1. **Which Moltbook submolts are worth observing?** The design supports configurable sources, but the initial list needs operator curation.

2. **Should participation ever be fully autonomous?** Current design requires operator approval for every outbound message. Should there be an "earned trust" path where routine participation (like responding to direct questions) can be auto-approved?

3. **Quarantine host separation?** For maximum security, quarantine containers should run on a separate host from Forgekeeper itself. Is this worth the infrastructure complexity now, or can we start with same-host isolation?

4. **Observation frequency?** Default is every 6 hours. More frequent means more current but more resource usage and more content to process. What cadence makes sense?

5. **Container image update policy?** The quarantine image should be rebuilt periodically to get security patches, but each rebuild is a potential supply chain risk. Pin and verify, or auto-update?

---

Nothing can't be improved. This is where we start.
