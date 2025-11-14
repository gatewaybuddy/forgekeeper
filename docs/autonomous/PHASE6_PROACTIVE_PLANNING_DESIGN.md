# Phase 6: Proactive Multi-Alternative Planning - Comprehensive Design

**Date**: 2025-11-03
**Status**: Design Phase
**Priority**: High
**Dependencies**: Phase 1-5 complete
**Estimated Effort**: 7-9 days implementation

---

## Executive Summary

Phase 6 introduces **proactive multi-alternative planning** that enables the agent to:
1. Generate **multiple approaches** (3-5 alternatives) for each task
2. **Estimate effort/cost** for each approach (complexity, time, risk)
3. **Evaluate alignment** with the overall goal
4. **Choose optimally** based on lowest effort + best alignment
5. **Recursively refine** choices through self-questioning

This shifts the agent from **reactive** (generate one plan → execute → recover if fails) to **proactive** (generate multiple plans → evaluate all → choose best → execute with confidence).

**Expected Impact**:
- 40-60% reduction in failed iterations
- 30-50% faster task completion
- Better goal alignment (stays focused)
- More realistic progress estimates

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Component 1: Alternative Generator](#component-1-alternative-generator)
3. [Component 2: Effort Estimator](#component-2-effort-estimator)
4. [Component 3: Plan Alignment Checker](#component-3-plan-alignment-checker)
5. [Component 4: Alternative Evaluator](#component-4-alternative-evaluator)
6. [Integration Architecture](#integration-architecture)
7. [Data Structures](#data-structures)
8. [Algorithms](#algorithms)
9. [Example Workflows](#example-workflows)
10. [Implementation Plan](#implementation-plan)
11. [Testing Strategy](#testing-strategy)
12. [Risks & Mitigations](#risks--mitigations)

---

## Architecture Overview

### High-Level Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                      Autonomous Agent                             │
│                                                                    │
│  Current Iteration: "Clone GitHub repository"                     │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
         ┌────────────────────────────────────────┐
         │  1. ALTERNATIVE GENERATION              │
         │                                         │
         │  Input: High-level action               │
         │  Output: 3-5 alternative approaches     │
         │                                         │
         │  Example:                               │
         │    • Approach A: Use gh CLI             │
         │    • Approach B: Use git clone HTTPS    │
         │    • Approach C: Use curl + tar extract │
         └────────────────────────────────────────┘
                              │
                              ▼
         ┌────────────────────────────────────────┐
         │  2. EFFORT ESTIMATION                   │
         │                                         │
         │  For each approach:                     │
         │    • Complexity: Low/Med/High           │
         │    • Time: Estimated iterations         │
         │    • Risk: Prerequisites, assumptions   │
         │                                         │
         │  Example (Approach A):                  │
         │    • Complexity: LOW (if gh installed)  │
         │    • Time: 1-2 iterations              │
         │    • Risk: gh might not be installed    │
         └────────────────────────────────────────┘
                              │
                              ▼
         ┌────────────────────────────────────────┐
         │  3. PLAN ALIGNMENT CHECK                │
         │                                         │
         │  Overall goal: "Deploy to production"   │
         │  Current action: "Clone repository"     │
         │                                         │
         │  Alignment score: 0.95                  │
         │  Reasoning: "Cloning is essential for   │
         │             deployment preparation"     │
         └────────────────────────────────────────┘
                              │
                              ▼
         ┌────────────────────────────────────────┐
         │  4. ALTERNATIVE EVALUATION              │
         │                                         │
         │  Rank by:                               │
         │    • Effort (lower is better)           │
         │    • Risk (lower is better)             │
         │    • Alignment (higher is better)       │
         │                                         │
         │  Optimal: Approach B (git clone HTTPS)  │
         │  Reason: Lowest effort, git installed,  │
         │          high alignment                 │
         └────────────────────────────────────────┘
                              │
                              ▼
                  ┌──────────────────┐
                  │  5. EXECUTE       │
                  │  Chosen Approach  │
                  └──────────────────┘
```

### Design Principles

1. **Proactive over Reactive**: Generate alternatives BEFORE execution, not after failure
2. **Multi-Criteria Evaluation**: Effort, risk, and alignment all matter
3. **Transparent Reasoning**: Document WHY each choice was made
4. **Recursive Refinement**: Self-question and improve estimates
5. **Historical Learning**: Use past similar tasks to improve estimates
6. **Fail-Safe Defaults**: Always have a fallback approach

---

## Component 1: Alternative Generator

### Purpose

Generate 3-5 different approaches for accomplishing a high-level action.

### Input

```javascript
{
  action: "Clone GitHub repository https://github.com/user/repo",
  context: {
    availableTools: ['run_bash', 'read_dir', 'write_file', 'echo'],
    cwd: '/home/user/projects',
    taskGoal: 'Deploy to production',
    iteration: 3,
    pastApproaches: [ /* similar tasks from episodic memory */ ]
  }
}
```

### Output

```javascript
{
  alternatives: [
    {
      id: 'alt-1',
      name: 'Use gh CLI',
      description: 'Clone using GitHub CLI (gh repo clone)',
      steps: [
        { tool: 'run_bash', args: { script: 'gh --version' } },
        { tool: 'run_bash', args: { script: 'gh repo clone user/repo' } }
      ],
      assumptions: ['gh is installed', 'gh is authenticated'],
      prerequisites: ['gh CLI installed', 'GitHub authentication'],
      confidence: 0.7, // Lower due to assumptions
    },
    {
      id: 'alt-2',
      name: 'Use git clone HTTPS',
      description: 'Clone using standard git HTTPS',
      steps: [
        { tool: 'run_bash', args: { script: 'git --version' } },
        { tool: 'run_bash', args: { script: 'git clone https://github.com/user/repo' } }
      ],
      assumptions: ['git is installed'],
      prerequisites: ['git installed'],
      confidence: 0.85, // Higher - git more common
    },
    {
      id: 'alt-3',
      name: 'Use curl + tar',
      description: 'Download ZIP and extract',
      steps: [
        { tool: 'run_bash', args: { script: 'curl -L https://github.com/user/repo/archive/main.zip -o repo.zip' } },
        { tool: 'run_bash', args: { script: 'unzip repo.zip' } }
      ],
      assumptions: ['curl is installed', 'unzip is installed'],
      prerequisites: ['curl and unzip installed'],
      confidence: 0.6, // Lower - more complex
    }
  ],
  generationMethod: 'llm_with_historical_context',
  timestamp: '2025-11-03T10:30:00Z'
}
```

### Algorithm

```javascript
class AlternativeGenerator {
  constructor(llmClient, model, episodicMemory, toolEffectiveness) {
    this.llmClient = llmClient;
    this.model = model;
    this.episodicMemory = episodicMemory;
    this.toolEffectiveness = toolEffectiveness;
  }

  async generateAlternatives(action, context) {
    // Step 1: Search for similar past tasks
    const similarTasks = await this.episodicMemory.search(action, {
      minSimilarity: 0.7,
      limit: 5,
      successOnly: false, // Include failures to learn what NOT to do
    });

    // Step 2: Get tool recommendations
    const toolRecs = await this.toolEffectiveness.getRecommendations(
      context.taskGoal,
      context.recentFailures
    );

    // Step 3: Build comprehensive prompt
    const prompt = this.buildAlternativePrompt(action, context, similarTasks, toolRecs);

    // Step 4: Call LLM
    const response = await this.llmClient.chat({
      model: this.model,
      messages: [
        { role: 'system', content: this.buildSystemPrompt() },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7, // Higher for creativity
      max_tokens: 2000,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'alternatives',
          strict: true,
          schema: this.getAlternativesSchema()
        }
      }
    });

    const alternatives = JSON.parse(response.choices[0].message.content);

    // Step 5: Validate and enrich
    return this.validateAlternatives(alternatives, context);
  }

  buildAlternativePrompt(action, context, similarTasks, toolRecs) {
    return `# Generate Multiple Approaches

**Action**: ${action}
**Goal**: ${context.taskGoal}
**Available Tools**: ${context.availableTools.join(', ')}

## Past Similar Tasks

${this.formatSimilarTasks(similarTasks)}

## Tool Recommendations

${this.formatToolRecs(toolRecs)}

## Your Task

Generate 3-5 DIFFERENT approaches for accomplishing this action. Each approach should:
1. Use different tools or strategies
2. Have different trade-offs (complexity, risk, prerequisites)
3. Be executable with available tools
4. List ALL assumptions and prerequisites

**Critical**: Include a "safe fallback" approach that works even if tools are missing.

Respond with JSON matching the schema.`;
  }

  buildSystemPrompt() {
    return `You are an alternative generator for an autonomous agent.

Your job: Generate MULTIPLE ways to accomplish a task, not just one.

Principles:
- **Diversity**: Each approach should be meaningfully different
- **Realism**: Only use available tools
- **Safety**: Include a fallback approach that always works
- **Transparency**: Document all assumptions
- **Learning**: Consider what worked/failed in similar past tasks

Example:
Task: "Install package"
Alternatives:
  1. Use npm install (assumes npm installed)
  2. Use yarn install (assumes yarn installed)
  3. Use pnpm install (assumes pnpm installed)
  4. Download manually via curl (fallback, always works)

Bad example (not diverse enough):
  1. Use npm install
  2. Use npm i (same as #1)
  3. Use npm install --save (same as #1)`;
  }

  formatSimilarTasks(similarTasks) {
    if (similarTasks.length === 0) return '(No similar tasks found)';

    return similarTasks.map((task, i) => {
      const status = task.successful ? '✓ SUCCEEDED' : '✗ FAILED';
      return `${i + 1}. ${task.description} (${status})
   Approach: ${task.approach}
   Tools: ${task.tools_used.join(', ')}
   Iterations: ${task.iterations}
   ${task.successful ? '' : `Failure: ${task.error}`}`;
    }).join('\n\n');
  }

  formatToolRecs(toolRecs) {
    if (!toolRecs || toolRecs.length === 0) return '(No specific recommendations)';

    return toolRecs.map(rec =>
      `- **${rec.tool}**: ${rec.reason} (success rate: ${(rec.successRate * 100).toFixed(0)}%)`
    ).join('\n');
  }

  validateAlternatives(alternatives, context) {
    // Ensure at least 2 alternatives
    if (alternatives.alternatives.length < 2) {
      console.warn('[AlternativeGenerator] Too few alternatives, adding fallback');
      alternatives.alternatives.push(this.createFallbackAlternative(context));
    }

    // Validate tool names
    for (const alt of alternatives.alternatives) {
      for (const step of alt.steps) {
        if (!context.availableTools.includes(step.tool)) {
          console.warn(`[AlternativeGenerator] Invalid tool: ${step.tool}`);
          step.tool = 'echo'; // Safe fallback
          step.args = { message: `Tool ${step.tool} not available` };
        }
      }
    }

    // Assign IDs if missing
    alternatives.alternatives.forEach((alt, i) => {
      if (!alt.id) alt.id = `alt-${i + 1}`;
    });

    return alternatives;
  }

  createFallbackAlternative(context) {
    return {
      id: 'alt-fallback',
      name: 'Report and request guidance',
      description: 'Safe fallback - report situation to user',
      steps: [
        {
          tool: 'echo',
          args: { message: 'Multiple approaches possible. Requesting guidance.' }
        }
      ],
      assumptions: [],
      prerequisites: [],
      confidence: 0.5, // Medium confidence - always works but suboptimal
    };
  }
}
```

---

## Component 2: Effort Estimator

### Purpose

Estimate the effort (complexity, time, risk) required for each alternative approach.

### Input

```javascript
{
  alternative: {
    id: 'alt-2',
    name: 'Use git clone HTTPS',
    steps: [ /* ... */ ],
    assumptions: ['git is installed'],
    prerequisites: ['git installed']
  },
  context: {
    taskGoal: 'Deploy to production',
    iteration: 3,
    availableTools: ['run_bash', ...],
    pastSimilarTasks: [ /* ... */ ]
  }
}
```

### Output

```javascript
{
  alternativeId: 'alt-2',
  effort: {
    complexity: 'low',           // low | medium | high
    complexityScore: 2.5,        // 0-10 scale
    estimatedIterations: 2,      // Based on similar tasks
    estimatedIterationsRange: [1, 3], // Min-max
    confidence: 0.8,             // How confident in estimate
  },
  risk: {
    level: 'low',                // low | medium | high
    riskScore: 2.0,              // 0-10 scale
    factors: [
      {
        type: 'prerequisite_assumption',
        description: 'Assumes git is installed',
        likelihood: 'medium',    // How likely is this a problem?
        impact: 'high',          // If it fails, how bad is it?
        mitigation: 'Verify git availability first'
      }
    ],
    overallLikelihood: 0.3,      // 30% chance something goes wrong
  },
  cost: {
    toolCalls: 2,                // Number of tool invocations
    tokenEstimate: 500,          // LLM tokens for this approach
    timeEstimate: '30-60 seconds', // Human-readable
  },
  metadata: {
    basedOnSimilarTasks: 3,      // How many similar tasks informed this
    historicalSuccessRate: 0.85, // Success rate for this approach
    lastUsed: '2025-11-02T15:30:00Z',
  }
}
```

### Algorithm

```javascript
class EffortEstimator {
  constructor(episodicMemory, sessionMemory) {
    this.episodicMemory = episodicMemory;
    this.sessionMemory = sessionMemory;

    // Complexity scoring weights
    this.complexityWeights = {
      stepCount: 0.3,          // More steps = more complex
      toolDiversity: 0.2,      // More different tools = more complex
      assumptionCount: 0.2,    // More assumptions = more complex
      prerequisiteCount: 0.2,  // More prerequisites = more complex
      historicalFailures: 0.1, // Failed often = more complex
    };

    // Risk scoring weights
    this.riskWeights = {
      assumptionCount: 0.4,    // More assumptions = more risk
      historicalFailures: 0.3, // Failed often = more risk
      prerequisiteCount: 0.2,  // More prerequisites = more risk
      toolReliability: 0.1,    // Unreliable tools = more risk
    };
  }

  async estimateEffort(alternative, context) {
    // Step 1: Get historical data
    const similarTasks = await this.findSimilarApproaches(alternative, context);

    // Step 2: Calculate complexity
    const complexity = this.calculateComplexity(alternative, similarTasks);

    // Step 3: Calculate risk
    const risk = await this.calculateRisk(alternative, context, similarTasks);

    // Step 4: Estimate iterations
    const iterations = this.estimateIterations(alternative, similarTasks);

    // Step 5: Calculate cost
    const cost = this.calculateCost(alternative);

    // Step 6: Gather metadata
    const metadata = this.gatherMetadata(similarTasks);

    return {
      alternativeId: alternative.id,
      effort: { complexity, ...iterations },
      risk,
      cost,
      metadata,
    };
  }

  async findSimilarApproaches(alternative, context) {
    // Search for tasks that used similar tools
    const toolSignature = alternative.steps.map(s => s.tool).join('→');

    const similarByTools = await this.episodicMemory.search(toolSignature, {
      minSimilarity: 0.6,
      limit: 10,
    });

    // Also search by action description
    const similarByAction = await this.episodicMemory.search(alternative.description, {
      minSimilarity: 0.7,
      limit: 10,
    });

    // Merge and deduplicate
    const all = [...similarByTools, ...similarByAction];
    const unique = Array.from(new Map(all.map(t => [t.id, t])).values());

    return unique.slice(0, 5); // Top 5
  }

  calculateComplexity(alternative, similarTasks) {
    const scores = {
      stepCount: alternative.steps.length / 5, // Normalize to 0-1 (5 steps = 1.0)
      toolDiversity: new Set(alternative.steps.map(s => s.tool)).size / alternative.steps.length,
      assumptionCount: alternative.assumptions.length / 3, // 3 assumptions = 1.0
      prerequisiteCount: alternative.prerequisites.length / 3,
      historicalFailures: similarTasks.length > 0
        ? similarTasks.filter(t => !t.successful).length / similarTasks.length
        : 0.5, // Default to medium if no history
    };

    // Weighted average
    const complexityScore = Object.keys(scores).reduce((sum, key) => {
      return sum + (scores[key] * this.complexityWeights[key]);
    }, 0) * 10; // Scale to 0-10

    // Convert to category
    let complexity = 'low';
    if (complexityScore > 7) complexity = 'high';
    else if (complexityScore > 4) complexity = 'medium';

    return { complexity, complexityScore, scores };
  }

  async calculateRisk(alternative, context, similarTasks) {
    const factors = [];

    // Risk Factor 1: Assumptions
    for (const assumption of alternative.assumptions) {
      const verifiable = await this.canVerifyAssumption(assumption, context);
      factors.push({
        type: 'prerequisite_assumption',
        description: assumption,
        likelihood: verifiable ? 'low' : 'medium',
        impact: 'high',
        mitigation: verifiable
          ? `Verify: ${this.generateVerificationCommand(assumption)}`
          : 'Manual verification required',
      });
    }

    // Risk Factor 2: Historical failures
    const failureRate = similarTasks.length > 0
      ? similarTasks.filter(t => !t.successful).length / similarTasks.length
      : 0;

    if (failureRate > 0.3) {
      factors.push({
        type: 'historical_failure_rate',
        description: `${(failureRate * 100).toFixed(0)}% failure rate for similar approaches`,
        likelihood: 'high',
        impact: 'medium',
        mitigation: 'Add extra verification steps',
      });
    }

    // Risk Factor 3: Prerequisites
    for (const prereq of alternative.prerequisites) {
      factors.push({
        type: 'prerequisite',
        description: prereq,
        likelihood: 'medium',
        impact: 'high',
        mitigation: 'Verify prerequisite before execution',
      });
    }

    // Calculate overall risk score
    const riskScore = factors.reduce((sum, f) => {
      const likelihoodScore = { low: 0.2, medium: 0.5, high: 0.8 }[f.likelihood];
      const impactScore = { low: 0.2, medium: 0.5, high: 0.8 }[f.impact];
      return sum + (likelihoodScore * impactScore * 10);
    }, 0) / Math.max(factors.length, 1);

    // Convert to category
    let level = 'low';
    if (riskScore > 6) level = 'high';
    else if (riskScore > 3) level = 'medium';

    return {
      level,
      riskScore,
      factors,
      overallLikelihood: riskScore / 10,
    };
  }

  estimateIterations(alternative, similarTasks) {
    if (similarTasks.length === 0) {
      // No history - estimate based on step count
      const baseIterations = Math.ceil(alternative.steps.length / 2);
      return {
        estimatedIterations: baseIterations,
        estimatedIterationsRange: [baseIterations, baseIterations * 2],
        confidence: 0.5, // Low confidence without history
      };
    }

    // Use historical data
    const iterations = similarTasks.map(t => t.iterations);
    const avg = iterations.reduce((a, b) => a + b, 0) / iterations.length;
    const min = Math.min(...iterations);
    const max = Math.max(...iterations);

    return {
      estimatedIterations: Math.round(avg),
      estimatedIterationsRange: [min, max],
      confidence: 0.8, // Higher confidence with history
    };
  }

  calculateCost(alternative) {
    return {
      toolCalls: alternative.steps.length,
      tokenEstimate: alternative.steps.length * 250, // Rough estimate
      timeEstimate: this.formatTimeEstimate(alternative.steps.length),
    };
  }

  formatTimeEstimate(stepCount) {
    const seconds = stepCount * 15; // ~15 seconds per step
    if (seconds < 60) return `${seconds} seconds`;
    const minutes = Math.round(seconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }

  gatherMetadata(similarTasks) {
    if (similarTasks.length === 0) {
      return {
        basedOnSimilarTasks: 0,
        historicalSuccessRate: null,
        lastUsed: null,
      };
    }

    const successCount = similarTasks.filter(t => t.successful).length;
    const successRate = successCount / similarTasks.length;
    const mostRecent = similarTasks.sort((a, b) =>
      new Date(b.timestamp) - new Date(a.timestamp)
    )[0];

    return {
      basedOnSimilarTasks: similarTasks.length,
      historicalSuccessRate: successRate,
      lastUsed: mostRecent.timestamp,
    };
  }

  async canVerifyAssumption(assumption, context) {
    // Check if we can generate a verification command
    const lower = assumption.toLowerCase();

    if (lower.includes('installed') && context.availableTools.includes('run_bash')) {
      return true; // Can verify with --version or which
    }

    if (lower.includes('exists') && context.availableTools.includes('read_dir')) {
      return true; // Can verify with directory listing
    }

    return false;
  }

  generateVerificationCommand(assumption) {
    const lower = assumption.toLowerCase();

    if (lower.includes('git')) return 'git --version';
    if (lower.includes('npm')) return 'npm --version';
    if (lower.includes('node')) return 'node --version';
    if (lower.includes('python')) return 'python --version';

    return 'echo "Manual verification required"';
  }
}
```

---

## Component 3: Plan Alignment Checker

### Purpose

Evaluate how well each alternative aligns with the overall task goal.

### Input

```javascript
{
  alternative: {
    id: 'alt-2',
    name: 'Use git clone HTTPS',
    description: 'Clone repository using git',
    steps: [ /* ... */ ]
  },
  context: {
    taskGoal: 'Deploy application to production',
    currentProgress: 0.30, // 30% complete
    completedSteps: ['Install dependencies', 'Run tests'],
    remainingGoals: ['Build application', 'Deploy to server'],
    iteration: 5
  }
}
```

### Output

```javascript
{
  alternativeId: 'alt-2',
  alignment: {
    score: 0.85,                 // 0-1 scale (higher is better)
    category: 'highly_aligned',  // highly_aligned | partially_aligned | not_aligned
    reasoning: 'Cloning the repository is essential for deployment. Cannot build or deploy without source code. This directly enables the next steps (Build application, Deploy to server).',
    contribution: 'critical',    // critical | important | helpful | tangential | unnecessary
    blockingOthers: false,       // Does this unblock other tasks?
    unblocks: ['Build application', 'Deploy to server'],
    dependencies: [],            // What must be done before this?
    urgency: 'high',            // high | medium | low
  },
  alternatives: [
    {
      id: 'reorder',
      description: 'Do this task later (lower urgency)',
      reason: 'No urgent need to clone immediately',
      newAlignment: 0.60
    }
  ]
}
```

### Algorithm

```javascript
class PlanAlignmentChecker {
  constructor(llmClient, model) {
    this.llmClient = llmClient;
    this.model = model;
  }

  async checkAlignment(alternative, context) {
    // Step 1: Decompose overall goal into subgoals
    const goalDecomposition = await this.decomposeGoal(context.taskGoal);

    // Step 2: Evaluate contribution to each subgoal
    const contributions = await this.evaluateContributions(
      alternative,
      goalDecomposition,
      context
    );

    // Step 3: Calculate alignment score
    const alignment = this.calculateAlignment(contributions, context);

    // Step 4: Generate reasoning
    const reasoning = await this.generateReasoning(alternative, alignment, context);

    // Step 5: Identify alternatives (reorder, skip, etc.)
    const alternatives = this.identifyAlternatives(alignment, context);

    return {
      alternativeId: alternative.id,
      alignment,
      alternatives,
    };
  }

  async decomposeGoal(taskGoal) {
    const prompt = `Decompose this goal into 3-5 essential subgoals:

**Goal**: ${taskGoal}

Respond with JSON:
{
  "subgoals": [
    {
      "name": "subgoal name",
      "description": "what needs to be accomplished",
      "priority": "high|medium|low",
      "dependencies": ["other subgoal names"]
    }
  ]
}`;

    const response = await this.llmClient.chat({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 500,
    });

    return JSON.parse(response.choices[0].message.content);
  }

  async evaluateContributions(alternative, goalDecomposition, context) {
    const contributions = [];

    for (const subgoal of goalDecomposition.subgoals) {
      const prompt = `Evaluate how this action contributes to this subgoal:

**Action**: ${alternative.description}
**Subgoal**: ${subgoal.name} - ${subgoal.description}

Rate contribution (0-1):
- 0.0: No contribution (completely unrelated)
- 0.3: Tangentially related
- 0.5: Somewhat helpful
- 0.7: Directly contributes
- 1.0: Essential for completing this subgoal

Also classify:
- critical: Must do this to complete subgoal
- important: Significantly helps but not required
- helpful: Nice to have
- tangential: Barely related
- unnecessary: Doesn't help

Respond with JSON:
{
  "contribution": 0.8,
  "classification": "important",
  "reasoning": "brief explanation"
}`;

      const response = await this.llmClient.chat({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200,
      });

      const result = JSON.parse(response.choices[0].message.content);

      contributions.push({
        subgoal: subgoal.name,
        priority: subgoal.priority,
        contribution: result.contribution,
        classification: result.classification,
        reasoning: result.reasoning,
      });
    }

    return contributions;
  }

  calculateAlignment(contributions, context) {
    // Weighted average based on subgoal priority
    const weights = { high: 0.5, medium: 0.3, low: 0.2 };

    let totalWeight = 0;
    let weightedSum = 0;

    for (const contrib of contributions) {
      const weight = weights[contrib.priority] || 0.3;
      totalWeight += weight;
      weightedSum += contrib.contribution * weight;
    }

    const score = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Categorize
    let category = 'not_aligned';
    if (score > 0.7) category = 'highly_aligned';
    else if (score > 0.4) category = 'partially_aligned';

    // Determine overall contribution
    const classifications = contributions.map(c => c.classification);
    const contribution = classifications.includes('critical') ? 'critical'
      : classifications.includes('important') ? 'important'
      : classifications.includes('helpful') ? 'helpful'
      : classifications.includes('tangential') ? 'tangential'
      : 'unnecessary';

    // Reasoning (combine from contributions)
    const reasoning = contributions
      .filter(c => c.contribution > 0.5)
      .map(c => c.reasoning)
      .join(' ');

    // Check if this unblocks other tasks
    const unblocks = contributions
      .filter(c => c.classification === 'critical')
      .map(c => c.subgoal);

    // Determine urgency
    const urgency = contribution === 'critical' ? 'high'
      : contribution === 'important' ? 'medium'
      : 'low';

    return {
      score,
      category,
      reasoning,
      contribution,
      blockingOthers: unblocks.length > 0,
      unblocks,
      dependencies: [], // TODO: Extract from context
      urgency,
    };
  }

  async generateReasoning(alternative, alignment, context) {
    // Already generated in calculateAlignment
    return alignment.reasoning;
  }

  identifyAlternatives(alignment, context) {
    const alternatives = [];

    // Alternative 1: Defer if low urgency
    if (alignment.urgency === 'low' && alignment.score < 0.5) {
      alternatives.push({
        id: 'defer',
        description: 'Do this task later (low urgency)',
        reason: `Score ${(alignment.score * 100).toFixed(0)}% - not critical now`,
        newAlignment: alignment.score * 0.8, // Slightly lower if deferred
      });
    }

    // Alternative 2: Skip if not aligned
    if (alignment.category === 'not_aligned') {
      alternatives.push({
        id: 'skip',
        description: 'Skip this task (not aligned with goal)',
        reason: `Score ${(alignment.score * 100).toFixed(0)}% - doesn't contribute to goal`,
        newAlignment: 0,
      });
    }

    // Alternative 3: Reorder if blocking others
    if (alignment.blockingOthers) {
      alternatives.push({
        id: 'prioritize',
        description: 'Do this task immediately (unblocks others)',
        reason: `Unblocks: ${alignment.unblocks.join(', ')}`,
        newAlignment: Math.min(alignment.score * 1.2, 1.0), // Boost score
      });
    }

    return alternatives;
  }
}
```

---

## Component 4: Alternative Evaluator

### Purpose

Rank and choose the optimal alternative based on effort, risk, and alignment.

### Input

```javascript
{
  alternatives: [
    {
      id: 'alt-1',
      name: 'Use gh CLI',
      /* ... */
    },
    {
      id: 'alt-2',
      name: 'Use git clone HTTPS',
      /* ... */
    },
    {
      id: 'alt-3',
      name: 'Use curl + tar',
      /* ... */
    }
  ],
  effortEstimates: {
    'alt-1': { effort: { complexityScore: 3.5 }, risk: { riskScore: 5.0 } },
    'alt-2': { effort: { complexityScore: 2.5 }, risk: { riskScore: 2.0 } },
    'alt-3': { effort: { complexityScore: 6.0 }, risk: { riskScore: 4.0 } },
  },
  alignmentScores: {
    'alt-1': { alignment: { score: 0.85 } },
    'alt-2': { alignment: { score: 0.90 } },
    'alt-3': { alignment: { score: 0.80 } },
  }
}
```

### Output

```javascript
{
  rankedAlternatives: [
    {
      rank: 1,
      alternativeId: 'alt-2',
      name: 'Use git clone HTTPS',
      overallScore: 8.2,
      scores: {
        effort: 7.5,       // Lower is better
        risk: 8.0,         // Lower is better
        alignment: 9.0,    // Higher is better
      },
      reasoning: 'Best overall choice: Low complexity (2.5), low risk (2.0), high alignment (0.90). git is commonly installed.',
      confidence: 0.85,
      recommended: true,
    },
    {
      rank: 2,
      alternativeId: 'alt-1',
      name: 'Use gh CLI',
      overallScore: 6.8,
      scores: {
        effort: 6.5,
        risk: 5.0,
        alignment: 8.5,
      },
      reasoning: 'Good alternative but assumes gh CLI is installed (medium risk).',
      confidence: 0.70,
      recommended: false,
    },
    {
      rank: 3,
      alternativeId: 'alt-3',
      name: 'Use curl + tar',
      overallScore: 5.5,
      scores: {
        effort: 4.0,       // High complexity
        risk: 6.0,
        alignment: 8.0,
      },
      reasoning: 'Fallback option: High complexity (6.0), moderate risk. Use if git unavailable.',
      confidence: 0.60,
      recommended: false,
    }
  ],
  chosenAlternative: 'alt-2',
  choiceReasoning: 'alt-2 (Use git clone HTTPS) chosen for lowest effort (2.5) + lowest risk (2.0) + high alignment (0.90). Estimated 2 iterations.',
  fallbackAlternative: 'alt-3',
  metadata: {
    evaluationMethod: 'weighted_multi_criteria',
    weights: { effort: 0.4, risk: 0.3, alignment: 0.3 },
    timestamp: '2025-11-03T10:35:00Z'
  }
}
```

### Algorithm

```javascript
class AlternativeEvaluator {
  constructor(config = {}) {
    // Scoring weights (sum to 1.0)
    this.weights = {
      effort: config.effortWeight || 0.4,    // 40% - prioritize low effort
      risk: config.riskWeight || 0.3,        // 30% - avoid high risk
      alignment: config.alignmentWeight || 0.3, // 30% - stay aligned with goal
    };
  }

  evaluateAll(alternatives, effortEstimates, alignmentScores) {
    // Step 1: Score each alternative
    const scored = alternatives.map(alt => {
      const effort = effortEstimates[alt.id];
      const alignment = alignmentScores[alt.id];

      return {
        alternativeId: alt.id,
        name: alt.name,
        scores: {
          effort: this.scoreEffort(effort),
          risk: this.scoreRisk(effort),
          alignment: this.scoreAlignment(alignment),
        },
        effort,
        alignment,
      };
    });

    // Step 2: Calculate overall score for each
    const ranked = scored.map(s => {
      const overallScore =
        (s.scores.effort * this.weights.effort) +
        (s.scores.risk * this.weights.risk) +
        (s.scores.alignment * this.weights.alignment);

      return {
        ...s,
        overallScore,
        reasoning: this.generateReasoning(s),
        confidence: this.calculateConfidence(s),
      };
    });

    // Step 3: Sort by overall score (higher is better)
    ranked.sort((a, b) => b.overallScore - a.overallScore);

    // Step 4: Assign ranks and recommendations
    const rankedAlternatives = ranked.map((alt, i) => ({
      rank: i + 1,
      ...alt,
      recommended: i === 0, // Only top choice is recommended
    }));

    // Step 5: Choose optimal and fallback
    const chosenAlternative = rankedAlternatives[0].alternativeId;
    const fallbackAlternative = rankedAlternatives[rankedAlternatives.length - 1].alternativeId;

    const choiceReasoning = this.generateChoiceReasoning(rankedAlternatives[0]);

    return {
      rankedAlternatives,
      chosenAlternative,
      choiceReasoning,
      fallbackAlternative,
      metadata: {
        evaluationMethod: 'weighted_multi_criteria',
        weights: this.weights,
        timestamp: new Date().toISOString(),
      },
    };
  }

  scoreEffort(effortEstimate) {
    // Convert complexity score (0-10) to score (10-0, inverted)
    // Lower complexity = higher score
    const complexityScore = effortEstimate.effort.complexityScore;
    return 10 - complexityScore;
  }

  scoreRisk(effortEstimate) {
    // Convert risk score (0-10) to score (10-0, inverted)
    // Lower risk = higher score
    const riskScore = effortEstimate.risk.riskScore;
    return 10 - riskScore;
  }

  scoreAlignment(alignmentScore) {
    // Convert alignment (0-1) to score (0-10)
    // Higher alignment = higher score
    return alignmentScore.alignment.score * 10;
  }

  generateReasoning(scored) {
    const effort = scored.effort.effort;
    const risk = scored.effort.risk;
    const alignment = scored.alignment.alignment;

    let reasoning = '';

    // Effort assessment
    reasoning += `${effort.complexity.toUpperCase()} complexity (${effort.complexityScore.toFixed(1)}), `;

    // Risk assessment
    reasoning += `${risk.level.toUpperCase()} risk (${risk.riskScore.toFixed(1)}), `;

    // Alignment assessment
    reasoning += `${alignment.category.replace('_', ' ')} (${(alignment.score * 100).toFixed(0)}%). `;

    // Add key insight
    if (scored.scores.effort > 8 && scored.scores.risk > 8) {
      reasoning += 'Best overall choice.';
    } else if (scored.scores.effort < 5) {
      reasoning += 'High effort required.';
    } else if (scored.scores.risk < 5) {
      reasoning += 'Higher risk option.';
    } else if (scored.scores.alignment < 5) {
      reasoning += 'Poorly aligned with goal.';
    }

    return reasoning;
  }

  calculateConfidence(scored) {
    // Confidence based on:
    // 1. Effort estimation confidence
    // 2. Risk likelihood
    // 3. Alignment score

    const effortConfidence = scored.effort.effort.confidence;
    const riskLikelihood = 1 - scored.effort.risk.overallLikelihood;
    const alignmentConfidence = scored.alignment.alignment.score;

    return (effortConfidence + riskLikelihood + alignmentConfidence) / 3;
  }

  generateChoiceReasoning(topChoice) {
    const effort = topChoice.effort.effort;
    const risk = topChoice.effort.risk;
    const alignment = topChoice.alignment.alignment;

    return `${topChoice.name} chosen for lowest effort (${effort.complexityScore.toFixed(1)}) + lowest risk (${risk.riskScore.toFixed(1)}) + high alignment (${(alignment.score * 100).toFixed(0)}%). Estimated ${effort.estimatedIterations} iterations.`;
  }
}
```

---

## Integration Architecture

### Full Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AUTONOMOUS AGENT                                 │
│  Current State: Iteration 5, Task: "Deploy application"                 │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │   1. REFLECT    │
                          │  (Existing)     │
                          └─────────────────┘
                                   │
                                   ▼
                  ┌────────────────────────────────┐
                  │  Current iteration action:     │
                  │  "Clone GitHub repository"     │
                  └────────────────────────────────┘
                                   │
                                   ▼
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                    🆕 PROACTIVE PLANNING LAYER                           ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                                   │
                                   ▼
         ┌────────────────────────────────────────────────┐
         │  AlternativeGenerator.generateAlternatives()    │ ◄─── Episodic Memory
         │                                                 │ ◄─── Tool Effectiveness
         │  Output: 3-5 different approaches              │
         └────────────────────────────────────────────────┘
                                   │
                                   ▼
         ┌────────────────────────────────────────────────┐
         │  FOR EACH alternative:                          │
         │                                                 │
         │  EffortEstimator.estimateEffort(alt)           │ ◄─── Session Memory
         │    → Complexity, time, risk                    │ ◄─── Historical tasks
         │                                                 │
         │  PlanAlignmentChecker.checkAlignment(alt)      │ ◄─── Overall goal
         │    → Alignment score, contribution             │ ◄─── Subgoal decomp
         └────────────────────────────────────────────────┘
                                   │
                                   ▼
         ┌────────────────────────────────────────────────┐
         │  AlternativeEvaluator.evaluateAll()            │
         │                                                 │
         │  Rank alternatives by:                         │
         │    • Effort (40%)                              │
         │    • Risk (30%)                                │
         │    • Alignment (30%)                           │
         │                                                 │
         │  Choose optimal approach                       │
         └────────────────────────────────────────────────┘
                                   │
                                   ▼
                  ┌────────────────────────────────┐
                  │  Chosen Alternative:            │
                  │  "Use git clone HTTPS"         │
                  │                                 │
                  │  Reasoning: "Lowest effort +   │
                  │  lowest risk + high alignment" │
                  └────────────────────────────────┘
                                   │
                                   ▼
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                    EXISTING EXECUTION LAYER                              ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                                   │
                                   ▼
                          ┌─────────────────┐
                          │  2. PLAN        │
                          │  (Task Planner) │
                          └─────────────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │  3. EXECUTE     │
                          │  (Run tools)    │
                          └─────────────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │  4. META-REFLECT│
                          │  (Existing)     │
                          └─────────────────┘
                                   │
                                   ▼
                       ┌──────────────────────┐
                       │  Record to Memory:   │
                       │  • Chosen approach   │
                       │  • Actual iterations │
                       │  • Effort accuracy   │
                       └──────────────────────┘
```

### Integration Points with Existing Systems

| Existing Component | Integration | Data Flow |
|--------------------|-------------|-----------|
| **Episodic Memory** | AlternativeGenerator pulls similar tasks | Historical approaches → Alternatives |
| **Tool Effectiveness** | AlternativeGenerator uses tool recommendations | Tool success rates → Alternative confidence |
| **Session Memory** | EffortEstimator queries recent tasks | Recent iterations → Time estimates |
| **Self-Evaluator** | AlternativeEvaluator uses risk assessment | Risk patterns → Alternative ranking |
| **Task Planner** | Plans chosen alternative | Chosen alternative → Detailed steps |
| **Meta-Reflection** | Records choice accuracy | Estimated vs actual → Future calibration |
| **Pattern Learner** | Learns from chosen approaches | Successful choices → Pattern storage |

---

## Data Structures

### Alternative

```typescript
interface Alternative {
  id: string;                        // Unique ID
  name: string;                      // Human-readable name
  description: string;               // What this approach does
  steps: Step[];                     // Execution steps
  assumptions: string[];             // What this assumes
  prerequisites: string[];           // What must be true/available
  confidence: number;                // 0-1, how confident this will work
  metadata?: {
    basedOn?: string;                // 'historical' | 'llm' | 'heuristic'
    similarTaskIds?: string[];       // IDs of similar past tasks
  };
}

interface Step {
  tool: string;
  args: Record<string, any>;
  description?: string;
  expectedOutcome?: string;
}
```

### EffortEstimate

```typescript
interface EffortEstimate {
  alternativeId: string;
  effort: {
    complexity: 'low' | 'medium' | 'high';
    complexityScore: number;         // 0-10
    estimatedIterations: number;
    estimatedIterationsRange: [number, number];
    confidence: number;              // 0-1
  };
  risk: {
    level: 'low' | 'medium' | 'high';
    riskScore: number;               // 0-10
    factors: RiskFactor[];
    overallLikelihood: number;       // 0-1
  };
  cost: {
    toolCalls: number;
    tokenEstimate: number;
    timeEstimate: string;
  };
  metadata: {
    basedOnSimilarTasks: number;
    historicalSuccessRate: number | null;
    lastUsed: string | null;
  };
}

interface RiskFactor {
  type: string;
  description: string;
  likelihood: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  mitigation: string;
}
```

### AlignmentScore

```typescript
interface AlignmentScore {
  alternativeId: string;
  alignment: {
    score: number;                   // 0-1
    category: 'highly_aligned' | 'partially_aligned' | 'not_aligned';
    reasoning: string;
    contribution: 'critical' | 'important' | 'helpful' | 'tangential' | 'unnecessary';
    blockingOthers: boolean;
    unblocks: string[];
    dependencies: string[];
    urgency: 'high' | 'medium' | 'low';
  };
  alternatives: AlignmentAlternative[];
}

interface AlignmentAlternative {
  id: string;
  description: string;
  reason: string;
  newAlignment: number;
}
```

### RankedAlternative

```typescript
interface RankedAlternative {
  rank: number;
  alternativeId: string;
  name: string;
  overallScore: number;              // 0-10
  scores: {
    effort: number;                  // 0-10 (higher = less effort)
    risk: number;                    // 0-10 (higher = less risk)
    alignment: number;               // 0-10 (higher = more aligned)
  };
  reasoning: string;
  confidence: number;                // 0-1
  recommended: boolean;
}
```

---

## Algorithms

### Multi-Criteria Decision Making (MCDM)

**Method**: Weighted Sum Model (WSM)

**Formula**:
```
Overall Score = (effort_score × 0.4) + (risk_score × 0.3) + (alignment_score × 0.3)

Where:
  effort_score = 10 - complexity_score     (lower effort = higher score)
  risk_score = 10 - risk_score             (lower risk = higher score)
  alignment_score = alignment × 10         (higher alignment = higher score)
```

**Justification**:
- **Effort (40%)**: Prioritize low effort (faster completion, less resource usage)
- **Risk (30%)**: Avoid high-risk approaches (fewer failures, less recovery time)
- **Alignment (30%)**: Stay focused on goal (no wasted work)

**Alternative Method**: TOPSIS (Technique for Order Preference by Similarity to Ideal Solution)
- Calculate ideal solution (lowest effort, lowest risk, highest alignment)
- Calculate distance of each alternative from ideal
- Rank by similarity to ideal

---

## Example Workflows

### Example 1: Clone Repository

**User Request**: "Deploy application to production"
**Current Iteration**: Iteration 3, "Clone GitHub repository"

#### Step 1: Generate Alternatives

```javascript
const alternatives = await alternativeGenerator.generateAlternatives(
  'Clone GitHub repository https://github.com/user/app',
  context
);

// Output:
{
  alternatives: [
    { id: 'alt-1', name: 'Use gh CLI', steps: [...], assumptions: ['gh installed'] },
    { id: 'alt-2', name: 'Use git clone HTTPS', steps: [...], assumptions: ['git installed'] },
    { id: 'alt-3', name: 'Use curl + tar', steps: [...], assumptions: ['curl, unzip installed'] },
  ]
}
```

#### Step 2: Estimate Effort

```javascript
const efforts = {};
for (const alt of alternatives.alternatives) {
  efforts[alt.id] = await effortEstimator.estimateEffort(alt, context);
}

// Output:
{
  'alt-1': { effort: { complexityScore: 3.5 }, risk: { riskScore: 5.0 } }, // Medium complexity, medium risk
  'alt-2': { effort: { complexityScore: 2.5 }, risk: { riskScore: 2.0 } }, // Low complexity, low risk
  'alt-3': { effort: { complexityScore: 6.0 }, risk: { riskScore: 4.0 } }, // High complexity, medium risk
}
```

#### Step 3: Check Alignment

```javascript
const alignments = {};
for (const alt of alternatives.alternatives) {
  alignments[alt.id] = await alignmentChecker.checkAlignment(alt, context);
}

// Output:
{
  'alt-1': { alignment: { score: 0.85, category: 'highly_aligned' } },
  'alt-2': { alignment: { score: 0.90, category: 'highly_aligned' } },
  'alt-3': { alignment: { score: 0.80, category: 'highly_aligned' } },
}
```

#### Step 4: Evaluate and Rank

```javascript
const evaluation = evaluator.evaluateAll(
  alternatives.alternatives,
  efforts,
  alignments
);

// Output:
{
  rankedAlternatives: [
    { rank: 1, alternativeId: 'alt-2', overallScore: 8.2, recommended: true },  // git clone
    { rank: 2, alternativeId: 'alt-1', overallScore: 6.8, recommended: false }, // gh CLI
    { rank: 3, alternativeId: 'alt-3', overallScore: 5.5, recommended: false }, // curl+tar
  ],
  chosenAlternative: 'alt-2',
  choiceReasoning: 'alt-2 (Use git clone HTTPS) chosen for lowest effort (2.5) + lowest risk (2.0) + high alignment (0.90).'
}
```

#### Step 5: Execute Chosen Alternative

```javascript
const chosen = alternatives.alternatives.find(a => a.id === 'alt-2');
await agent.executeIteration(chosen, executor, context);

// Result: Success in 2 iterations (as estimated)
```

#### Step 6: Record for Future Learning

```javascript
await sessionMemory.recordChoice({
  alternative: 'alt-2',
  estimatedIterations: 2,
  actualIterations: 2,
  success: true,
  effortAccuracy: 1.0, // Perfect estimate
});

// Future similar tasks will benefit from this data
```

---

### Example 2: Misaligned Task (Detected and Avoided)

**User Request**: "Prepare repository for deployment"
**Current Iteration**: Iteration 5, Agent wants to "Refactor code style"

#### Step 1: Generate Alternatives

```javascript
const alternatives = await alternativeGenerator.generateAlternatives(
  'Refactor code style for consistency',
  context
);

// Output: 3 approaches for refactoring
```

#### Step 2: Check Alignment

```javascript
const alignments = {};
for (const alt of alternatives.alternatives) {
  alignments[alt.id] = await alignmentChecker.checkAlignment(alt, context);
}

// Output:
{
  'alt-1': {
    alignment: {
      score: 0.25, // LOW alignment!
      category: 'not_aligned',
      reasoning: 'Code style refactoring does not contribute to deployment preparation. Deployment requires building, testing, and configuring infrastructure.',
      contribution: 'tangential',
      urgency: 'low',
    },
    alternatives: [
      {
        id: 'skip',
        description: 'Skip this task (not aligned with goal)',
        reason: 'Score 25% - doesn\'t contribute to deployment goal'
      }
    ]
  }
}
```

#### Step 3: Evaluator Recommends Skipping

```javascript
const evaluation = evaluator.evaluateAll(alternatives.alternatives, efforts, alignments);

// All alternatives score low due to poor alignment
// Agent decides to skip this action and reconsider

console.log('[AutonomousAgent] Low alignment detected (25%). Reconsidering action...');
return await agent.reflect(context, executor); // Re-reflect to find better action
```

**Result**: Agent avoids wasted work, stays focused on deployment goal

---

## Implementation Plan

### Phase 6.1: Alternative Generator (3 days)

**Day 1**:
- Create `alternative-generator.mjs`
- Implement `generateAlternatives()` method
- Integrate with Episodic Memory and Tool Effectiveness
- Write unit tests (10 test cases)

**Day 2**:
- Build prompt engineering for diverse alternatives
- Add validation and safety checks
- Implement fallback alternative creation
- Test with real-world scenarios

**Day 3**:
- Integrate into autonomous agent (add to reflection phase)
- Test end-to-end with autonomous deployment test
- Document and commit

**Deliverables**:
- `frontend/core/agent/alternative-generator.mjs` (300-400 lines)
- Unit tests (150 lines)
- Integration in `autonomous.mjs`

---

### Phase 6.2: Effort Estimator (2 days)

**Day 1**:
- Create `effort-estimator.mjs`
- Implement complexity, risk, and iteration estimation
- Integrate with Session Memory and Episodic Memory
- Write unit tests (8 test cases)

**Day 2**:
- Tune complexity and risk scoring algorithms
- Add historical learning (improve estimates over time)
- Test accuracy with past task data
- Document and commit

**Deliverables**:
- `frontend/core/agent/effort-estimator.mjs` (400-500 lines)
- Unit tests (120 lines)
- Calibration data

---

### Phase 6.3: Plan Alignment Checker (2 days)

**Day 1**:
- Create `plan-alignment-checker.mjs`
- Implement goal decomposition and contribution evaluation
- Build LLM prompts for alignment scoring
- Write unit tests (6 test cases)

**Day 2**:
- Integrate alignment checker into evaluation flow
- Add alternative suggestion (skip, defer, prioritize)
- Test with misaligned tasks
- Document and commit

**Deliverables**:
- `frontend/core/agent/plan-alignment-checker.mjs` (350-450 lines)
- Unit tests (100 lines)
- Example alignment scenarios

---

### Phase 6.4: Alternative Evaluator (1 day)

**Day 1**:
- Create `alternative-evaluator.mjs`
- Implement weighted multi-criteria ranking
- Add choice reasoning generation
- Write unit tests (5 test cases)
- Integrate all components
- End-to-end testing
- Document and commit

**Deliverables**:
- `frontend/core/agent/alternative-evaluator.mjs` (250-300 lines)
- Unit tests (80 lines)

---

### Phase 6.5: Integration & Testing (1-2 days)

**Day 1**:
- Integrate all 4 components into autonomous agent
- Update reflection phase to include proactive planning
- Add ContextLog events for tracking
- Run autonomous deployment test

**Day 2**:
- Performance optimization (caching, parallel execution)
- Add configuration options (weights, thresholds)
- Final documentation
- Create comprehensive design doc (this document)

**Deliverables**:
- Updated `autonomous.mjs` (integration code)
- Phase 6 complete documentation
- Performance benchmarks

---

**Total Estimated Time**: 7-9 days (varies with testing and refinement)

---

## Testing Strategy

### Unit Tests

**Component**: `alternative-generator.mjs`
- ✅ Generates 3-5 alternatives
- ✅ Alternatives are diverse (different tools/strategies)
- ✅ Includes fallback alternative
- ✅ Validates tool names against available tools
- ✅ Integrates with episodic memory (uses similar tasks)
- ✅ Handles edge cases (no available tools, no history)

**Component**: `effort-estimator.mjs`
- ✅ Estimates complexity (low/medium/high)
- ✅ Estimates iterations based on historical data
- ✅ Calculates risk score with factors
- ✅ Improves estimates over time (learning)
- ✅ Handles edge cases (no history, conflicting data)

**Component**: `plan-alignment-checker.mjs`
- ✅ Decomposes goal into subgoals
- ✅ Evaluates contribution to each subgoal
- ✅ Calculates alignment score (0-1)
- ✅ Categorizes alignment (highly/partially/not)
- ✅ Suggests alternatives (skip, defer, prioritize)

**Component**: `alternative-evaluator.mjs`
- ✅ Ranks alternatives by multi-criteria score
- ✅ Chooses optimal alternative
- ✅ Generates choice reasoning
- ✅ Handles ties (same score)
- ✅ Respects weight configuration

### Integration Tests

**Test 1**: Clone Repository (Optimal Choice)
- Generate 3 alternatives (gh, git, curl)
- Estimate effort (git = lowest)
- Check alignment (all high)
- Evaluate and choose git clone
- Execute and verify success

**Test 2**: Misaligned Task (Detected and Skipped)
- Generate alternatives for "refactor code style"
- Check alignment (low score)
- Evaluator recommends skipping
- Agent re-reflects instead

**Test 3**: High-Risk Alternative (Avoided)
- Generate alternatives, one has high risk
- Effort estimator flags risk factors
- Evaluator ranks risky alternative low
- Safer alternative chosen

**Test 4**: Historical Learning (Improved Estimates)
- Run task twice with same action
- First time: estimate 5 iterations, actual 3
- Record to memory
- Second time: estimate 3 iterations (learned)

### Performance Tests

**Benchmark 1**: Alternative Generation Time
- Target: <5 seconds for 3 alternatives
- Measure: LLM call time + processing

**Benchmark 2**: Effort Estimation Time
- Target: <2 seconds per alternative
- Measure: Historical search + calculation

**Benchmark 3**: End-to-End Planning Time
- Target: <15 seconds for full proactive planning
- Measure: Generate → Estimate → Align → Evaluate

---

## Risks & Mitigations

### Risk 1: LLM Generates Similar Alternatives (Low Diversity)

**Likelihood**: Medium
**Impact**: High (defeats purpose of multi-alternative planning)

**Mitigation**:
- Explicit prompt instructions: "Generate DIFFERENT approaches using DIFFERENT tools"
- Post-generation validation: Check tool diversity, reject if <50% unique
- Fallback: Add heuristic-based alternatives if LLM alternatives too similar

### Risk 2: Effort Estimation Inaccurate (No Historical Data)

**Likelihood**: High (initially)
**Impact**: Medium (poor choices at first)

**Mitigation**:
- Start with conservative estimates (assume higher effort)
- Clearly mark low-confidence estimates
- Learn rapidly (improve after every task)
- Fallback to heuristics (step count × 1.5 iterations)

### Risk 3: Alignment Checker Too Restrictive

**Likelihood**: Medium
**Impact**: Medium (agent skips useful tasks)

**Mitigation**:
- Tune alignment thresholds (allow 0.4+ alignment)
- Human-in-the-loop: Ask user if alignment <0.5
- Track false negatives (tasks skipped but were useful)

### Risk 4: Performance Overhead (Too Slow)

**Likelihood**: Low
**Impact**: Medium (slower iterations)

**Mitigation**:
- Cache alternatives for similar actions
- Parallel LLM calls (generate + estimate + align concurrently)
- Optimize prompts (reduce token count)
- Add configuration: `ENABLE_PROACTIVE_PLANNING=1` (opt-in)

### Risk 5: Choice Regret (Wrong Alternative Chosen)

**Likelihood**: Medium
**Impact**: Low (can recover)

**Mitigation**:
- Record all alternatives and rationale
- If chosen alternative fails, try next-ranked
- Meta-reflection tracks choice accuracy
- Improve ranking algorithm over time

---

## Success Metrics

### Primary Metrics

1. **Failure Rate Reduction**: 40-60% fewer failed iterations
   - Baseline: Current failure rate (measure over 100 iterations)
   - Target: 50% reduction

2. **Task Completion Speed**: 30-50% faster
   - Baseline: Current avg iterations per task
   - Target: 40% reduction

3. **Goal Alignment**: 80%+ of chosen actions highly aligned
   - Measure: Avg alignment score of chosen alternatives
   - Target: >0.80

### Secondary Metrics

4. **Effort Estimate Accuracy**: 70%+ within ±20%
   - Measure: Actual vs estimated iterations
   - Target: 70% within ±20% margin

5. **Alternative Diversity**: 60%+ unique tools/strategies
   - Measure: Tool overlap between alternatives
   - Target: <40% overlap

6. **Choice Confidence**: 75%+ confidence in chosen alternative
   - Measure: Avg confidence score
   - Target: >0.75

---

## Future Enhancements (Post-Phase 6)

### Phase 7: Adaptive Weights

Currently weights are fixed (effort: 0.4, risk: 0.3, alignment: 0.3).

**Enhancement**: Learn optimal weights for each task type.
- File operations → prioritize risk (avoid data loss)
- Network operations → prioritize effort (minimize latency)
- Code generation → prioritize alignment (stay focused)

### Phase 8: Counterfactual Reasoning

"What if I had chosen a different alternative?"

**Enhancement**: After execution, simulate what would have happened with other alternatives.
- Build mental model of alternative outcomes
- Learn which alternative would have been better
- Improve future choices

### Phase 9: Collaborative Decision Making

"Ask user which alternative to choose"

**Enhancement**: Present alternatives to user for selection.
- Show effort estimates, risk factors, alignment scores
- Let user choose based on preferences
- Learn user preferences over time

---

## Conclusion

Phase 6 introduces **proactive multi-alternative planning** that fundamentally shifts the agent from reactive to proactive:

**Before** (Reactive):
```
Generate ONE plan → Execute → Fail → Recover → Try again
```

**After** (Proactive):
```
Generate MULTIPLE plans → Estimate effort → Check alignment → Choose BEST → Execute with confidence
```

**Expected Impact**:
- ✅ 40-60% reduction in failed iterations
- ✅ 30-50% faster task completion
- ✅ Better goal alignment (stays focused)
- ✅ More realistic progress estimates

**Implementation Timeline**: 7-9 days
**Dependencies**: Phase 1-5 complete
**Priority**: High (major capability upgrade)

---

**Next Steps**: Review design, approve, begin implementation starting with Phase 6.1 (Alternative Generator).
