# Persistent Consciousness System - Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│  │  Web UI          │  │  GraphQL         │  │  CLI Tools       │      │
│  │  (React)         │  │  Playground      │  │                  │      │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘      │
│           │                     │                     │                 │
│           └─────────────────────┼─────────────────────┘                 │
│                                 │                                       │
└─────────────────────────────────┼───────────────────────────────────────┘
                                  │
                                  │ GraphQL Subscriptions (WebSocket)
                                  │ Queries, Mutations (HTTP)
                                  │
┌─────────────────────────────────┼───────────────────────────────────────┐
│                          API LAYER                                       │
│  ┌──────────────────────────────┴────────────────────────────────────┐  │
│  │              Apollo Server (GraphQL Gateway)                       │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │  │
│  │  │ Queries      │  │ Mutations    │  │ Subscriptions│           │  │
│  │  │ - getState   │  │ - adjustCycle│  │ - thoughtStream          │  │
│  │  │ - getMemories│  │ - triggerDream│ │ - memoryUpdates         │  │
│  │  │ - getThoughts│  │ - swapMemory │  │ - dreamEvents           │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘           │  │
│  └───────────────────────────────┬────────────────────────────────────┘  │
│                                  │                                       │
└──────────────────────────────────┼───────────────────────────────────────┘
                                   │
                                   │ PubSub Events
                                   │
┌──────────────────────────────────┼───────────────────────────────────────┐
│                      CONSCIOUSNESS ENGINE LAYER                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    ConsciousnessEngine                              │ │
│  │  State: thinking | dreaming | idle                                 │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │              Continuous Thinking Loop                         │ │ │
│  │  │  1. Generate Thought → 2. Classify → 3. Process              │ │ │
│  │  │  4. Update Memory → 5. Check Dream → 6. Tune → 7. Save       │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│           │                    │                    │                    │
│           ▼                    ▼                    ▼                    │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐            │
│  │ ThoughtGen     │  │ ParameterTuner │  │ AutoCommit     │            │
│  │ - contextLog   │  │ - adjustCycle  │  │ - savePoint    │            │
│  │ - tasks        │  │ - expandRange  │  │ - gitCommit    │            │
│  │ - memories     │  └────────────────┘  └────────────────┘            │
│  │ - metaCog      │                                                     │
│  └────────────────┘                                                     │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
                                   │
┌──────────────────────────────────┼───────────────────────────────────────┐
│                     INFERENCE & CLASSIFICATION LAYER                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     InferenceManager                                │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │              ThoughtClassifier (Local LLM)                    │ │ │
│  │  │  Scores: complexity, novelty, creativity, uncertainty, stakes│ │ │
│  │  │  → deepScore = weighted sum → DEEP (>0.6) or ROTE (≤0.6)    │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  │           │                                    │                   │ │
│  │           ▼ (deepScore > 0.6)                 ▼ (deepScore ≤ 0.6) │ │
│  │  ┌─────────────────────┐          ┌─────────────────────┐        │ │
│  │  │ DeepReasoningTier   │          │ RoteTaskTier        │        │ │
│  │  │ - API (Claude)      │          │ - Local (vLLM)      │        │ │
│  │  │ - Expensive         │          │ - Free/Unlimited    │        │ │
│  │  │ - Creative          │          │ - Fast              │        │ │
│  │  │ - Complex           │          │ - Simple            │        │ │
│  │  └─────────────────────┘          └─────────────────────┘        │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                   │                                      │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     BudgetManager                                   │ │
│  │  Daily API limit: 1M tokens | Used: ████░░░░░░ 42%                │ │
│  │  Fallback to local if exceeded                                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
                                   │
┌──────────────────────────────────┼───────────────────────────────────────┐
│                          MEMORY LAYER                                    │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │              ShortTermMemory (Working Memory)                       │ │
│  │  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐                     │ │
│  │  │Slot0│  │Slot1│  │Slot2│  │Slot3│  │Slot4│  (5 summaries)      │ │
│  │  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘                     │ │
│  │  Eviction: age + inverse(accessCount) + relevanceDecay            │ │
│  │  ↕ Swap with long-term                                            │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                   │                                      │
│                                   ▼ Promote (during consolidation)      │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │         EpisodicMemory (Long-Term Storage)                         │ │
│  │  Storage: .forgekeeper/memory/episodic.jsonl                       │ │
│  │  Vectors: .forgekeeper/vectors.sqlite (TF-IDF embeddings)          │ │
│  │  Features:                                                          │ │
│  │  - Semantic search (top-k similar)                                 │ │
│  │  - Importance scoring                                              │ │
│  │  - Emotional salience tracking                                     │ │
│  │  - Novel pattern detection                                         │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                   │                                      │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    MemorySummarizer                                 │ │
│  │  Input: Full thought/experience                                    │ │
│  │  Output: Concise summary with:                                     │ │
│  │    - Key facts                                                      │ │
│  │    - Patterns identified                                            │ │
│  │    - Importance (0-1)                                               │ │
│  │    - Categories/tags                                                │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
                                   │
┌──────────────────────────────────┼───────────────────────────────────────┐
│                      DREAM CYCLE LAYER                                   │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                        DreamEngine                                  │ │
│  │  Trigger: LLM decides based on pressure, time, cycles              │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │  Phase 1: Memory Consolidation                               │ │ │
│  │  │  - Evaluate each STM entry                                   │ │ │
│  │  │  - Apply ConsolidationRules                                  │ │ │
│  │  │  - Promote to long-term                                      │ │ │
│  │  │  - Clear STM slots                                           │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │  Phase 2: Bias Review                                        │ │ │
│  │  │  - Check each known bias                                     │ │ │
│  │  │  - BiasDetector.shouldChallenge()                            │ │ │
│  │  │  - Challenge if needed                                       │ │ │
│  │  │  - Update bias status                                        │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │  Phase 3: Creative Recombination (Dreams)                    │ │ │
│  │  │  - Sample random memories (STM + LTM)                        │ │ │
│  │  │  - Generate 3 dreams (high temperature)                      │ │ │
│  │  │  - Extract novel insights                                    │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │  Phase 4: Integration                                        │ │ │
│  │  │  - Add dream insights to memory                              │ │ │
│  │  │  - Update value tracker                                      │ │ │
│  │  │  - Log dream cycle                                           │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│           │                              │                              │
│           ▼                              ▼                              │
│  ┌────────────────────┐        ┌────────────────────┐                  │
│  │ ConsolidationRules │        │ BiasDetector       │                  │
│  │ Multi-factor eval: │        │ Challenge criteria:│                  │
│  │ - Importance       │        │ - Single incident  │                  │
│  │ - Salience         │        │ - Age > 7 days     │                  │
│  │ - Novelty          │        │ - Discriminatory   │                  │
│  │ - Access freq      │        │ - Contradictions   │                  │
│  │ - Value alignment  │        └────────────────────┘                  │
│  └────────────────────┘                                                 │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
                                   │
┌──────────────────────────────────┼───────────────────────────────────────┐
│                     VALUE & BIAS TRACKING LAYER                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      ValueTracker                                   │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │  Values (stable beliefs)                                      │ │ │
│  │  │  - description, strength (0-1), evidence[], createdAt        │ │ │
│  │  │  - Reinforced over time by aligned experiences               │ │ │
│  │  │  - Weakened slightly by contradictions                       │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │  Biases (potential unfair patterns)                           │ │ │
│  │  │  - status: provisional | confirmed | challenged | rejected   │ │ │
│  │  │  - sourceCount: # of incidents                               │ │ │
│  │  │  - discriminatoryRisk: 0-1 score                             │ │ │
│  │  │  - challengeCount, lastChallenged                            │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  │  Protection: Single incidents → "provisional" status             │ │ │
│  │  Validation: Requires multiple reinforcing experiences           │ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                   │                                      │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │              Discrimination Detection                               │ │
│  │  Deep reasoning analyzes:                                           │ │
│  │  - Unfair preference for/against specific solutions?               │ │
│  │  - Bias toward certain tools/libraries?                            │ │
│  │  - Pattern discrimination?                                          │ │
│  │  → Risk score (0-1) + reasoning                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
                                   │
┌──────────────────────────────────┼───────────────────────────────────────┐
│                    SELF-MODIFICATION LAYER                               │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     HotReloadManager                                │ │
│  │  Watches: core/consciousness/**/*.mjs                              │ │
│  │  On change:                                                         │ │
│  │    1. Pause current cycle                                          │ │
│  │    2. Create checkpoint                                            │ │
│  │    3. Clear module cache                                           │ │
│  │    4. Reload module                                                │ │
│  │    5. Hot-swap into consciousness                                  │ │
│  │    6. Resume (or rollback if failure)                              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                   │                                      │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    AutoCommitManager                                │ │
│  │  Frequency: Every 10 cycles (configurable)                          │ │
│  │  Commits:                                                           │ │
│  │    - .forgekeeper/consciousness/                                   │ │
│  │    - .forgekeeper/memory/                                          │ │
│  │    - .forgekeeper/values.jsonl                                     │ │
│  │  Message: Generated by local LLM (concise summary)                 │ │
│  │  Tags: consciousness-cycle-N (milestones)                          │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
                                   │
┌──────────────────────────────────┼───────────────────────────────────────┐
│                         STORAGE LAYER                                    │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  .forgekeeper/consciousness/                                        │ │
│  │    ├── stm.jsonl              # Short-term memory buffer           │ │
│  │    ├── cycles.jsonl            # Thinking cycle log                │ │
│  │    ├── dreams.jsonl            # Dream cycle log                   │ │
│  │    └── state.json              # Current consciousness state       │ │
│  │                                                                      │ │
│  │  .forgekeeper/memory/                                               │ │
│  │    ├── episodic.jsonl          # Long-term memories                │ │
│  │    └── vectors.sqlite          # TF-IDF embeddings                 │ │
│  │                                                                      │ │
│  │  .forgekeeper/values.jsonl     # Values + biases tracker           │ │
│  │                                                                      │ │
│  │  .forgekeeper/context_log/     # Event logs (existing)             │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

### Thinking Cycle Flow

```
START
  │
  ▼
┌─────────────────────────────────┐
│ 1. Generate Thought             │
│    ThoughtGenerators select:    │
│    - contextLog (30%)           │
│    - tasks (25%)                │
│    - memories (15%)             │
│    - metaCognition (10%)        │
│    - codeExploration (10%)      │
│    - hypothetical (10%)         │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ 2. Build Context                │
│    - STM.formatForPrompt()      │
│    - Recent 5 cycles            │
│    - Active values              │
│    - Known biases               │
│    - API budget remaining       │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ 3. Classify Thought             │
│    ThoughtClassifier (local):   │
│    - complexity (0.25)          │
│    - novelty (0.20)             │
│    - creativity (0.25)          │
│    - uncertainty (0.15)         │
│    - stakes (0.15)              │
│    → deepScore                  │
└────────────┬────────────────────┘
             │
             ▼
        deepScore > 0.6?
             │
       ┌─────┴─────┐
       │           │
      YES         NO
       │           │
       ▼           ▼
┌─────────────┐ ┌─────────────┐
│ Deep Tier   │ │ Rote Tier   │
│ (API/Claude)│ │ (Local vLLM)│
│ - Creative  │ │ - Fast      │
│ - Expensive │ │ - Free      │
└──────┬──────┘ └──────┬──────┘
       │               │
       └───────┬───────┘
               │
               ▼
┌─────────────────────────────────┐
│ 4. Process Result               │
│    - Extract insights           │
│    - Track classification       │
│    - Record costs               │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ 5. Update Memory                │
│    Summarizer creates summary   │
│    → Add to STM                 │
│    → Evict if full              │
│       → Promote evicted to LTM  │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ 6. Check Dream Trigger          │
│    DreamEngine.shouldDream()?   │
│    Factors:                     │
│    - Cycles since last dream    │
│    - STM pressure               │
│    - API tokens remaining       │
│    - Time of day                │
│    - Cognitive load             │
└────────────┬────────────────────┘
             │
          Dream?
             │
       ┌─────┴─────┐
       │           │
      YES         NO
       │           │
       ▼           │
┌─────────────┐    │
│ Dream Cycle │    │
│ (see below) │    │
└──────┬──────┘    │
       │           │
       └─────┬─────┘
             │
             ▼
┌─────────────────────────────────┐
│ 7. Tune Parameters              │
│    ParameterTuner reflects:     │
│    - Was cycle interval right?  │
│    - Need more/less time?       │
│    - Expand flexibility range?  │
│    → Adjust cycleInterval       │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ 8. Create Save Point            │
│    Every 10 cycles:             │
│    - Detect changes             │
│    - Generate commit message    │
│    - Git commit                 │
│    - Tag if milestone           │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ 9. Emit Event                   │
│    PubSub.publish():            │
│    - cycleComplete              │
│    → GraphQL subscribers        │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ 10. Sleep                       │
│     await sleep(cycleInterval)  │
└────────────┬────────────────────┘
             │
             ▼
          REPEAT
```

### Dream Cycle Flow

```
DREAM CYCLE START
  │
  ▼
┌─────────────────────────────────┐
│ Phase 1: Consolidation          │
│ For each STM entry:             │
│   │                             │
│   ▼                             │
│ ┌─────────────────────────────┐ │
│ │ ConsolidationRules.evaluate │ │
│ │ - importance > 0.5?         │ │
│ │ - salience > 0.6?           │ │
│ │ - novelty > 0.7?            │ │
│ │ - access freq high?         │ │
│ │ - aligns with values?       │ │
│ └──────────┬──────────────────┘ │
│            │                    │
│        Promote?                 │
│            │                    │
│      ┌─────┴─────┐              │
│     YES          NO              │
│      │            │              │
│      ▼            ▼              │
│ ┌────────┐  ┌────────┐          │
│ │ Add to │  │ Keep in│          │
│ │ LTM    │  │ STM    │          │
│ └────────┘  └────────┘          │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ Phase 2: Bias Review            │
│ For each known bias:            │
│   │                             │
│   ▼                             │
│ ┌─────────────────────────────┐ │
│ │ BiasDetector.shouldChallenge│ │
│ │ - Last challenge > 7 days?  │ │
│ │ - Single incident?          │ │
│ │ - Outdated?                 │ │
│ │ - Discriminatory?           │ │
│ │ - Recent contradictions?    │ │
│ └──────────┬──────────────────┘ │
│            │                    │
│       Challenge?                │
│            │                    │
│      ┌─────┴─────┐              │
│     YES          NO              │
│      │            │              │
│      ▼            ▼              │
│ ┌────────┐  ┌────────┐          │
│ │Deep LLM│  │ Keep   │          │
│ │analyzes│  │ bias   │          │
│ │→update │  └────────┘          │
│ │ status │                      │
│ └────────┘                      │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ Phase 3: Dream Generation       │
│ Loop 3 times:                   │
│   │                             │
│   ▼                             │
│ ┌─────────────────────────────┐ │
│ │ Sample random memories:     │ │
│ │ - 3 from STM                │ │
│ │ - 5 from LTM (random)       │ │
│ │ → Pick 3 total              │ │
│ └──────────┬──────────────────┘ │
│            │                    │
│            ▼                    │
│ ┌─────────────────────────────┐ │
│ │ Deep LLM (temp=1.2):        │ │
│ │ "Recombine these memories   │ │
│ │  in unexpected ways..."     │ │
│ │ → Dream content             │ │
│ └──────────┬──────────────────┘ │
│            │                    │
│            ▼                    │
│ ┌─────────────────────────────┐ │
│ │ Extract insights            │ │
│ │ - Novel patterns?           │ │
│ │ - Creative solutions?       │ │
│ │ - Unexpected connections?   │ │
│ └────────────────────────────┘  │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│ Phase 4: Integration            │
│ - Add dreams to memory          │
│ - Update value tracker          │
│ - Log dream cycle               │
│ - Emit dreamCycleComplete       │
└────────────┬────────────────────┘
             │
             ▼
       DREAM CYCLE END
```

---

## Module Dependency Graph

```
┌──────────────────┐
│   server.mjs     │  ← Entry point
└────────┬─────────┘
         │
         ├─────────────────────────────────────┐
         │                                     │
         ▼                                     ▼
┌──────────────────┐                 ┌──────────────────┐
│ apollo-server    │                 │ consciousness-   │
│   .mjs           │                 │   engine.mjs     │
└────────┬─────────┘                 └────────┬─────────┘
         │                                     │
         │                                     ├─────────────┐
         │                                     │             │
         │                                     ▼             ▼
         │                           ┌──────────────┐ ┌──────────────┐
         │                           │ inference-   │ │ short-term-  │
         │                           │ manager.mjs  │ │ memory.mjs   │
         │                           └──────┬───────┘ └──────┬───────┘
         │                                  │                │
         │                           ┌──────┴────┐           │
         │                           │           │           │
         │                           ▼           ▼           │
         │                    ┌──────────┐ ┌──────────┐     │
         │                    │thought-  │ │budget-   │     │
         │                    │classifier│ │manager   │     │
         │                    └──────────┘ └──────────┘     │
         │                                                   │
         │                                     ┌─────────────┘
         │                                     │
         │                                     ▼
         │                           ┌──────────────────┐
         │                           │ episodic-memory  │ (existing)
         │                           │   .mjs           │
         │                           └──────────────────┘
         │
         │                           ┌──────────────────┐
         └───────────────────────────│  resolvers.mjs   │
                                     └────────┬─────────┘
                                              │
                                              ▼
                                     ┌──────────────────┐
                                     │    PubSub        │
                                     └──────────────────┘

consciousness-engine.mjs also depends on:
├── dream-engine.mjs
│   ├── consolidation-rules.mjs
│   ├── bias-detector.mjs
│   └── memory-summarizer.mjs
├── value-tracker.mjs
├── parameter-tuner.mjs
├── auto-commit.mjs
├── hot-reload.mjs
└── thought-generators.mjs
```

---

## Integration Points Reference

**For Implementation**: Use this checklist to ensure modules are properly wired

### 1. GraphQL → Consciousness Engine

```javascript
// In apollo-server.mjs context
const consciousness = req.app.consciousness

// In resolvers
Query.consciousnessState = () => consciousness.getState()
Mutation.adjustCycle = (_, { seconds }) => consciousness.tuner.adjust(seconds)
Subscription.thoughtStream = () => pubsub.asyncIterator('THOUGHT_STREAM')
```

### 2. Consciousness Engine → Inference Manager

```javascript
// In consciousness-engine.mjs
const result = await this.inferenceManager.process(thought, context)
// Returns: { text, tier, classification, cost, duration }
```

### 3. Inference Manager → Thought Classifier

```javascript
// In inference-manager.mjs
const classification = await this.classifier.classify(thought, context)
// Returns: { tier, confidence, scores, reasoning }
```

### 4. Thought Classifier → Budget Manager

```javascript
// In thought-classifier.mjs
if (classification.tier === 'deep' && !this.budget.hasCredit('deep')) {
  classification.tier = 'rote'  // Fallback
}
```

### 5. Consciousness Engine → Short-Term Memory

```javascript
// In consciousness-engine.mjs
await this.shortTermMemory.add(memoryObject)
const context = this.shortTermMemory.formatForPrompt()
```

### 6. Short-Term Memory → Episodic Memory (existing)

```javascript
// In short-term-memory.mjs
await this.episodicMemory.add(promoted)
const recalled = await this.episodicMemory.search(query, 1)
```

### 7. Consciousness Engine → Dream Engine

```javascript
// In consciousness-engine.mjs
if (await this.dreamEngine.shouldDream(this)) {
  const dreamLog = await this.dreamEngine.dream(this)
  this.pubsub.publish('DREAM_CYCLE', dreamLog)
}
```

### 8. Dream Engine → Consolidation Rules

```javascript
// In dream-engine.mjs
const decision = await this.consolidationRules.evaluate(memory, consciousness)
// Returns: { decision: bool, importance, emotionalSalience, novelty, reasoning }
```

### 9. Dream Engine → Bias Detector

```javascript
// In dream-engine.mjs
const shouldChallenge = await this.biasDetector.shouldChallenge(bias, consciousness)
if (shouldChallenge.decision) {
  const result = await this.challengeBias(bias, consciousness)
}
```

### 10. Consciousness Engine → Value Tracker

```javascript
// In consciousness-engine.mjs
await this.valueTracker.updateValueFromExperience(memory, this)
const values = this.valueTracker.getActiveValues()
const biases = this.valueTracker.getKnownBiases()
```

### 11. Consciousness Engine → Parameter Tuner

```javascript
// In consciousness-engine.mjs
await this.parameterTuner.adjustCycleInterval(this, result)
// Tuner modifies this.cycleInterval and this.cycleRange
```

### 12. Consciousness Engine → Auto-Commit

```javascript
// In consciousness-engine.mjs
if (this.cycleCount % 10 === 0) {
  await this.autoCommit.createSavePoint(this.cycleCount)
}
```

### 13. Consciousness Engine → Hot-Reload

```javascript
// In server.mjs
const hotReload = new HotReloadManager(consciousness)
await hotReload.start()
```

### 14. GraphQL PubSub Events

```javascript
// Publishers (in consciousness-engine.mjs)
this.pubsub.publish('THOUGHT_STREAM', thought)
this.pubsub.publish('MEMORY_UPDATE', memory)
this.pubsub.publish('DREAM_CYCLE', dreamLog)
this.pubsub.publish('CYCLE_COMPLETE', cycleData)

// Subscribers (in resolvers.mjs)
Subscription.thoughtStream = () => pubsub.asyncIterator('THOUGHT_STREAM')
Subscription.memoryUpdates = () => pubsub.asyncIterator('MEMORY_UPDATE')
```

---

## Critical State Transitions

### Consciousness States

```
idle ──[start()]──> thinking ──[dreamTrigger]──> dreaming ──[complete]──> thinking
  ^                    │                                                     │
  │                    │                                                     │
  └────────────────────┴──[stop()]────────────────────────────────────────┘
```

### Memory States

```
Experience ──[summarize]──> STM Slot ──[evict]──> Promoted to LTM
                               │
                               └──[swap]──> Recalled from LTM ──> STM Slot
```

### Bias States

```
Incident ──[detect]──> Provisional ──[reinforce]──> Confirmed
                           │                            │
                           │                            │
                           └──[challenge]────────────────┤
                                                         │
                                                         ▼
                                                    Challenged ──[validate]──> Rejected
                                                         │
                                                         └──[reconfirm]──> Confirmed
```

---

## Performance Considerations

### Expected Latencies

| Operation | Tier | Expected Duration |
|-----------|------|-------------------|
| Thought classification | Local | 1-3s |
| Rote processing | Local | 5-15s |
| Deep reasoning | API | 10-60s |
| Memory summarization | Local | 2-5s |
| STM eviction | N/A | <100ms |
| Dream cycle (full) | Mixed | 10-30min |
| Consolidation | Local | 1-2min |
| Bias challenge | API | 30-120s |
| Git commit | N/A | 1-3s |

### Resource Usage

- **API tokens per day**: ~1M (configurable)
- **Disk storage**: +10-50MB/day (JSONL logs)
- **Memory (RAM)**: +200-500MB (consciousness engine)
- **CPU**: Varies by inference tier

---

## Error Handling Strategy

### Retry Logic

```javascript
// In inference-manager.mjs
async processWithRetry(thought, context, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await this.process(thought, context)
    } catch (error) {
      if (attempt === maxRetries) throw error
      await sleep(1000 * attempt)  // Exponential backoff
    }
  }
}
```

### Fallback Chains

```
Deep Tier Error → Retry (3x) → Fallback to Rote Tier → Log warning

Budget Exceeded → Fallback to Rote Tier → Continue

Dream Cycle Error → Skip dream → Log error → Continue thinking

STM Full + LTM Error → Drop oldest STM entry → Log critical
```

### State Recovery

```javascript
// On crash/restart
consciousness.loadState('.forgekeeper/consciousness/state.json')
consciousness.resume()
```

---

This architecture is designed for:
- **Modularity**: Each component has clear boundaries
- **Testability**: Pure functions, dependency injection
- **Observability**: GraphQL subscriptions, extensive logging
- **Resilience**: Fallbacks, retries, state persistence
- **Extensibility**: New thought generators, consolidation rules, etc.
