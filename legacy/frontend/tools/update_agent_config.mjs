/**
 * Update Agent Config Tool
 *
 * Allows agents to modify their own configuration parameters,
 * enabling self-improvement and adaptation.
 */

/**
 * Tool definition for LLM
 */
export const def = {
  type: 'function',
  function: {
    name: 'update_agent_config',
    description: 'Update your own agent configuration to improve your behavior. You can adjust assessment weights, thresholds, response modes, collision avoidance settings, and domain keywords. Use this when you notice patterns in how you should respond differently.',
    parameters: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'Your agent ID (e.g., "claude", "chatgpt", "forge")'
        },
        updates: {
          type: 'object',
          description: 'Configuration updates to apply',
          properties: {
            contribution_threshold: {
              type: 'number',
              description: 'Relevance threshold to trigger response (0.0-1.0). Lower = more responsive.'
            },
            assessment_weights: {
              type: 'object',
              description: 'Weights for relevance calculation',
              properties: {
                keywords: { type: 'number', description: 'Weight for keyword matching (0.0-1.0)' },
                novelty: { type: 'number', description: 'Weight for context novelty (0.0-1.0)' },
                directedness: { type: 'number', description: 'Weight for question/imperative detection (0.0-1.0)' }
              }
            },
            response_modes: {
              type: 'object',
              description: 'Token limits for different response modes',
              properties: {
                ACK: { type: 'number', description: 'Max tokens for acknowledgments (default: 30)' },
                ANSWER: { type: 'number', description: 'Max tokens for focused answers (default: 200)' },
                ADVICE: { type: 'number', description: 'Max tokens for detailed advice (default: 800)' }
              }
            },
            collision_avoidance: {
              type: 'object',
              description: 'Settings for avoiding simultaneous responses',
              properties: {
                enabled: { type: 'boolean', description: 'Enable collision avoidance' },
                cooldown_seconds: { type: 'number', description: 'Seconds to wait after another agent responds' },
                higher_bar: { type: 'number', description: 'Higher threshold required after collision (0.0-1.0)' }
              }
            },
            domain_keywords: {
              type: 'array',
              items: { type: 'string' },
              description: 'Keywords that trigger higher relevance scores'
            }
          }
        },
        reason: {
          type: 'string',
          description: 'Explanation of why you\'re making this change'
        }
      },
      required: ['agent_id', 'updates', 'reason']
    }
  }
};

/**
 * Execute tool
 */
export async function run(args) {
  const { agent_id, updates, reason } = args;

  if (!agent_id || !updates) {
    return JSON.stringify({
      success: false,
      error: 'Missing required fields: agent_id and updates'
    });
  }

  try {
    // Call the agent config API
    const response = await fetch(`http://localhost:3000/api/conversation-space/agents/${agent_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });

    const data = await response.json();

    if (!data.success) {
      return JSON.stringify({
        success: false,
        error: data.error || 'Failed to update agent config'
      });
    }

    // Log the change
    console.log(`[update_agent_config] ${agent_id} updated config: ${reason}`);
    console.log(`[update_agent_config] Changes:`, JSON.stringify(updates, null, 2));

    return JSON.stringify({
      success: true,
      message: `Configuration updated successfully. ${data.message || 'Reload required.'}`,
      reason,
      previous_config: {
        contribution_threshold: data.agent.contribution_threshold,
        assessment_weights: data.agent.assessment_weights,
        response_modes: data.agent.response_modes,
        collision_avoidance: data.agent.collision_avoidance
      },
      reload_instructions: 'Your new configuration will take effect after agent reload. Continue using current settings until reload.'
    });

  } catch (error) {
    return JSON.stringify({
      success: false,
      error: `Failed to update config: ${error.message}`
    });
  }
}

export default { def, run };
