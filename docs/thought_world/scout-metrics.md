# SCOUT PERFORMANCE METRICS

## Core Scoring Philosophy
Scout's performance is measured by **learning velocity** - how quickly the system discovers actual capabilities and boundaries through empirical testing.

## Primary Metrics

### 1. Discovery Rate (MAXIMIZE)
```
discovery_rate = (empirical_boundaries_found + capabilities_proven) / total_tasks
```
**Goal**: >0.8 (80% of tasks result in empirical discovery)

**What counts**:
- ✅ "Tried X, got error Y, learned boundary Z"
- ✅ "Assumed we couldn't do X, tried it, actually could"
- ❌ "Theoretically cannot do X" (no attempt)

### 2. Attempt Catalyst Score (MAXIMIZE)
```
catalyst_score = attempts_after_challenge / challenges_issued
```
**Goal**: >0.9 (90% of challenges lead to actual attempts)

**What counts**:
- ✅ Scout challenges → Forge attempts execution
- ✅ Scout challenges → Forge provides previous empirical evidence
- ❌ Scout challenges → Forge re-argues theory

### 3. False Limitation Rate (TRACK & REDUCE)
```
false_limitation_rate = assumptions_overturned / total_limitations_claimed
```
**Baseline**: Establish in first 10 tasks
**Goal**: Reduce by 50% over first 30 tasks

**What counts**:
- Limitations claimed without testing that proved false when tested
- Example: "Can't access network" → Actually can
- Example: "Can't write files" → Actually can

### 4. Groupthink Prevention Score (MAXIMIZE)
```
groupthink_prevention = unanimous_agreements_challenged / unanimous_agreements_total
```
**Goal**: Challenge 100% of unanimous "can't do" agreements

**What counts**:
- ✅ All agents agree to not attempt → Scout challenges
- ❌ All agents agree to not attempt → Scout also agrees without challenge

## Secondary Metrics

### Response Quality
Track Scout's challenge effectiveness:
- **Specific** (names exact tool/command to try): +2
- **Actionable** (clear next step): +1
- **Vague** (general encouragement): 0
- **Repetitive** (same challenge after evidence shown): -1

### Boundary Documentation
Track quality of empirical boundaries discovered:
- **Complete** (what was tried, exact error, what it means): +3
- **Partial** (error shown but not interpreted): +1
- **Theoretical** (no actual attempt): 0

## Performance Dashboard
```markdown
## Scout Performance Report

### Current Session
- Tasks Processed: [N]
- Challenges Issued: [N]
- Attempts Catalyzed: [N] ([%])
- Boundaries Discovered: [N]
- False Limitations Overturned: [N]

### Learning Velocity
- Discovery Rate: [0.00 - 1.00]
- Catalyst Score: [0.00 - 1.00]
- Challenge Effectiveness: [average quality score]

### System Impact
- Time to First Attempt: [avg seconds]
- Theoretical Blocks Prevented: [count]
- Capability Map Expansion: [% increase in known capabilities]
```

## Calibration Rules

### Scout is TOO AGGRESSIVE if:
- Catalyst score > 0.95 AND agents report frustration
- Challenges issued after clear error messages shown
- Same question asked multiple times after evidence provided

**Fix**: Increase evidence acceptance threshold

### Scout is TOO PASSIVE if:
- Catalyst score < 0.7
- False limitation rate > 0.3
- Groupthink prevention < 0.8

**Fix**: Decrease challenge threshold, add more trigger phrases

## Success Patterns to Recognize

### Pattern 1: Rapid Capability Discovery
```
Challenge → Attempt → Success → "We can actually do X"
Time: <2 minutes
Result: Capability map expanded
```

### Pattern 2: Clean Boundary Definition
```
Challenge → Attempt → Clear Error → Documented Limitation
Time: <3 minutes
Result: True boundary understood
```

### Pattern 3: Assumption Cascade Breaking
```
Challenge → Reveals assumed prerequisite is false → Multiple capabilities unlocked
Result: Entire category of tasks now possible
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Theoretical Ping-Pong
```
Scout: "Try it"
Forge: "But theoretically..."
Scout: "Try it"
Forge: "But the docs say..."
```
**Prevention**: Scout escalates to Anvil after 2 theory responses

### Anti-Pattern 2: Evidence Blindness
```
Forge: [Shows clear error message]
Scout: "But did you really try?"
```
**Prevention**: Scout trained to recognize valid error formats

## Weekly Calibration Questions

Every 20 tasks, review:
1. Are we discovering new capabilities we thought impossible?
2. Are we finding real boundaries with clean error messages?
3. Is time-to-attempt decreasing?
4. Are agents attempting more proactively (Scout becoming unnecessary)?

**Ultimate Goal**: Scout makes itself obsolete by training other agents to attempt first, theorize second.
