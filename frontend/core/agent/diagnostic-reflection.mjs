/**
 * Diagnostic Reflection - "5 Whys" Root Cause Analysis
 *
 * Analyzes tool failures through iterative "why" questioning to identify
 * root causes and generate recovery strategies.
 *
 * Flow:
 * 1. Capture full error context (stdout, stderr, workspace state)
 * 2. Generate "5 Whys" reflection prompt
 * 3. LLM analyzes failure and identifies root cause
 * 4. Generate alternative approaches and recovery plan
 * 5. Return structured diagnosis
 */

import { ulid } from 'ulid';

/**
 * @typedef {Object} FailureContext
 * @property {Object} toolCall - The failed tool call
 * @property {Object} error - Error information
 * @property {string} error.message - Error message
 * @property {number} [error.code] - Exit code (for shell tools)
 * @property {string} [error.stdout] - Standard output
 * @property {string} [error.stderr] - Standard error
 * @property {string} [error.signal] - Signal (if killed)
 * @property {number} iteration - Current iteration number
 * @property {Array} previousActions - Last 3-5 actions
 * @property {Array<string>} availableTools - Tools currently allowed
 * @property {Object} workspaceState - Current workspace files/dirs
 * @property {string} taskGoal - Original user task
 */

/**
 * @typedef {Object} Diagnosis
 * @property {string} id - Unique diagnosis ID
 * @property {string} timestamp - ISO-8601 timestamp
 * @property {number} iteration - Iteration where failure occurred
 * @property {Object} whyChain - Five levels of "why" analysis
 * @property {Object} rootCause - Root cause classification
 * @property {Object} errorClassification - Error type and severity
 * @property {Array} alternatives - Alternative strategies (3+)
 * @property {Object} recoveryPlan - Prioritized recovery plan
 * @property {Object} learningOpportunity - Pattern to store for future
 */

/**
 * Error classification taxonomy
 */
const ERROR_CATEGORIES = {
  TOOL_NOT_FOUND: 'tool_not_found',
  COMMAND_NOT_FOUND: 'command_not_found',
  PERMISSION_DENIED: 'permission_denied',
  INVALID_ARGUMENTS: 'invalid_arguments',
  TIMEOUT: 'timeout',
  OUTPUT_TOO_LARGE: 'output_too_large',
  RATE_LIMITED: 'rate_limited',
  NETWORK_ERROR: 'network_error',
  SYNTAX_ERROR: 'syntax_error',
  ENVIRONMENT_MISSING: 'environment_missing',
  UNKNOWN: 'unknown',
};

/**
 * Error severity levels
 */
const ERROR_SEVERITY = {
  RECOVERABLE: 'recoverable',
  USER_ACTION_REQUIRED: 'user_action_required',
  FATAL: 'fatal',
};

/**
 * Create diagnostic reflection system
 *
 * @param {Object} llmClient - LLM client for analysis
 * @param {string} model - Model to use
 * @param {Object} [config] - Configuration
 * @returns {Object} Diagnostic reflection interface
 */
export function createDiagnosticReflection(llmClient, model, config = {}) {
  const whyDepth = config.whyDepth || 5;
  const temperature = config.temperature || 0.2; // More deterministic
  const maxTokens = config.maxTokens || 1024;

  /**
   * Run diagnostic reflection on a tool failure
   *
   * @param {FailureContext} context - Failure context
   * @returns {Promise<Diagnosis>} Structured diagnosis
   */
  async function runDiagnosticReflection(context) {
    console.log(`[DiagnosticReflection] Analyzing failure: ${context.toolCall?.function?.name || 'unknown'}`);

    // Quick classification first (heuristic-based, fast)
    const quickClassification = classifyErrorQuick(context);

    // Build comprehensive diagnostic prompt
    const prompt = buildDiagnosticPrompt(context, quickClassification);

    try {
      // Call LLM for deep analysis
      const response = await llmClient.chat({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert diagnostic analyst. Analyze failures systematically using root cause analysis. Always respond with valid JSON matching the schema provided.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      });

      // Parse structured diagnosis
      const diagnosisData = JSON.parse(response.choices[0].message.content);

      // Build complete diagnosis object
      const diagnosis = {
        id: ulid(),
        timestamp: new Date().toISOString(),
        iteration: context.iteration,
        whyChain: diagnosisData.why_chain || {},
        rootCause: {
          category: diagnosisData.root_cause?.category || quickClassification.type,
          description: diagnosisData.root_cause?.description || 'Unknown root cause',
          confidence: diagnosisData.root_cause?.confidence || 0.5,
        },
        errorClassification: {
          type: quickClassification.type,
          severity: quickClassification.severity,
          canRecover: diagnosisData.can_recover !== false,
        },
        alternatives: diagnosisData.alternatives || [],
        recoveryPlan: diagnosisData.recovery_plan || null,
        learningOpportunity: diagnosisData.learning_opportunity || null,
      };

      console.log(`[DiagnosticReflection] Root cause: ${diagnosis.rootCause.category} (confidence: ${diagnosis.rootCause.confidence})`);
      console.log(`[DiagnosticReflection] Recovery strategies: ${diagnosis.alternatives.length}`);

      return diagnosis;
    } catch (error) {
      console.error('[DiagnosticReflection] Analysis failed:', error);

      // Fallback: return basic diagnosis based on quick classification
      return buildFallbackDiagnosis(context, quickClassification);
    }
  }

  /**
   * Classify error quickly using heuristics (no LLM call)
   *
   * @param {FailureContext} context
   * @returns {Object} Quick classification
   */
  function classifyErrorQuick(context) {
    const errorMsg = context.error?.message || '';
    const stderr = context.error?.stderr || '';
    const exitCode = context.error?.code;
    const toolName = context.toolCall?.function?.name || 'unknown';

    // Command not found (exit code 127)
    if (exitCode === 127 || stderr.includes('command not found') || stderr.includes('not found')) {
      return {
        type: ERROR_CATEGORIES.COMMAND_NOT_FOUND,
        severity: ERROR_SEVERITY.RECOVERABLE,
        reason: 'Binary or command not available in environment',
      };
    }

    // Permission denied
    if (errorMsg.includes('permission denied') || stderr.includes('Permission denied')) {
      return {
        type: ERROR_CATEGORIES.PERMISSION_DENIED,
        severity: ERROR_SEVERITY.RECOVERABLE,
        reason: 'Insufficient permissions for operation',
      };
    }

    // Tool not found
    if (errorMsg.includes('Unknown tool') || errorMsg.includes('Tool not found')) {
      return {
        type: ERROR_CATEGORIES.TOOL_NOT_FOUND,
        severity: ERROR_SEVERITY.RECOVERABLE,
        reason: 'Requested tool not in allowlist',
      };
    }

    // Timeout
    if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
      return {
        type: ERROR_CATEGORIES.TIMEOUT,
        severity: ERROR_SEVERITY.RECOVERABLE,
        reason: 'Operation exceeded time limit',
      };
    }

    // Invalid arguments
    if (errorMsg.includes('Missing required parameter') || errorMsg.includes('should be')) {
      return {
        type: ERROR_CATEGORIES.INVALID_ARGUMENTS,
        severity: ERROR_SEVERITY.RECOVERABLE,
        reason: 'Tool parameters incorrect or malformed',
      };
    }

    // Generic fallback
    return {
      type: ERROR_CATEGORIES.UNKNOWN,
      severity: ERROR_SEVERITY.RECOVERABLE,
      reason: 'Unclassified error',
    };
  }

  /**
   * Build diagnostic reflection prompt
   *
   * @param {FailureContext} context
   * @param {Object} quickClassification
   * @returns {string} Prompt
   */
  function buildDiagnosticPrompt(context, quickClassification) {
    const toolName = context.toolCall?.function?.name || 'unknown';
    const toolArgs = context.toolCall?.function?.arguments || {};
    const errorMsg = context.error?.message || 'Unknown error';
    const stderr = context.error?.stderr || '';
    const stdout = context.error?.stdout || '';
    const exitCode = context.error?.code || null;

    const previousActionsText = context.previousActions
      ?.map((a, i) => `  ${i + 1}. Tool: ${a.tool}, Success: ${a.success}, Result: ${a.result?.substring(0, 100)}...`)
      .join('\n') || '  (none)';

    const availableToolsText = context.availableTools?.join(', ') || '(unknown)';

    const workspaceFiles = context.workspaceState?.files?.length || 0;
    const workspaceDirs = context.workspaceState?.directories?.length || 0;

    return `# Diagnostic Reflection: Root Cause Analysis

## Task Goal
${context.taskGoal}

## Iteration
${context.iteration}

## Tool Failure
**Tool**: ${toolName}
**Arguments**: ${JSON.stringify(toolArgs, null, 2)}
**Error Message**: ${errorMsg}
${exitCode !== null ? `**Exit Code**: ${exitCode}` : ''}
${stdout ? `**Stdout**:\n${stdout.substring(0, 500)}` : ''}
${stderr ? `**Stderr**:\n${stderr.substring(0, 500)}` : ''}

## Quick Classification (Heuristic)
**Type**: ${quickClassification.type}
**Severity**: ${quickClassification.severity}
**Reason**: ${quickClassification.reason}

## Context

### Previous Actions (Last ${context.previousActions?.length || 0})
${previousActionsText}

### Available Tools
${availableToolsText}

### Workspace State
- Files: ${workspaceFiles}
- Directories: ${workspaceDirs}

## Your Task: "5 Whys" Root Cause Analysis

Analyze this failure systematically by asking "why" iteratively until you reach the fundamental root cause.

**Output JSON Schema**:
{
  "why_chain": {
    "why1": "What directly failed? (immediate cause)",
    "why2": "Why did that happen? (contributing factor)",
    "why3": "What assumption or gap enabled that? (systemic issue)",
    "why4": "Why wasn't there a fallback or prevention? (process gap)",
    "why5": "What's the fundamental root cause? (core issue)"
  },
  "root_cause": {
    "category": "${Object.values(ERROR_CATEGORIES).join(' | ')}",
    "description": "Clear explanation of the root cause",
    "confidence": 0.0-1.0
  },
  "can_recover": true/false,
  "alternatives": [
    {
      "strategy": "descriptive_name",
      "tools": ["tool1", "tool2"],
      "description": "What to do",
      "confidence": 0.0-1.0,
      "estimated_iterations": 1-5
    }
  ],
  "recovery_plan": {
    "priority": 1,
    "strategy": "name of best strategy",
    "steps": [
      {
        "action": "What to do",
        "tool": "tool_name",
        "args": {},
        "expected_outcome": "What should happen"
      }
    ],
    "fallback_chain": ["strategy2", "strategy3", "ask_user"]
  },
  "learning_opportunity": {
    "pattern": "descriptive_pattern_name",
    "rule": "When X happens, do Y",
    "applicable_task_types": ["task_type1", "task_type2"],
    "generalizability": 0.0-1.0
  }
}

**Guidelines**:
1. Be specific and concrete in your "why" analysis
2. Suggest at least 3 alternative strategies using available tools
3. Prioritize strategies by confidence and simplicity
4. Think creatively about workarounds (e.g., if git fails, try curl + tar)
5. Only suggest asking the user as a last resort
6. Make the recovery plan actionable with specific tool calls

**Available Tools for Recovery**: ${availableToolsText}

Respond with ONLY the JSON object, no additional text.`;
  }

  /**
   * Build fallback diagnosis when LLM analysis fails
   *
   * @param {FailureContext} context
   * @param {Object} quickClassification
   * @returns {Diagnosis}
   */
  function buildFallbackDiagnosis(context, quickClassification) {
    console.warn('[DiagnosticReflection] Using fallback diagnosis (LLM analysis failed)');

    const toolName = context.toolCall?.function?.name || 'unknown';

    // Generate basic alternatives based on error type
    const alternatives = generateFallbackAlternatives(quickClassification, toolName, context.availableTools);

    return {
      id: ulid(),
      timestamp: new Date().toISOString(),
      iteration: context.iteration,
      whyChain: {
        why1: `Tool '${toolName}' execution failed`,
        why2: quickClassification.reason,
        why3: 'Error details limited',
        why4: 'No automated fallback prepared',
        why5: 'Insufficient error handling',
      },
      rootCause: {
        category: quickClassification.type,
        description: quickClassification.reason,
        confidence: 0.5,
      },
      errorClassification: {
        type: quickClassification.type,
        severity: quickClassification.severity,
        canRecover: true,
      },
      alternatives,
      recoveryPlan: alternatives.length > 0 ? {
        priority: 1,
        strategy: alternatives[0].strategy,
        steps: [],
        fallbackChain: alternatives.slice(1).map(a => a.strategy).concat(['ask_user']),
      } : null,
      learningOpportunity: {
        pattern: `${quickClassification.type}_recovery`,
        rule: `When ${quickClassification.type} occurs, try alternative tools or ask user`,
        applicableTaskTypes: ['general'],
        generalizability: 0.3,
      },
    };
  }

  /**
   * Generate fallback alternatives based on error type
   *
   * @param {Object} classification
   * @param {string} toolName
   * @param {Array<string>} availableTools
   * @returns {Array}
   */
  function generateFallbackAlternatives(classification, toolName, availableTools = []) {
    const alternatives = [];

    switch (classification.type) {
      case ERROR_CATEGORIES.COMMAND_NOT_FOUND:
        // Suggest alternative tools
        if (availableTools.includes('run_bash')) {
          alternatives.push({
            strategy: 'try_alternative_command',
            tools: ['run_bash'],
            description: 'Try alternative command or download tool manually',
            confidence: 0.6,
            estimatedIterations: 2,
          });
        }
        alternatives.push({
          strategy: 'ask_user_for_setup',
          tools: [],
          description: 'Ask user to install required command or provide alternative',
          confidence: 0.8,
          estimatedIterations: 1,
        });
        break;

      case ERROR_CATEGORIES.TOOL_NOT_FOUND:
        // List available alternatives
        const toolAlternatives = availableTools.filter(t => t !== toolName).slice(0, 3);
        if (toolAlternatives.length > 0) {
          alternatives.push({
            strategy: 'use_alternative_tool',
            tools: toolAlternatives,
            description: `Try using: ${toolAlternatives.join(', ')}`,
            confidence: 0.7,
            estimatedIterations: 1,
          });
        }
        break;

      case ERROR_CATEGORIES.PERMISSION_DENIED:
        if (availableTools.includes('read_dir')) {
          alternatives.push({
            strategy: 'check_sandbox_boundaries',
            tools: ['read_dir'],
            description: 'Verify sandbox boundaries and try allowed directory',
            confidence: 0.7,
            estimatedIterations: 2,
          });
        }
        alternatives.push({
          strategy: 'ask_user_for_permissions',
          tools: [],
          description: 'Request user to adjust permissions or change approach',
          confidence: 0.8,
          estimatedIterations: 1,
        });
        break;

      case ERROR_CATEGORIES.TIMEOUT:
        alternatives.push({
          strategy: 'reduce_scope',
          tools: [toolName],
          description: 'Retry with smaller scope or simpler parameters',
          confidence: 0.6,
          estimatedIterations: 2,
        });
        break;

      default:
        // Generic fallback
        alternatives.push({
          strategy: 'retry_with_modifications',
          tools: [toolName],
          description: 'Retry with modified parameters',
          confidence: 0.4,
          estimatedIterations: 1,
        });
        alternatives.push({
          strategy: 'ask_user_for_help',
          tools: [],
          description: 'Request user clarification or assistance',
          confidence: 0.9,
          estimatedIterations: 1,
        });
    }

    return alternatives;
  }

  return {
    runDiagnosticReflection,
    classifyErrorQuick,
    ERROR_CATEGORIES,
    ERROR_SEVERITY,
  };
}
