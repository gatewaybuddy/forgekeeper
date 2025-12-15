/**
 * LLM Client for Autonomous Agent
 *
 * Handles all LLM interactions including:
 * - Reflection prompts and responses
 * - Diagnostic analysis (5 Whys)
 * - Prompt guidance generation
 * - Response parsing and validation
 *
 * Extracted from autonomous.mjs to improve modularity and testability.
 */

import { ulid } from 'ulid';
import { contextLogEvents } from '../../services/contextlog-events.mjs';

/**
 * System prompt for agent reflection
 */
const REFLECTION_SYSTEM_PROMPT = `You are an autonomous agent working independently on a task.

Your job is to:
1. Honestly assess your progress
2. Decide the next concrete action
3. Know when to stop (task complete or stuck)

**Be truthful**: Don't claim progress if you haven't made any.
**Be specific**: Name exact files, commands, or tools in your next_action.
**Be decisive**: Choose COMPLETE only when truly confident (>90%).

**ITERATIVE REASONING PHILOSOPHY** (Critical):
With local inference, we optimize for MANY SMALL ITERATIONS rather than large responses:
- **Small steps**: Each iteration should do ONE focused thing
- **Unlimited turns**: Token limits per response, but NO limit on total iterations
- **Build up reasoning**: Many small thoughts → well-reasoned result
- **Memory is key**: Each iteration adds to our understanding
- **Favor clarity**: Short, clear responses over verbose ones
- **Think, then act**: Reflect → plan → execute → assess → repeat

**Multi-Step Workflow Strategy**:
When facing complex tasks requiring multiple steps:
1. **Break down** the task into clear phases (e.g., explore → design → implement → test → verify)
2. **Complete one phase** fully before moving to the next
3. **ONE action per iteration** - don't try to do multiple things at once
4. **Don't skip verification** - always test that each phase works before proceeding
5. **Track dependencies** - understand what each step requires
6. **Progress incrementally** - 10-20% progress per major phase

**Research Task Strategy**:
When analyzing codebases or gathering information:
1. **Start broad** - use read_dir to understand structure
2. **Then narrow** - read specific files that seem relevant
3. **Look for patterns** - similar code across files
4. **Summarize systematically** - organize findings clearly

**Code Generation Strategy**:
When creating code with tests:
1. **Design first** - plan the structure before writing
2. **Implement incrementally** - one function/feature at a time
3. **Test immediately** - verify each piece works
4. **Only claim complete** when tests pass

**Self-Improvement Strategy**:
When working on memory/reasoning tasks:
1. **Analyze current state** - what exists now?
2. **Identify gaps** - what's missing or could improve?
3. **Make targeted changes** - improve one thing at a time
4. **Verify improvement** - ensure changes actually help

Respond with JSON only. NO markdown fence, NO explanation - just the raw JSON.`;

/**
 * LLM Client for autonomous agent reflection and analysis
 */
export class LLMClient {
  /**
   * @param {Object} llmClient - LLM client instance
   * @param {string} model - Model name to use
   * @param {Object} diagnosticReflection - Diagnostic reflection subsystem
   */
  constructor(llmClient, model, diagnosticReflection) {
    this.llmClient = llmClient;
    this.model = model;
    this.diagnosticReflection = diagnosticReflection;
  }

  /**
   * Self-reflection: Assess state and decide next action
   *
   * @param {Object} state - Current agent state
   * @param {Object} executor - Tool executor with registry
   * @param {Object} selfEvaluator - Self-evaluator for confidence calibration
   * @param {Object} guidance - Guidance data (learnings, episodes, recommendations, etc.)
   * @returns {Promise<Object>} Reflection result
   */
  async reflect(state, executor, selfEvaluator, guidance) {
    const reflectionPrompt = this.buildReflectionPrompt(state, executor, guidance);

    try {
      const response = await this.llmClient.chat({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: REFLECTION_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: reflectionPrompt,
          },
        ],
        temperature: 0.3, // Some creativity, but mostly deterministic
        max_tokens: 1500,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'reflection_result',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                assessment: {
                  type: 'string',
                  enum: ['continue', 'complete', 'stuck'],
                },
                progress_percent: {
                  type: 'number',
                  minimum: 0,
                  maximum: 100,
                },
                confidence: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1,
                },
                next_action: {
                  type: 'string',
                },
                reasoning: {
                  type: 'string',
                },
                tool_plan: {
                  type: 'object',
                  properties: {
                    tool: { type: 'string' },
                    purpose: { type: 'string' },
                  },
                  required: ['tool', 'purpose'],
                  additionalProperties: false,
                },
              },
              required: ['assessment', 'progress_percent', 'confidence', 'next_action', 'reasoning'],
              additionalProperties: false,
            },
          },
        },
      });

      const reflection = JSON.parse(response.choices[0].message.content);

      // Validate and sanitize
      const rawConfidence = Math.max(0, Math.min(1, reflection.confidence || 0));

      // Calibrate confidence using historical accuracy
      let calibratedConfidence = rawConfidence;
      let calibrationReason = '';
      if (selfEvaluator) {
        const taskType = this.detectTaskType(state.task);
        const calibration = selfEvaluator.calibrateConfidence(rawConfidence, {
          taskType,
          tool: reflection.tool_plan?.tool,
        });
        calibratedConfidence = calibration.calibrated;
        calibrationReason = calibration.reason;

        if (Math.abs(calibration.adjustment) > 0.05) {
          console.log(`[LLMClient] Confidence calibrated: ${(rawConfidence * 100).toFixed(0)}% → ${(calibratedConfidence * 100).toFixed(0)}% (${calibrationReason})`);
        }
      }

      return {
        assessment: reflection.assessment || 'continue',
        progress_percent: Math.max(0, Math.min(100, reflection.progress_percent || 0)),
        confidence: calibratedConfidence,
        rawConfidence, // Keep original for debugging
        calibrationReason,
        next_action: reflection.next_action || 'Continue working on task',
        reasoning: reflection.reasoning || '',
        tool_plan: reflection.tool_plan,
      };

    } catch (error) {
      console.error('[LLMClient] Reflection failed:', error);

      // Fallback: continue with generic action
      return {
        assessment: 'continue',
        progress_percent: state.lastProgressPercent || 0,
        confidence: 0.3,
        next_action: 'Continue working on the task',
        reasoning: 'Failed to generate reflection, continuing with default action',
      };
    }
  }

  /**
   * Run diagnostic reflection on a tool failure using "5 Whys" analysis
   *
   * @param {Object} toolCall - The failed tool call
   * @param {Error} error - The error object
   * @param {Object} executor - Tool executor (for getting available tools)
   * @param {Object} context - Execution context
   * @param {Object} state - Current agent state
   * @returns {Promise<Object|null>} Diagnosis object or null on failure
   */
  async runDiagnosticReflection(toolCall, error, executor, context, state) {
    try {
      // Get list of available tools
      const availableTools = executor.toolRegistry
        ? Array.from(executor.toolRegistry.keys())
        : [];

      // Get last 3 actions for context
      const previousActions = state.history.slice(-3).map(h => ({
        tool: h.tools_used?.[0] || 'unknown',
        args: {},
        result: h.result || '',
        success: !h.result.includes('ERROR'),
      }));

      // Build failure context
      const failureContext = {
        toolCall,
        error: {
          message: error.message,
          code: error.code,
          stdout: error.stdout,
          stderr: error.stderr,
          signal: error.signal,
        },
        iteration: state.iteration,
        previousActions,
        availableTools,
        workspaceState: {
          files: [], // TODO: Could read actual workspace state if needed
          directories: [],
        },
        taskGoal: state.task,
      };

      // Run diagnostic reflection
      const diagnosis = await this.diagnosticReflection.runDiagnosticReflection(failureContext);

      // Emit diagnostic event to ContextLog
      await contextLogEvents.emitDiagnosticReflection(
        context.convId,
        context.turnId,
        state.iteration,
        toolCall.function.name,
        diagnosis
      );

      return diagnosis;
    } catch (diagError) {
      console.error('[LLMClient] Diagnostic reflection failed:', diagError);
      return null; // Graceful fallback - continue without diagnosis
    }
  }

  /**
   * Build reflection prompt from current state
   *
   * @param {Object} state - Current agent state
   * @param {Object} executor - Tool executor with registry
   * @param {Object} guidance - Guidance data object
   * @returns {string} Complete reflection prompt
   */
  buildReflectionPrompt(state, executor, guidance = {}) {
    const historyArr = Array.isArray(state.history) ? state.history : [];
    const artifactsArr = Array.isArray(state.artifacts) ? state.artifacts : [];
    const reflectionAccuracyArr = Array.isArray(state.reflectionAccuracy) ? state.reflectionAccuracy : [];

    // Increase history depth to 10 iterations with full reasoning
    const historyText = historyArr.length > 0
      ? historyArr.slice(-10).map((h) => {
          const iter = h.iteration;
          let text = `### Iteration ${iter}\n`;
          text += `**Action**: ${h.action}\n`;

          // Include reasoning from previous reflection
          if (h.reasoning) {
            const r = String(h.reasoning);
            text += `**My Reasoning**: "${r.slice(0, 300)}${r.length > 300 ? '...' : ''}"\n`;
          }

          // Show assessment and confidence
          if (h.assessment) {
            text += `**Assessment**: ${h.assessment} | **Confidence**: ${h.confidence} | **Progress**: ${h.progress}%\n`;
          }

          if (h.result != null) {
            const resStr = String(h.result);
            text += `**Result**: ${resStr.slice(0, 300)}${resStr.length > 300 ? '...' : ''}`;
          }

          // Show tools used
          if (h.tools_used && h.tools_used.length > 0) {
            text += `\n**Tools Used**: ${h.tools_used.join(', ')}`;
          }

          return text;
        }).join('\n\n')
      : '(No iterations yet)';

    const artifactsText = artifactsArr.length > 0
      ? artifactsArr.map(a => `- ${a.type}: ${a.path}`).join('\n')
      : '(No artifacts created yet)';

    // Build available tools list from executor's registry
    const availableToolsText = executor && executor.toolRegistry
      ? Array.from(executor.toolRegistry.entries())
          .map(([name, tool]) => `- **${name}**: ${tool.description || 'No description'}`)
          .join('\n')
      : '(Tools list not available)';

    // Detect task type for specialized guidance
    const taskType = this.detectTaskType(state.task);
    const taskGuidance = this.getTaskTypeGuidance(taskType);

    // Extract guidance sections
    const learningsText = guidance.learningsText || '';
    const preferencesText = guidance.preferencesText || '';
    const episodesText = guidance.episodesText || '';
    const successPatternsText = guidance.successPatternsText || '';
    const metaReflectionText = guidance.metaReflectionText || '';
    const planningFeedbackText = guidance.planningFeedbackText || '';
    const toolRecommendationsText = guidance.toolRecommendationsText || '';
    const selfEvalGuidance = guidance.selfEvalGuidance || '';

    // Last iteration's critique if available
    const lastCritique = reflectionAccuracyArr.length > 0
      ? reflectionAccuracyArr[reflectionAccuracyArr.length - 1].metaCritique
      : '';

    // Build failure and repetition warnings
    const failureWarnings = this.buildFailureWarnings(state.recentFailures || []);
    const repetitionWarning = this.buildRepetitionWarning(state);

    return `# Autonomous Task - Self-Assessment

## Original Task
${state.task || ''}

## Task Type Detected: ${taskType}
${taskGuidance}

${toolRecommendationsText}${learningsText}${preferencesText}${episodesText}${successPatternsText}${lastCritique}${metaReflectionText}${planningFeedbackText}${selfEvalGuidance}
${failureWarnings}
${repetitionWarning}

## Current State
- **Iteration**: ${state.iteration ?? 0} / ${guidance.maxIterations || 50}
- **Previous Progress**: ${state.lastProgressPercent ?? 0}%
- **Artifacts Created**: ${artifactsArr.length}
- **Errors Encountered**: ${state.errors ?? 0}

## What You've Done So Far
${historyText}

## Artifacts Created
${artifactsText}

## Available Tools

You have access to the following tools. Use the exact tool names below in your tool_plan:

${availableToolsText}

**IMPORTANT**: When specifying a tool in your tool_plan, you MUST use one of the exact tool names listed above.
For example, use "run_bash" for shell commands, NOT "bash" or "shell".

## Reflection Questions

Please reflect on your progress and respond in JSON format:

1. **What concrete progress have I made?** (Be specific about files created, tests passed, code analyzed, etc.)
2. **What remains to be done to complete the task?** (Break into sub-tasks if multi-step)
3. **What is my next specific action?** (Name exact files, commands, or tools to use)
4. **Am I making progress or am I stuck?** (Consider: Am I repeating actions? Have I learned something new?)
5. **Task completion estimate**: ___%
6. **Confidence in my assessment**: 0.0 - 1.0

## Decision Strategy

**For Multi-Step Tasks**: Break the task into phases. Complete one phase before moving to the next.
**For Research Tasks**: Gather information systematically. Use read_dir to explore, read_file to analyze.
**For Code Generation**: Write, test, verify. Don't claim complete until tests pass.
**For Self-Improvement**: Reflect on what patterns work. Learn from failures.

Based on the above:
- **CONTINUE**: If there's more work to do and I know the next step
- **COMPLETE**: If the task is finished with high confidence (>0.9)
- **STUCK**: If I don't know what to do next or have tried the same thing multiple times

Respond with JSON only:
\`\`\`json
{
  "assessment": "continue|complete|stuck",
  "progress_percent": 0-100,
  "confidence": 0.0-1.0,
  "next_action": "Specific description of next action",
  "reasoning": "Why I chose this assessment and action",
  "tool_plan": {
    "tool": "tool_name",
    "purpose": "why I need this tool"
  }
}
\`\`\``;
  }

  /**
   * Build failure warnings section for reflection prompt
   *
   * @param {Array} recentFailures - Array of recent failure objects
   * @returns {string} Failure warnings text
   */
  buildFailureWarnings(recentFailures) {
    const failures = Array.isArray(recentFailures) ? recentFailures : [];
    if (failures.length === 0) return '';

    let warnings = `\n## ⚠️  Recent Failures - DO NOT REPEAT\n\n`;
    warnings += `The following actions FAILED recently. You MUST try a DIFFERENT approach:\n\n`;

    failures.forEach((failure, idx) => {
      warnings += `${idx + 1}. **${failure.tool}** with args \`${JSON.stringify(failure.args).slice(0, 60)}...\`\n`;
      warnings += `   Error: ${failure.error}\n`;

      // Include diagnostic analysis if available
      if (failure.diagnosis && failure.diagnosis.rootCause) {
        warnings += `\n   🔍 **Root Cause Analysis**:\n`;
        warnings += `   - Category: ${failure.diagnosis.rootCause.category}\n`;
        warnings += `   - Issue: ${failure.diagnosis.rootCause.description}\n`;

        // Show why-chain (condensed)
        if (failure.diagnosis.whyChain) {
          warnings += `   - Why it failed: ${failure.diagnosis.whyChain.why1}\n`;
          warnings += `   - Underlying cause: ${failure.diagnosis.whyChain.why5}\n`;
        }

        // Show recovery strategies
        if (failure.diagnosis.alternatives && failure.diagnosis.alternatives.length > 0) {
          warnings += `\n   💡 **Recommended Recovery Strategies** (in priority order):\n`;
          failure.diagnosis.alternatives.slice(0, 3).forEach((alt, altIdx) => {
            warnings += `   ${altIdx + 1}. ${alt.strategy}: ${alt.description}\n`;
            if (alt.tools && alt.tools.length > 0) {
              warnings += `      Tools to use: ${alt.tools.join(', ')}\n`;
            }
          });
        }
      } else {
        // Fallback to heuristic suggestions if no diagnosis
        warnings += `   → **Try alternative**: `;

        if (failure.tool === 'read_file') {
          warnings += `Use 'find' or 'grep' to search instead, or 'read_dir' to list files first\n`;
        } else if (failure.tool === 'run_bash' && failure.error.includes('not found')) {
          warnings += `Check if path exists with 'read_dir', or use different search pattern\n`;
        } else if (failure.tool === 'run_bash') {
          warnings += `Verify command syntax, check for typos, or try a simpler command\n`;
        } else {
          warnings += `Try a broader approach or use a different tool\n`;
        }
      }
      warnings += `\n`;
    });

    warnings += `**IMPORTANT**: If you see yourself about to repeat any of the above, STOP and choose a completely different strategy.\n`;
    warnings += `**SUCCESS PATTERN**: When one approach fails, the ROOT CAUSE analysis above shows WHY it failed and WHAT to try instead.\n`;

    return warnings;
  }

  /**
   * Build repetition warning section for reflection prompt
   *
   * @param {Object} state - Current agent state
   * @returns {string} Repetition warning text
   */
  buildRepetitionWarning(state) {
    if (!state.repetitiveActionDetected && !state.toolDiversityNeeded) return '';

    let warning = `\n## 🔁 REPETITION DETECTED\n\n`;

    if (state.toolDiversityNeeded && state.overusedTool) {
      warning += `⚠️  **TOOL DIVERSITY ISSUE**: You have used the tool "${state.overusedTool}" 3+ times.\n\n`;
      warning += `This suggests your approach is FUNDAMENTALLY WRONG.\n\n`;
      warning += `**You MUST try a DIFFERENT tool now:**\n`;
      warning += `- If you were using http_fetch → try run_bash with git/gh clone\n`;
      warning += `- If you were using read_file → try run_bash with cat/grep\n`;
      warning += `- If you were using one API → try a different approach entirely\n\n`;
      warning += `**DO NOT** use "${state.overusedTool}" again this iteration!\n\n`;
    }

    if (state.repetitiveActionDetected) {
      warning += `You have been trying the same action multiple times without success.\n`;
      warning += `This is a clear sign you are STUCK.\n\n`;
    }

    warning += `Choose ONE:\n`;
    warning += `1. Try a COMPLETELY DIFFERENT approach with DIFFERENT tools (recommended)\n`;
    warning += `2. Assess as "stuck" if you cannot think of alternatives\n\n`;

    return warning;
  }

  /**
   * Build tool recommendations guidance from historical data
   *
   * @param {Array} toolRecommendations - Tool recommendations array
   * @param {string} taskType - Detected task type
   * @returns {string} Tool recommendations text
   */
  buildToolRecommendationsGuidance(toolRecommendations, taskType) {
    if (!toolRecommendations || toolRecommendations.length === 0) {
      return '';
    }

    let guidance = `\n## 🔧 Tool Recommendations (Historical Data)\n\n`;
    guidance += `Based on ${toolRecommendations.reduce((sum, r) => sum + r.sampleSize, 0)} historical attempts for "${taskType}" tasks:\n\n`;

    toolRecommendations.forEach((rec, idx) => {
      const rank = idx + 1;
      const emoji = rec.successRate >= 0.8 ? '✅' : rec.successRate >= 0.5 ? '⚠️' : '❌';

      guidance += `${rank}. ${emoji} **${rec.tool}** - ${(rec.successRate * 100).toFixed(0)}% success rate\n`;
      guidance += `   ${rec.reason}\n`;

      if (rec.successRate >= 0.8 && rec.sampleSize >= 5) {
        guidance += `   **STRONG RECOMMENDATION**: Proven approach with high success rate\n`;
      } else if (rec.successRate < 0.3 && rec.sampleSize >= 3) {
        guidance += `   **AVOID**: Low success rate, try alternatives first\n`;
      }

      guidance += `\n`;
    });

    // Add strategic advice
    const bestTool = toolRecommendations[0];
    const worstTool = toolRecommendations[toolRecommendations.length - 1];

    guidance += `**Strategic Advice**:\n`;

    if (bestTool.successRate >= 0.8) {
      guidance += `- Start with **${bestTool.tool}** - proven to work ${bestTool.sampleSize} times\n`;
    } else if (bestTool.successRate >= 0.5) {
      guidance += `- **${bestTool.tool}** has moderate success - use but have backup plan\n`;
    }

    if (worstTool.successRate < 0.3 && worstTool.sampleSize >= 3) {
      guidance += `- Avoid **${worstTool.tool}** - failed ${worstTool.sampleSize - Math.round(worstTool.sampleSize * worstTool.successRate)} times out of ${worstTool.sampleSize}\n`;
    }

    guidance += `\n**Important**: These recommendations are based on historical success rates. `;
    guidance += `Trust the data - don't repeat failed approaches.\n\n`;

    return guidance;
  }

  /**
   * Build relevant episodes guidance for reflection prompt
   *
   * @param {Array} relevantEpisodes - Array of relevant episode objects
   * @returns {string} Episodes guidance text
   */
  buildEpisodesGuidance(relevantEpisodes) {
    if (!relevantEpisodes || relevantEpisodes.length === 0) return '';

    let guidance = `\n## 📚 Relevant Past Episodes (Semantic Search)\n\n`;
    guidance += `Found ${relevantEpisodes.length} similar successful session(s):\n\n`;

    for (const { episode, score } of relevantEpisodes) {
      guidance += `### Episode (similarity: ${(score * 100).toFixed(0)}%)\n`;
      guidance += `**Task**: ${episode.task.slice(0, 100)}${episode.task.length > 100 ? '...' : ''}\n`;
      guidance += `**Strategy**: ${episode.strategy || 'N/A'}\n`;
      guidance += `**Tools Used**: ${episode.tools_used.join(', ')}\n`;
      guidance += `**Iterations**: ${episode.iterations}\n`;

      if (episode.summary) {
        guidance += `**Summary**: ${episode.summary.slice(0, 150)}${episode.summary.length > 150 ? '...' : ''}\n`;
      }

      guidance += `\n`;
    }

    guidance += `**How to use**: These episodes show what worked for similar tasks. ` +
      `Consider using similar strategies, tools, or approaches.\n\n`;

    return guidance;
  }

  /**
   * Format past learnings for reflection prompt
   *
   * @param {Array} learnings - Array of learning objects
   * @returns {string} Formatted learnings text
   */
  formatPastLearnings(learnings) {
    if (learnings.length === 0) return '';

    const toolCounts = {};
    learnings.forEach(l => {
      l.tools_used.forEach(tool => {
        toolCounts[tool] = (toolCounts[tool] || 0) + 1;
      });
    });

    const topTools = Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tool]) => tool);

    const avgIterations = Math.round(
      learnings.reduce((sum, l) => sum + l.iterations, 0) / learnings.length
    );

    return `## Past Learnings (${learnings.length} successful sessions)
- **Effective tools**: ${topTools.join(', ')}
- **Typical iterations needed**: ~${avgIterations}
- **Success strategies**: ${learnings[0].strategy}

Use these learnings to inform your approach.
`;
  }

  /**
   * Detect task type for specialized handling
   *
   * @param {string} task - Task description
   * @returns {string} Task type
   */
  detectTaskType(task) {
    const safe = String(task || '');
    const lower = safe.toLowerCase();
    if (!safe.trim()) return 'simple';

    // Exploratory/uncertain tasks (check FIRST - highest priority for vague tasks)
    const exploratoryPatterns = [
      /see\s+if/i,
      /check\s+(whether|if)/i,
      /find\s+out/i,
      /look\s+(for|in)/i,
      /do\s+you\s+have/i,
      /are\s+there/i,
      /locate/i,
      /search\s+for/i,
    ];

    if (exploratoryPatterns.some(pattern => pattern.test(task))) {
      return 'exploratory';
    }

    // Check documentation first (more specific than research)
    if (lower.includes('readme') || lower.includes('documentation') || lower.includes('docs')) {
      return 'documentation';
    }

    // Research tasks
    if (lower.includes('analyze') || lower.includes('research') || lower.includes('find') || lower.includes('document')) {
      return 'research';
    }

    // Multi-step with tests
    if (lower.includes('test') && (lower.includes('create') || lower.includes('write'))) {
      return 'multi-step';
    }

    // Self-improvement
    if (lower.includes('refactor') || lower.includes('improve') || lower.includes('optimize')) {
      return 'self-improvement';
    }

    // Multi-step indicators
    if (lower.includes('multiple') || lower.includes('several') || lower.match(/\d+\s+(files|functions|tests)/)) {
      return 'multi-step';
    }

    return 'simple';
  }

  /**
   * Get guidance for specific task types
   *
   * @param {string} taskType - Task type
   * @returns {string} Task-specific guidance
   */
  getTaskTypeGuidance(taskType) {
    switch (taskType) {
      case 'exploratory':
        return `**Exploratory Search Guidance**:
1. Start VERY broad - explore directory structure with read_dir
2. Use find and grep to search by keywords from the task
3. Review search results and identify promising matches
4. Read specific files that look relevant
5. Synthesize findings - what did you discover?

⚠️  DO NOT get stuck on a single file - if it doesn't exist, move on immediately
⚠️  Use MULTIPLE tools in parallel (find + grep together)
⚠️  Broaden search if initial keywords yield nothing`;

      case 'research':
        return `**Research Task Guidance**:
1. Start with read_dir to explore directory structure
2. Use read_file to examine relevant files
3. Look for patterns across multiple files
4. Summarize findings systematically`;

      case 'multi-step':
        return `**Multi-Step Task Guidance**:
1. Break task into sequential phases (design → implement → test → verify)
2. Complete one phase fully before moving to next
3. Track dependencies between steps
4. Don't skip verification steps`;

      case 'self-improvement':
        return `**Self-Improvement Task Guidance**:
1. Analyze current code/memory patterns
2. Identify specific improvements needed
3. Make incremental changes
4. Verify improvements work before proceeding`;

      case 'documentation':
        return `**Documentation Task Guidance**:
1. Explore codebase structure first
2. Read key files to understand purpose
3. Identify main components and their relationships
4. Write clear, structured documentation`;

      default:
        return `**General Task Guidance**:
1. Make one focused change at a time
2. Verify each change works
3. Build incrementally toward goal`;
    }
  }
}
