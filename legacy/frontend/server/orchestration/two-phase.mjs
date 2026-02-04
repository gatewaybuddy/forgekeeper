/**
 * Two-Phase Harmony Mode Orchestration
 *
 * Separates analysis/planning from execution for better control over high-stakes operations.
 *
 * Phase 1 (Analysis): Generate detailed plan, halt for user review
 * Phase 2 (Execution): Execute based on approved plan (with optional edits)
 *
 * Use cases:
 * - High-stakes code changes
 * - Complex refactoring requiring review
 * - Learning mode (see plan before execution)
 * - Multi-step operations requiring approval
 */

import { orchestrateWithTools } from './orchestrator.mjs';

/**
 * Get two-phase configuration from environment
 */
export function getTwoPhaseConfig() {
  return {
    enabled: process.env.FRONTEND_ENABLE_TWO_PHASE === '1',
    autoDetect: process.env.FRONTEND_AUTO_TWO_PHASE === '1',
    // Min confidence for auto-detection (0.0-1.0)
    autoThreshold: parseFloat(process.env.FRONTEND_AUTO_TWO_PHASE_THRESHOLD || '0.6'),
    // Phase 1: Max tokens for analysis generation
    analysisMaxTokens: parseInt(process.env.FRONTEND_TWO_PHASE_ANALYSIS_TOKENS || '4096', 10),
    // Phase 2: Max tokens for execution
    executionMaxTokens: parseInt(process.env.FRONTEND_TWO_PHASE_EXECUTION_TOKENS || '8192', 10),
    // Allow user to edit plan before Phase 2
    allowPlanEditing: process.env.FRONTEND_TWO_PHASE_ALLOW_EDIT !== '0', // Default: true
  };
}

/**
 * Detect if two-phase mode should be triggered based on request content
 *
 * Heuristics:
 * - Keywords: "refactor", "rewrite", "restructure", "migration"
 * - High-stakes: "production", "deploy", "release", "critical"
 * - Complex operations: "multiple files", "large changes"
 * - Explicit: "show me a plan", "what would you do"
 */
export function detectTwoPhaseMode(userMessage, context = {}) {
  if (!userMessage || typeof userMessage !== 'string') {
    return { shouldUse: false, confidence: 0.0, reason: 'No content to analyze' };
  }

  const text = userMessage.toLowerCase();
  const matches = [];
  let confidence = 0.0;

  // High-stakes operations (weight: 0.4)
  const highStakesPatterns = [
    /\b(production|deploy|deployment|release|critical|important)\b/i,
    /\b(refactor|rewrite|restructure|redesign|migrate|migration)\b/i,
    /\b(delete|remove|drop|destroy)\s+(database|table|production|all)\b/i,
  ];

  for (const pattern of highStakesPatterns) {
    if (pattern.test(text)) {
      confidence += 0.4;
      matches.push({ pattern: pattern.toString(), category: 'highStakes', weight: 0.4 });
      break; // Only count once
    }
  }

  // Complex operations (weight: 0.3)
  const complexityPatterns = [
    /\b(multiple files|many files|several files|across files)\b/i,
    /\b(large change|large refactor|significant change)\b/i,
    /\b(entire|whole|all|every)\s+(codebase|project|system|module)\b/i,
  ];

  for (const pattern of complexityPatterns) {
    if (pattern.test(text)) {
      confidence += 0.3;
      matches.push({ pattern: pattern.toString(), category: 'complexity', weight: 0.3 });
      break;
    }
  }

  // Explicit plan requests (weight: 0.5)
  const explicitPatterns = [
    /\b(show\s+(me\s+)?a\s+plan|create\s+a\s+plan|what\s+would\s+you\s+do)\b/i,
    /\b(before\s+you\s+(start|begin|execute|run|do))\b/i,
    /\b(explain\s+(your\s+)?approach|outline\s+(your\s+)?strategy)\b/i,
    /\b(step-by-step\s+plan|detailed\s+plan)\b/i,
  ];

  for (const pattern of explicitPatterns) {
    if (pattern.test(text)) {
      confidence += 0.5;
      matches.push({ pattern: pattern.toString(), category: 'explicit', weight: 0.5 });
      break;
    }
  }

  // Previous incomplete or error context (weight: 0.2)
  if (context.previousIncomplete || context.previousError) {
    confidence += 0.2;
    matches.push({ category: 'context', weight: 0.2 });
  }

  // Cap at 1.0
  confidence = Math.min(confidence, 1.0);

  const config = getTwoPhaseConfig();
  const shouldUse = confidence >= config.autoThreshold;

  return {
    shouldUse,
    confidence,
    matches,
    reason: shouldUse
      ? `High-stakes or complex operation detected (confidence: ${confidence.toFixed(2)})`
      : `Confidence too low for two-phase mode (${confidence.toFixed(2)} < ${config.autoThreshold})`,
  };
}

/**
 * Phase 1: Generate analysis/plan
 * Returns a detailed plan for user review
 */
export async function orchestratePhase1Analysis({
  baseUrl,
  model,
  messages,
  tools,
  maxTokens,
  temperature,
  topP,
  presencePenalty,
  frequencyPenalty,
  traceId,
  convId,
  tailEventsFn,
  appendEventFn,
}) {
  const config = getTwoPhaseConfig();
  const analysisMaxTokens = maxTokens || config.analysisMaxTokens;

  // Build analysis prompt
  const analysisPrompt = buildPhase1AnalysisPrompt(messages);

  // Call orchestrator with analysis-focused instructions
  const result = await orchestrateWithTools({
    baseUrl,
    model,
    messages: analysisPrompt,
    tools: [], // No tools in Phase 1 - analysis only
    maxIterations: 2, // Keep it short
    maxTokens: analysisMaxTokens,
    temperature,
    topP,
    presencePenalty,
    frequencyPenalty,
    traceId,
    convId,
    tailEventsFn,
    appendEventFn,
  });

  // Extract plan from response
  const plan = result.assistant?.content || '';
  const reasoning = result.assistant?.reasoning || null;

  return {
    phase: 1,
    plan,
    reasoning,
    status: 'awaiting_approval',
    debug: result.debug,
  };
}

/**
 * Phase 2: Execute based on approved plan
 */
export async function orchestratePhase2Execution({
  baseUrl,
  model,
  originalMessages,
  approvedPlan,
  planEdits,
  tools,
  maxTokens,
  temperature,
  topP,
  presencePenalty,
  frequencyPenalty,
  traceId,
  convId,
  tailEventsFn,
  appendEventFn,
}) {
  const config = getTwoPhaseConfig();
  const executionMaxTokens = maxTokens || config.executionMaxTokens;

  // Build execution prompt with approved plan
  const executionPrompt = buildPhase2ExecutionPrompt(
    originalMessages,
    approvedPlan,
    planEdits
  );

  // Call orchestrator with full tool access
  const result = await orchestrateWithTools({
    baseUrl,
    model,
    messages: executionPrompt,
    tools, // Full tool access in Phase 2
    maxIterations: 8, // More iterations for execution
    maxTokens: executionMaxTokens,
    temperature,
    topP,
    presencePenalty,
    frequencyPenalty,
    traceId,
    convId,
    tailEventsFn,
    appendEventFn,
  });

  return {
    phase: 2,
    content: result.assistant?.content || '',
    reasoning: result.assistant?.reasoning || null,
    status: 'completed',
    debug: result.debug,
  };
}

/**
 * Build Phase 1 analysis prompt
 * Instructs the model to generate a detailed plan without execution
 */
function buildPhase1AnalysisPrompt(messages) {
  const lastUserMessage = [...messages].reverse().find(m => m?.role === 'user');
  const userRequest = lastUserMessage?.content || '';

  const analysisInstruction = {
    role: 'system',
    content: [
      'You are in TWO-PHASE MODE - Phase 1: Analysis.',
      '',
      'Your task is to ANALYZE the user\'s request and create a DETAILED PLAN, but DO NOT execute anything yet.',
      '',
      'Your response should include:',
      '1. **Understanding**: Restate what the user is asking for',
      '2. **Approach**: High-level strategy to accomplish the goal',
      '3. **Detailed Steps**: Numbered list of specific actions you would take',
      '4. **Risks & Considerations**: Potential issues or important notes',
      '5. **Expected Outcome**: What the final result will look like',
      '',
      'Format your plan clearly with headings and numbered steps.',
      'Be specific about what tools you would use and what changes you would make.',
      '',
      '⚠️ IMPORTANT: This is PHASE 1 - Create the plan only. Do not execute any tools or make any changes.',
      'The user will review your plan and may edit it before approving Phase 2 (execution).',
    ].join('\n'),
  };

  // Keep system messages, add analysis instruction, keep conversation
  const systemMessages = messages.filter(m => m?.role === 'system');
  const conversationMessages = messages.filter(m => m?.role !== 'system');

  return [
    ...systemMessages,
    analysisInstruction,
    ...conversationMessages,
  ];
}

/**
 * Build Phase 2 execution prompt
 * Provides the approved plan and instructs execution
 */
function buildPhase2ExecutionPrompt(originalMessages, approvedPlan, planEdits) {
  const lastUserMessage = [...originalMessages].reverse().find(m => m?.role === 'user');

  const executionInstruction = {
    role: 'system',
    content: [
      'You are in TWO-PHASE MODE - Phase 2: Execution.',
      '',
      'The user has reviewed and approved your plan from Phase 1.',
      planEdits ? '⚠️ The user made edits to the plan. Follow the EDITED version below.' : '',
      '',
      '**Approved Plan:**',
      '```',
      planEdits || approvedPlan,
      '```',
      '',
      'Now EXECUTE this plan step-by-step:',
      '- Use the appropriate tools to make the changes',
      '- Follow the plan precisely',
      '- Report progress as you complete each step',
      '- If you encounter unexpected issues, explain and adjust as needed',
      '',
      'You now have full access to tools. Begin execution.',
    ].join('\n'),
  };

  // Keep system messages, add execution instruction, keep original request
  const systemMessages = originalMessages.filter(m => m?.role === 'system');

  return [
    ...systemMessages,
    executionInstruction,
    lastUserMessage,
  ];
}

/**
 * Combined orchestration that handles both phases
 * Returns phase 1 result if awaiting approval, otherwise completes phase 2
 */
export async function orchestrateTwoPhase({
  baseUrl,
  model,
  messages,
  tools,
  phase = 1, // Start with phase 1 by default
  approvedPlan = null,
  planEdits = null,
  maxTokens,
  temperature,
  topP,
  presencePenalty,
  frequencyPenalty,
  traceId,
  convId,
  tailEventsFn,
  appendEventFn,
}) {
  const t0 = Date.now();

  // Phase 1: Generate analysis/plan
  if (phase === 1) {
    const result = await orchestratePhase1Analysis({
      baseUrl,
      model,
      messages,
      tools,
      maxTokens,
      temperature,
      topP,
      presencePenalty,
      frequencyPenalty,
      traceId,
      convId,
      tailEventsFn,
      appendEventFn,
    });

    result.elapsed_ms = Date.now() - t0;
    return result;
  }

  // Phase 2: Execute based on approved plan
  if (phase === 2) {
    if (!approvedPlan) {
      throw new Error('Phase 2 requires an approved plan from Phase 1');
    }

    const result = await orchestratePhase2Execution({
      baseUrl,
      model,
      originalMessages: messages,
      approvedPlan,
      planEdits,
      tools,
      maxTokens,
      temperature,
      topP,
      presencePenalty,
      frequencyPenalty,
      traceId,
      convId,
      tailEventsFn,
      appendEventFn,
    });

    result.elapsed_ms = Date.now() - t0;
    return result;
  }

  throw new Error(`Invalid phase: ${phase}. Must be 1 or 2.`);
}

/**
 * Check if two-phase mode is enabled via env
 */
export function isTwoPhaseEnabled() {
  return getTwoPhaseConfig().enabled;
}

/**
 * Check if auto-detection is enabled
 */
export function isAutoDetectEnabled() {
  return getTwoPhaseConfig().autoDetect;
}
