/**
 * Search Conversations Tool
 *
 * Allows agents to search through previous conversations for relevant context.
 * This enables agents to reference past discussions, decisions, and information.
 */

/**
 * Tool definition for LLM
 */
export const definition = {
  type: 'function',
  function: {
    name: 'search_conversations',
    description: 'Search through previous conversations to find relevant information, past discussions, or historical context. Use this when you need to reference something from a previous conversation or when the user asks about past interactions.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query - keywords or phrases to search for in past conversations'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5, max: 20)',
          default: 5
        },
        include_archived: {
          type: 'boolean',
          description: 'Whether to include archived conversations in the search (default: false)',
          default: false
        },
        project_id: {
          type: 'string',
          description: 'Optional: Limit search to a specific project ID'
        }
      },
      required: ['query']
    }
  }
};

/**
 * Execute search
 */
export async function execute(args) {
  const { query, limit = 5, include_archived = false, project_id } = args;

  if (!query || typeof query !== 'string') {
    return {
      success: false,
      error: 'Query parameter is required and must be a string'
    };
  }

  // Limit the number of results
  const searchLimit = Math.min(Math.max(1, limit || 5), 20);

  try {
    // Build search URL
    const params = new URLSearchParams({
      q: query,
      limit: searchLimit.toString()
    });

    if (!include_archived) {
      params.append('status', 'active');
    }

    if (project_id) {
      params.append('project_id', project_id);
    }

    const response = await fetch(`http://localhost:3000/api/conversation-space/search?${params}`);
    const data = await response.json();

    if (!data.success) {
      return {
        success: false,
        error: data.error || 'Search failed'
      };
    }

    // Format results for agent consumption
    const results = data.results.map(result => ({
      conversation_title: result.conversation.title,
      conversation_id: result.conversation.id,
      conversation_date: result.conversation.updated_at,
      message_author: result.message.author_name,
      message_content: result.message.content,
      message_timestamp: result.message.timestamp,
      relevance_score: result.score
    }));

    // Group by conversation for better readability
    const conversationGroups = {};
    results.forEach(r => {
      if (!conversationGroups[r.conversation_id]) {
        conversationGroups[r.conversation_id] = {
          title: r.conversation_title,
          date: r.conversation_date,
          messages: []
        };
      }
      conversationGroups[r.conversation_id].messages.push({
        author: r.message_author,
        content: r.message_content,
        timestamp: r.message_timestamp
      });
    });

    return {
      success: true,
      query,
      total_results: results.length,
      conversations_found: Object.keys(conversationGroups).length,
      results: conversationGroups,
      raw_results: results
    };
  } catch (error) {
    return {
      success: false,
      error: `Search failed: ${error.message}`
    };
  }
}

export default { definition, execute };
