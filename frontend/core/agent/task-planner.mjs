/**
 * Task Planner - "5 Hows" Instruction Generation
 * [T400] ADR-0004: Intelligent Task Planning
 *
 * Takes high-level actions and generates detailed, step-by-step instructions
 * using the LLM's full reasoning capability - the same way it instructs users.
 *
 * Key Principle: "The agent should instruct itself the same way it instructs users."
 *
 * Flow:
 * 1. Receive high-level action from reflection (e.g., "Clone repository")
 * 2. Build comprehensive planning prompt with context
 * 3. LLM generates detailed instructions with tools, args, error handling
 * 4. Validate and structure the response
 * 5. Return executable instruction plan
 */

import { ulid } from 'ulid';

/**
 * @typedef {Object} PlanningContext
 * @property {string} taskGoal - Original user task
 * @property {Array<Object>} availableTools - Tools with names and descriptions
 * @property {string} cwd - Current working directory
 * @property {number} iteration - Current iteration number
 * @property {Array<Object>} previousActions - Last 3-5 actions
 * @property {Array<Object>} [recentFailures] - Recent failures with context
 */

/**
 * @typedef {Object} InstructionStep
 * @property {number} step_number - Step sequence number
 * @property {string} description - Clear description of what to do
 * @property {string} tool - Exact tool name to use
 * @property {Object} args - Tool arguments
 * @property {string} expected_outcome - What should happen
 * @property {string} error_handling - Fallback if step fails
 * @property {number} confidence - 0.0-1.0 confidence in this step
 */

/**
 * @typedef {Object} InstructionPlan
 * @property {string} id - Unique plan ID
 * @property {string} timestamp - ISO-8601 timestamp
 * @property {string} taskAction - High-level action being planned
 * @property {string} approach - Overall strategy description
 * @property {Array<string>} prerequisites - Checks needed before execution
 * @property {Array<InstructionStep>} steps - Detailed executable steps
 * @property {Object} verification - How to verify success
 * @property {Array<Object>} alternatives - Alternative approaches
 * @property {number} overallConfidence - Average confidence across steps
 * @property {boolean} fallbackUsed - Whether fallback to heuristics was used
 * @property {number} planningTimeMs - Time taken to generate plan
 */

/**
 * Create task planner instance
 *
 * @param {Object} llmClient - LLM client for instruction generation
 * @param {string} model - Model to use for planning
 * @param {Object} [config] - Configuration options
 * @returns {Object} Task planner interface
 */
export function createTaskPlanner(llmClient, model, config = {}) {
  const temperature = config.temperature || 0.2; // More deterministic
  const maxTokens = config.maxTokens || 1024;
  const timeout = config.timeout || 3000; // 3 second timeout
  const enableFallback = config.enableFallback !== false;

  /**
   * Generate detailed instructions for a high-level action
   *
   * @param {string} taskAction - High-level action from reflection
   * @param {PlanningContext} context - Execution context
   * @returns {Promise<InstructionPlan>} Detailed instruction plan
   */
  async function generateInstructions(taskAction, context) {
    const startTime = Date.now();
    const planId = ulid();

    console.log(`[TaskPlanner] ${planId}: Planning how to: "${taskAction}"`);

    // Build comprehensive planning prompt
    const prompt = buildPlanningPrompt(taskAction, context);

    try {
      // Call LLM with timeout
      const response = await Promise.race([
        llmClient.chat({
          model,
          messages: [
            {
              role: 'system',
              content: buildSystemPrompt(),
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature,
          max_tokens: maxTokens,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'instruction_plan',
              strict: true,
              schema: getInstructionPlanSchema(),
            },
          },
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Planning timeout')), timeout)
        ),
      ]);

      // Parse and validate response
      const planData = JSON.parse(response.choices[0].message.content);
      const elapsedMs = Date.now() - startTime;

      // Validate tool names against available tools
      const validatedPlan = validatePlan(planData, context.availableTools);

      // Calculate overall confidence
      const overallConfidence =
        validatedPlan.steps.reduce((sum, step) => sum + (step.confidence || 0.7), 0) /
        validatedPlan.steps.length;

      const instructionPlan = {
        id: planId,
        timestamp: new Date().toISOString(),
        taskAction,
        approach: validatedPlan.approach || 'Approach not specified',
        prerequisites: validatedPlan.prerequisites || [],
        steps: validatedPlan.steps || [],
        verification: validatedPlan.verification || null,
        alternatives: validatedPlan.alternatives || [],
        overallConfidence,
        fallbackUsed: false,
        planningTimeMs: elapsedMs,
      };

      console.log(
        `[TaskPlanner] ${planId}: Generated ${instructionPlan.steps.length}-step plan in ${elapsedMs}ms (confidence: ${(overallConfidence * 100).toFixed(0)}%)`
      );

      // Warn if confidence is low
      if (overallConfidence < 0.5) {
        console.warn(`[TaskPlanner] ${planId}: Low confidence plan (${(overallConfidence * 100).toFixed(0)}%)`);
      }

      return instructionPlan;
    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      console.error(`[TaskPlanner] ${planId}: Planning failed after ${elapsedMs}ms:`, error.message);

      // Fallback to heuristic-based plan
      if (enableFallback) {
        console.log(`[TaskPlanner] ${planId}: Using fallback heuristic plan`);
        return buildFallbackPlan(planId, taskAction, context, elapsedMs);
      }

      // If no fallback, return empty plan
      return {
        id: planId,
        timestamp: new Date().toISOString(),
        taskAction,
        approach: 'Planning failed, no fallback available',
        prerequisites: [],
        steps: [],
        verification: null,
        alternatives: [],
        overallConfidence: 0,
        fallbackUsed: false,
        planningTimeMs: elapsedMs,
        error: error.message,
      };
    }
  }

  /**
   * Build system prompt for planning
   *
   * @returns {string} System prompt
   */
  function buildSystemPrompt() {
    return `You are an expert technical instructor and task planner.

Your job: Generate detailed, executable step-by-step instructions for accomplishing technical tasks.

Key principles:
1. **Be Specific**: Use exact tool names, precise commands, and concrete parameters
2. **Be Thorough**: Include prerequisites, error handling, and verification steps
3. **Be Practical**: Consider common failure modes and provide fallbacks
4. **Be Clear**: Each step should be unambiguous and executable

Think like you're instructing a competent developer who needs to know:
- WHAT to do (precise action)
- HOW to do it (exact tool and command)
- WHAT could go wrong (error handling)
- HOW to verify it worked (success criteria)

Always respond with valid JSON matching the schema provided.`;
  }

  /**
   * Build planning prompt with full context
   *
   * @param {string} taskAction - High-level action to plan
   * @param {PlanningContext} context - Execution context
   * @returns {string} Detailed planning prompt
   */
  function buildPlanningPrompt(taskAction, context) {
    // Format available tools with parameters
    const toolsList = context.availableTools
      .map((tool) => {
        let entry = `- **${tool.name}**: ${tool.description}`;

        // Add parameter information if available
        if (tool.parameters && tool.parameters.properties) {
          const params = Object.entries(tool.parameters.properties)
            .map(([key, schema]) => {
              const required = tool.parameters.required?.includes(key) ? ' (required)' : '';
              const desc = schema.description || '';
              return `    - \`${key}\`${required}: ${desc}`;
            })
            .join('\n');

          if (params) {
            entry += '\n' + params;
          }
        }

        return entry;
      })
      .join('\n\n');

    // Format previous actions (if any)
    const previousActionsText =
      context.previousActions && context.previousActions.length > 0
        ? context.previousActions
            .map((action) => `  - Iteration ${action.iteration}: ${action.action}`)
            .join('\n')
        : '  (No previous actions yet)';

    // Format recent failures (if any)
    const recentFailuresText =
      context.recentFailures && context.recentFailures.length > 0
        ? `\n## Recent Failures to Avoid\n\n${context.recentFailures
            .slice(-3)
            .map(
              (failure) =>
                `- **${failure.tool}** failed: ${failure.error}\n  Root cause: ${failure.diagnosis?.rootCause?.description || 'Unknown'}`
            )
            .join('\n')}\n`
        : '';

    return `# Task Planning Request

## Task to Accomplish

**High-Level Action**: ${taskAction}

**Original User Goal**: ${context.taskGoal}

**Current Context**:
- Working Directory: \`${context.cwd}\`
- Iteration: ${context.iteration}
- Previous Actions:
${previousActionsText}
${recentFailuresText}

## Available Tools

You have access to these tools. **Use exact tool names** from this list:

${toolsList}

**IMPORTANT**: When specifying a tool in your plan, you MUST use one of the exact names listed above.

## Planning Instructions

Generate a detailed, step-by-step plan to accomplish: "${taskAction}"

Consider the following:

### 1. What tools are available?
Choose from the exact tool names listed above. Consider which combination will best accomplish the task.

### 2. What are the prerequisites?
What needs to be checked or verified before starting (e.g., tool availability, authentication, file existence)?

### 3. What's the best approach?
If multiple methods exist, which is most reliable? Consider:
- GitHub repos: \`gh\` command is preferred over \`git\` for authenticated access
- Shell operations: Use \`run_bash\` with the \`script\` parameter (NOT \`command\`)
- File operations: Check existence before reading/writing

### 4. What could go wrong?
For EACH step, consider common failure modes and specify fallback actions:
- Command not found → Try alternative approach
- Permission denied → Check/fix permissions
- File not found → Verify path and retry

### 5. How do I verify success?
What command or check confirms the task completed correctly?

## Output Format

Break the task into 3-7 concrete, executable steps. Each step should specify:
- **step_number**: Sequential number (1, 2, 3, ...)
- **description**: Clear description of what this step does
- **tool**: Exact tool name (from available tools list)
- **args**: Specific parameters as a JSON object
- **expected_outcome**: What should happen if this step succeeds
- **error_handling**: What to do if this step fails
- **confidence**: Your confidence this step will work (0.0 - 1.0)

Include:
- **approach**: Overall strategy summary
- **prerequisites**: List of checks before starting
- **verification**: Command to verify final success
- **alternatives**: Other approaches if the primary plan fails

Respond with JSON only, matching the schema.`;
  }

  /**
   * Get JSON schema for instruction plans
   *
   * @returns {Object} JSON schema
   */
  function getInstructionPlanSchema() {
    return {
      type: 'object',
      properties: {
        approach: {
          type: 'string',
          description: 'Brief description of the overall strategy',
        },
        prerequisites: {
          type: 'array',
          description: 'Checks needed before execution',
          items: {
            type: 'string',
          },
        },
        steps: {
          type: 'array',
          description: 'Detailed executable steps',
          items: {
            type: 'object',
            properties: {
              step_number: {
                type: 'integer',
                description: 'Sequential step number',
              },
              description: {
                type: 'string',
                description: 'Clear description of this step',
              },
              tool: {
                type: 'string',
                description: 'Exact tool name to use',
              },
              args: {
                type: 'object',
                description: 'Tool arguments as key-value pairs',
                additionalProperties: true,
              },
              expected_outcome: {
                type: 'string',
                description: 'What should happen if step succeeds',
              },
              error_handling: {
                type: 'string',
                description: 'What to do if step fails',
              },
              confidence: {
                type: 'number',
                description: 'Confidence this step will work (0.0-1.0)',
                minimum: 0,
                maximum: 1,
              },
            },
            required: [
              'step_number',
              'description',
              'tool',
              'args',
              'expected_outcome',
              'error_handling',
            ],
            additionalProperties: false,
          },
        },
        verification: {
          type: 'object',
          description: 'How to verify overall success',
          properties: {
            check_command: {
              type: 'string',
              description: 'Command to verify success',
            },
            success_criteria: {
              type: 'string',
              description: 'What indicates success',
            },
          },
          required: ['check_command', 'success_criteria'],
          additionalProperties: false,
        },
        alternatives: {
          type: 'array',
          description: 'Alternative approaches if primary fails',
          items: {
            type: 'object',
            properties: {
              approach: {
                type: 'string',
                description: 'Alternative method',
              },
              when_to_use: {
                type: 'string',
                description: 'When to prefer this alternative',
              },
              confidence: {
                type: 'number',
                description: 'Confidence in alternative (0.0-1.0)',
                minimum: 0,
                maximum: 1,
              },
            },
            required: ['approach', 'when_to_use'],
            additionalProperties: false,
          },
        },
      },
      required: ['approach', 'steps'],
      additionalProperties: false,
    };
  }

  /**
   * Validate plan against available tools
   *
   * @param {Object} planData - Raw plan from LLM
   * @param {Array<Object>} availableTools - Available tool list
   * @returns {Object} Validated plan
   */
  function validatePlan(planData, availableTools) {
    const toolNames = new Set(availableTools.map((t) => t.name));

    // Validate each step's tool name
    const validatedSteps = (planData.steps || []).map((step) => {
      if (!toolNames.has(step.tool)) {
        console.warn(
          `[TaskPlanner] Invalid tool "${step.tool}" in step ${step.step_number}, attempting to map to valid tool`
        );

        // Try to map to a valid tool
        const mappedTool = mapToValidTool(step.tool, toolNames);
        if (mappedTool) {
          step.tool = mappedTool;
          console.log(`[TaskPlanner] Mapped to valid tool: ${mappedTool}`);
        } else {
          console.error(`[TaskPlanner] Could not map "${step.tool}" to any valid tool`);
          // Mark step with low confidence
          step.confidence = Math.min(step.confidence || 0.5, 0.3);
        }
      }

      // Ensure confidence is set
      if (typeof step.confidence !== 'number') {
        step.confidence = 0.7; // Default confidence
      }

      return step;
    });

    return {
      ...planData,
      steps: validatedSteps,
    };
  }

  /**
   * Attempt to map invalid tool name to valid one
   *
   * @param {string} invalidTool - Invalid tool name
   * @param {Set<string>} validTools - Set of valid tool names
   * @returns {string|null} Mapped tool name or null
   */
  function mapToValidTool(invalidTool, validTools) {
    const mappings = {
      bash: 'run_bash',
      shell: 'run_bash',
      sh: 'run_bash',
      command: 'run_bash',
      powershell: 'run_powershell',
      ps: 'run_powershell',
      read: 'read_file',
      cat: 'read_file',
      write: 'write_file',
      ls: 'read_dir',
      dir: 'read_dir',
      list: 'read_dir',
      time: 'get_time',
      clock: 'get_time',
    };

    const normalized = invalidTool.toLowerCase();
    const mapped = mappings[normalized];

    return mapped && validTools.has(mapped) ? mapped : null;
  }

  /**
   * Build fallback plan using heuristics (when LLM planning fails)
   *
   * @param {string} planId - Plan ID
   * @param {string} taskAction - Task action
   * @param {PlanningContext} context - Execution context
   * @param {number} elapsedMs - Time elapsed
   * @returns {InstructionPlan} Fallback plan
   */
  function buildFallbackPlan(planId, taskAction, context, elapsedMs) {
    console.log(`[TaskPlanner] ${planId}: Building heuristic fallback plan`);

    const lower = taskAction.toLowerCase();
    let steps = [];

    // Simple heuristic patterns
    if (lower.includes('clone') && lower.includes('github')) {
      const urlMatch = taskAction.match(/https?:\/\/github\.com\/[\w-]+\/[\w-]+/);
      const repoUrl = urlMatch ? urlMatch[0] : '';

      steps = [
        {
          step_number: 1,
          description: 'Check if gh command is available',
          tool: 'run_bash',
          args: { script: 'gh --version' },
          expected_outcome: 'gh version displayed',
          error_handling: 'Fall back to git clone with HTTPS',
          confidence: 0.8,
        },
        {
          step_number: 2,
          description: `Clone repository using gh`,
          tool: 'run_bash',
          args: { script: `gh repo clone ${repoUrl.replace('https://github.com/', '')}` },
          expected_outcome: 'Repository cloned to current directory',
          error_handling: 'Try git clone as fallback',
          confidence: 0.7,
        },
      ];
    } else if (lower.includes('read') || lower.includes('list')) {
      steps = [
        {
          step_number: 1,
          description: 'List directory contents',
          tool: 'read_dir',
          args: { path: '.' },
          expected_outcome: 'Directory listing displayed',
          error_handling: 'Check path and permissions',
          confidence: 0.9,
        },
      ];
    } else {
      // Generic fallback
      steps = [
        {
          step_number: 1,
          description: 'Execute generic action',
          tool: 'get_time',
          args: {},
          expected_outcome: 'Current time displayed (no specific action inferred)',
          error_handling: 'Request clarification from user',
          confidence: 0.3,
        },
      ];
    }

    return {
      id: planId,
      timestamp: new Date().toISOString(),
      taskAction,
      approach: 'Heuristic fallback plan (LLM planning failed)',
      prerequisites: [],
      steps,
      verification: null,
      alternatives: [],
      overallConfidence: steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length,
      fallbackUsed: true,
      planningTimeMs: elapsedMs,
    };
  }

  return {
    generateInstructions,
  };
}
