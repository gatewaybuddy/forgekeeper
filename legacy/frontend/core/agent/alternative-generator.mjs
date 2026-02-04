/**
 * Alternative Generator - Generate Multiple Approaches for Tasks
 *
 * [Phase 6.1] Proactive Multi-Alternative Planning
 *
 * Purpose:
 *   Generate 3-5 different approaches for accomplishing a high-level action.
 *   Uses LLM with historical context (episodic memory, tool effectiveness) to
 *   create diverse alternatives that consider different tools, strategies, and
 *   trade-offs.
 *
 * Key Features:
 *   - LLM-powered generation with historical learning
 *   - Ensures diversity (different tools/strategies)
 *   - Validates against available tools
 *   - Always includes safe fallback
 *   - Documents assumptions and prerequisites
 *
 * @module frontend/core/agent/alternative-generator
 */

import { ulid } from 'ulid';

/**
 * Create an alternative generator instance
 *
 * @param {Object} llmClient - LLM client for chat
 * @param {string} model - Model to use
 * @param {Object} episodicMemory - Episodic memory for similar tasks
 * @param {Object} toolEffectiveness - Tool effectiveness tracker
 * @param {Object} config - Configuration options
 * @returns {Object} Alternative generator instance
 */
export function createAlternativeGenerator(
  llmClient,
  model,
  episodicMemory = null,
  toolEffectiveness = null,
  config = {}
) {
  const minAlternatives = config.minAlternatives || 3;
  const maxAlternatives = config.maxAlternatives || 5;
  const temperature = config.temperature || 0.7; // Higher for creativity
  const maxTokens = config.maxTokens || 2000;

  /**
   * Generate multiple alternative approaches for an action
   *
   * @param {string} action - High-level action to accomplish
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Alternatives object
   */
  async function generateAlternatives(action, context) {
    const startTime = Date.now();
    const generationId = ulid();

    console.log(`[AlternativeGenerator] ${generationId}: Generating alternatives for: "${action}"`);

    // Step 1: Search for similar past tasks
    const similarTasks = await findSimilarTasks(action, context);

    // Step 2: Get tool recommendations
    const toolRecs = await getToolRecommendations(context);

    // Step 3: Build comprehensive prompt
    const prompt = buildAlternativePrompt(action, context, similarTasks, toolRecs);

    // Step 4: Call LLM
    try {
      const response = await llmClient.chat({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: prompt }
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'alternatives',
            strict: true,
            schema: getAlternativesSchema()
          }
        }
      });

      const alternatives = JSON.parse(response.choices[0].message.content);
      const elapsedMs = Date.now() - startTime;

      // Step 5: Validate and enrich
      const validated = validateAlternatives(alternatives, context);

      console.log(
        `[AlternativeGenerator] ${generationId}: Generated ${validated.alternatives.length} alternatives in ${elapsedMs}ms`
      );

      return {
        ...validated,
        generationMethod: 'llm_with_historical_context',
        generationId,
        timestamp: new Date().toISOString(),
        elapsedMs,
      };
    } catch (error) {
      console.error(`[AlternativeGenerator] ${generationId}: Generation failed:`, error.message);

      // Fallback: Create minimal alternatives using heuristics
      return createFallbackAlternatives(action, context, generationId);
    }
  }

  /**
   * Find similar tasks from episodic memory
   */
  async function findSimilarTasks(action, context) {
    if (!episodicMemory) {
      console.log('[AlternativeGenerator] No episodic memory available');
      return [];
    }

    try {
      const similar = await episodicMemory.search(action, {
        minSimilarity: 0.7,
        limit: 5,
        successOnly: false, // Include failures to learn what NOT to do
      });

      console.log(`[AlternativeGenerator] Found ${similar.length} similar past tasks`);
      return similar;
    } catch (error) {
      console.warn('[AlternativeGenerator] Failed to search episodic memory:', error.message);
      return [];
    }
  }

  /**
   * Get tool recommendations from tool effectiveness tracker
   */
  async function getToolRecommendations(context) {
    if (!toolEffectiveness) {
      console.log('[AlternativeGenerator] No tool effectiveness tracker available');
      return [];
    }

    try {
      const recs = await toolEffectiveness.getRecommendations(
        context.taskGoal,
        context.recentFailures || []
      );

      console.log(`[AlternativeGenerator] Got ${recs?.length || 0} tool recommendations`);
      return recs || [];
    } catch (error) {
      console.warn('[AlternativeGenerator] Failed to get tool recommendations:', error.message);
      return [];
    }
  }

  /**
   * Build system prompt for alternative generation
   */
  function buildSystemPrompt() {
    return `You are an alternative generator for an autonomous agent.

**Your Job**: Generate MULTIPLE ways to accomplish a task, not just one.

**Principles**:
1. **Diversity**: Each approach should be meaningfully different (different tools, strategies, or trade-offs)
2. **Realism**: Only use tools that are available
3. **Safety**: Include a fallback approach that works even if tools are missing
4. **Transparency**: Document ALL assumptions and prerequisites
5. **Learning**: Consider what worked/failed in similar past tasks

**Good Example**:
Task: "Install npm package"
Alternatives:
  1. Use npm install (assumes npm installed, fast)
  2. Use yarn install (assumes yarn installed, alternative package manager)
  3. Use pnpm install (assumes pnpm installed, disk-efficient)
  4. Download tarball manually via curl (fallback, always works but complex)

**Bad Example** (not diverse enough):
  1. Use npm install
  2. Use npm i (same as #1, just shorthand)
  3. Use npm install --save (same as #1, just different flag)

**Critical**: Each alternative should represent a DIFFERENT strategy or trade-off, not just minor variations.`;
  }

  /**
   * Build user prompt for alternative generation
   */
  function buildAlternativePrompt(action, context, similarTasks, toolRecs) {
    const similarTasksText = formatSimilarTasks(similarTasks);
    const toolRecsText = formatToolRecommendations(toolRecs);
    const availableToolsText = context.availableTools?.join(', ') || 'unknown';

    return `# Generate Multiple Approaches

**Action**: ${action}
**Overall Goal**: ${context.taskGoal || 'Not specified'}
**Available Tools**: ${availableToolsText}
**Current Working Directory**: ${context.cwd || '.'}

${similarTasksText}

${toolRecsText}

## Your Task

Generate ${minAlternatives}-${maxAlternatives} DIFFERENT approaches for accomplishing this action.

**Requirements**:
1. Each approach must use different tools or strategies
2. Each approach must have different trade-offs (complexity, risk, prerequisites)
3. All approaches must be executable with the available tools listed above
4. Document ALL assumptions and prerequisites for each approach
5. Include a "safe fallback" approach that works even if preferred tools are missing

**Output Format**: JSON matching the provided schema

**Remember**: Focus on DIVERSITY. Don't just provide minor variations - provide fundamentally different strategies.`;
  }

  /**
   * Format similar tasks for prompt
   */
  function formatSimilarTasks(similarTasks) {
    if (!similarTasks || similarTasks.length === 0) {
      return '## Past Similar Tasks\n\n(No similar tasks found in history)';
    }

    const formatted = similarTasks.map((task, i) => {
      const status = task.successful ? '✓ SUCCEEDED' : '✗ FAILED';
      const tools = task.tools_used?.join(', ') || 'unknown';

      let text = `${i + 1}. "${task.description}" (${status})\n`;
      text += `   Approach: ${task.approach || 'Not documented'}\n`;
      text += `   Tools: ${tools}\n`;
      text += `   Iterations: ${task.iterations || 'unknown'}`;

      if (!task.successful && task.error) {
        text += `\n   Failure Reason: ${task.error}`;
      }

      return text;
    }).join('\n\n');

    return `## Past Similar Tasks

These are similar tasks from history. Learn from what worked and what failed:

${formatted}`;
  }

  /**
   * Format tool recommendations for prompt
   */
  function formatToolRecommendations(toolRecs) {
    if (!toolRecs || toolRecs.length === 0) {
      return '## Tool Recommendations\n\n(No specific tool recommendations)';
    }

    const formatted = toolRecs.map(rec => {
      const successRate = (rec.successRate * 100).toFixed(0);
      return `- **${rec.tool}**: ${rec.reason} (${successRate}% success rate)`;
    }).join('\n');

    return `## Tool Recommendations

Based on historical effectiveness:

${formatted}`;
  }

  /**
   * Get JSON schema for alternatives
   */
  function getAlternativesSchema() {
    return {
      type: 'object',
      properties: {
        alternatives: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Human-readable name for this approach'
              },
              description: {
                type: 'string',
                description: 'Brief description of what this approach does'
              },
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    tool: {
                      type: 'string',
                      description: 'Tool name (must be from available tools)'
                    },
                    args: {
                      type: 'object',
                      description: 'Arguments for the tool',
                      additionalProperties: true
                    },
                    description: {
                      type: 'string',
                      description: 'What this step does'
                    },
                    expectedOutcome: {
                      type: 'string',
                      description: 'What should happen if this step succeeds'
                    }
                  },
                  required: ['tool', 'args'],
                  additionalProperties: false
                }
              },
              assumptions: {
                type: 'array',
                items: { type: 'string' },
                description: 'What this approach assumes (e.g., "git is installed")'
              },
              prerequisites: {
                type: 'array',
                items: { type: 'string' },
                description: 'What must be true/available for this to work'
              },
              confidence: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description: 'Confidence this will work (0-1)'
              }
            },
            required: ['name', 'description', 'steps', 'assumptions', 'prerequisites', 'confidence'],
            additionalProperties: false
          }
        }
      },
      required: ['alternatives'],
      additionalProperties: false
    };
  }

  /**
   * Validate and enrich alternatives
   */
  function validateAlternatives(alternatives, context) {
    const availableTools = new Set(context.availableTools || []);
    let validated = { ...alternatives };

    // Ensure minimum number of alternatives
    while (validated.alternatives.length < minAlternatives) {
      console.warn(
        `[AlternativeGenerator] Too few alternatives (${validated.alternatives.length}), adding fallback`
      );
      validated.alternatives.push(createFallbackAlternative(context));
    }

    // Limit to maximum
    if (validated.alternatives.length > maxAlternatives) {
      console.log(`[AlternativeGenerator] Limiting to ${maxAlternatives} alternatives`);
      validated.alternatives = validated.alternatives.slice(0, maxAlternatives);
    }

    // Validate and fix each alternative
    validated.alternatives = validated.alternatives.map((alt, i) => {
      // Assign ID if missing
      const id = alt.id || `alt-${i + 1}`;

      // Validate tools in steps
      const validatedSteps = alt.steps.map(step => {
        if (!availableTools.has(step.tool)) {
          console.warn(`[AlternativeGenerator] Invalid tool "${step.tool}", replacing with echo`);
          return {
            tool: 'echo',
            args: { message: `Tool ${step.tool} not available` },
            description: step.description || `Original: ${step.tool}`,
            expectedOutcome: 'Error message displayed'
          };
        }
        return step;
      });

      return {
        id,
        ...alt,
        steps: validatedSteps
      };
    });

    // Check diversity (ensure different tools used)
    const diversity = checkDiversity(validated.alternatives);
    if (diversity < 0.5) {
      console.warn(
        `[AlternativeGenerator] Low diversity (${(diversity * 100).toFixed(0)}%), alternatives may be too similar`
      );
    }

    return validated;
  }

  /**
   * Check diversity of alternatives (0-1 scale)
   */
  function checkDiversity(alternatives) {
    if (alternatives.length < 2) return 1.0;

    // Collect all tool sequences
    const toolSequences = alternatives.map(alt =>
      alt.steps.map(s => s.tool).join('→')
    );

    // Count unique sequences
    const uniqueSequences = new Set(toolSequences).size;

    // Diversity = unique sequences / total alternatives
    return uniqueSequences / alternatives.length;
  }

  /**
   * Create fallback alternative when LLM fails or diversity is low
   */
  function createFallbackAlternative(context) {
    return {
      id: 'alt-fallback',
      name: 'Report situation and request guidance',
      description: 'Safe fallback - report the current situation',
      steps: [
        {
          tool: 'echo',
          args: {
            message: 'Multiple approaches possible. Analysis suggests proceeding with caution. Please provide guidance if needed.'
          },
          description: 'Report the situation',
          expectedOutcome: 'Message displayed, awaiting next action'
        }
      ],
      assumptions: [],
      prerequisites: [],
      confidence: 0.5 // Medium confidence - always works but suboptimal
    };
  }

  /**
   * Create fallback alternatives using heuristics (when LLM fails)
   */
  function createFallbackAlternatives(action, context, generationId) {
    console.log(`[AlternativeGenerator] ${generationId}: Creating fallback alternatives`);

    const lower = action.toLowerCase();
    const alternatives = [];

    // Heuristic 1: If action mentions specific tool, use it
    const availableTools = context.availableTools || [];

    if (lower.includes('clone') || lower.includes('git')) {
      // Git-related action
      if (availableTools.includes('run_bash')) {
        alternatives.push({
          id: 'alt-1',
          name: 'Use git clone',
          description: 'Clone using standard git',
          steps: [
            {
              tool: 'run_bash',
              args: { script: 'git clone <url>' },
              description: 'Clone repository',
              expectedOutcome: 'Repository cloned'
            }
          ],
          assumptions: ['git is installed'],
          prerequisites: ['git'],
          confidence: 0.7
        });
      }
    }

    if (lower.includes('read') || lower.includes('list') || lower.includes('explore')) {
      // Read/explore action
      if (availableTools.includes('read_dir')) {
        alternatives.push({
          id: 'alt-2',
          name: 'List directory contents',
          description: 'Explore by listing files',
          steps: [
            {
              tool: 'read_dir',
              args: { dir: context.cwd || '.' },
              description: 'List directory',
              expectedOutcome: 'Files listed'
            }
          ],
          assumptions: [],
          prerequisites: [],
          confidence: 0.8
        });
      }
    }

    // Always add fallback
    alternatives.push(createFallbackAlternative(context));

    return {
      alternatives,
      generationMethod: 'heuristic_fallback',
      generationId,
      timestamp: new Date().toISOString(),
      error: 'LLM generation failed, used fallback heuristics'
    };
  }

  return {
    generateAlternatives,
  };
}
