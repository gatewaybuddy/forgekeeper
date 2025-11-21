/**
 * MCP Tool Adapter (T404)
 *
 * Converts MCP tool definitions to Forgekeeper's native tool format
 * and provides execution wrappers for seamless integration.
 *
 * MCP tools use the Model Context Protocol schema, while Forgekeeper
 * uses OpenAI function calling format. This adapter bridges the two.
 *
 * @module mcp/tool-adapter
 */

import { getRegistry } from './registry.mjs';

/**
 * Convert MCP JSON Schema to OpenAI function parameters format
 *
 * MCP uses standard JSON Schema, OpenAI function calling has specific requirements:
 * - Must use "object" type at root
 * - Properties are defined in "properties"
 * - Required fields in "required" array
 * - Supports strict mode
 *
 * @param {Object} inputSchema - MCP input schema
 * @returns {Object} OpenAI-compatible parameters schema
 */
function convertSchema(inputSchema) {
  if (!inputSchema) {
    return {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false
    };
  }

  // If already in correct format, return as-is
  if (inputSchema.type === 'object' && inputSchema.properties) {
    return {
      type: 'object',
      properties: inputSchema.properties,
      required: inputSchema.required || [],
      additionalProperties: inputSchema.additionalProperties ?? false
    };
  }

  // Handle non-object root (wrap it)
  return {
    type: 'object',
    properties: {
      value: inputSchema
    },
    required: ['value'],
    additionalProperties: false
  };
}

/**
 * Convert MCP tool definition to Forgekeeper format
 *
 * @param {Object} mcpTool - MCP tool definition
 * @param {string} serverName - Name of the MCP server providing this tool
 * @returns {Object} Forgekeeper tool definition
 */
export function mcpToolToForgekeeper(mcpTool, serverName) {
  if (!mcpTool || !mcpTool.name) {
    throw new Error('Invalid MCP tool: missing name');
  }

  // Create prefixed name to avoid collisions with native tools
  const toolName = `mcp_${serverName}_${mcpTool.name}`;

  // Convert MCP schema to OpenAI function parameters
  const parameters = convertSchema(mcpTool.inputSchema);

  // Build Forgekeeper tool definition
  return {
    type: 'function',
    function: {
      name: toolName,
      description: mcpTool.description || `MCP tool ${mcpTool.name} from ${serverName} server`,
      parameters,
      strict: true // Enable strict mode for validation
    },
    // Store metadata for routing
    _mcp: {
      serverName,
      originalName: mcpTool.name,
      isMCP: true
    }
  };
}

/**
 * Convert array of MCP tools to Forgekeeper format
 *
 * @param {Array} mcpTools - Array of MCP tool definitions
 * @param {string} serverName - Name of the MCP server
 * @returns {Array} Array of Forgekeeper tool definitions
 */
export function convertMCPTools(mcpTools, serverName) {
  if (!Array.isArray(mcpTools)) {
    return [];
  }

  return mcpTools.map(tool => {
    try {
      return mcpToolToForgekeeper(tool, serverName);
    } catch (err) {
      console.error(`[MCP Adapter] Failed to convert tool ${tool?.name}:`, err);
      return null;
    }
  }).filter(Boolean);
}

/**
 * Map Forgekeeper arguments to MCP format
 *
 * @param {Object} forgekeeperArgs - Arguments from Forgekeeper orchestrator
 * @param {Object} toolDef - Forgekeeper tool definition with _mcp metadata
 * @returns {Object} MCP-compatible arguments
 */
function mapArgumentsToMCP(forgekeeperArgs, toolDef) {
  // If arguments were wrapped (non-object root schema), unwrap them
  if (forgekeeperArgs && forgekeeperArgs.value !== undefined) {
    return forgekeeperArgs.value;
  }

  // Otherwise pass through as-is
  return forgekeeperArgs || {};
}

/**
 * Transform MCP result to Forgekeeper format
 *
 * MCP returns: { content: [{ type: "text", text: "..." }, ...] }
 * Forgekeeper expects: string or object with clear structure
 *
 * @param {Object} mcpResult - MCP tool call result
 * @returns {string|Object} Forgekeeper-compatible result
 */
function transformResult(mcpResult) {
  if (!mcpResult) {
    return '';
  }

  // MCP results have a content array
  if (mcpResult.content && Array.isArray(mcpResult.content)) {
    // Extract all text content
    const textParts = mcpResult.content
      .filter(item => item.type === 'text')
      .map(item => item.text || '')
      .filter(Boolean);

    // If single text item, return as string
    if (textParts.length === 1) {
      return textParts[0];
    }

    // Multiple items: join with newlines
    if (textParts.length > 0) {
      return textParts.join('\n');
    }

    // Handle non-text content (images, resources, etc.)
    const otherContent = mcpResult.content.filter(item => item.type !== 'text');
    if (otherContent.length > 0) {
      return {
        text: textParts.join('\n'),
        additional_content: otherContent
      };
    }
  }

  // If result has isError flag, return error structure
  if (mcpResult.isError) {
    return {
      error: true,
      message: mcpResult.content?.[0]?.text || 'MCP tool error',
      details: mcpResult
    };
  }

  // Fallback: return as JSON string
  return JSON.stringify(mcpResult, null, 2);
}

/**
 * Transform MCP error to Forgekeeper format
 *
 * @param {Error} error - Error from MCP tool call
 * @param {string} toolName - Tool name for context
 * @returns {string} Formatted error message
 */
function transformError(error, toolName) {
  const message = error?.message || String(error);

  // Check for common MCP error patterns
  if (message.includes('not connected')) {
    return `MCP tool error (${toolName}): Server not connected. Please check MCP server status.`;
  }

  if (message.includes('timeout')) {
    return `MCP tool error (${toolName}): Operation timed out. The MCP server may be slow or unresponsive.`;
  }

  if (message.includes('not found')) {
    return `MCP tool error (${toolName}): Tool not found on MCP server. It may have been removed or renamed.`;
  }

  // Generic error
  return `MCP tool error (${toolName}): ${message}`;
}

/**
 * Execute an MCP tool via the registry
 *
 * This is the main adapter function that Forgekeeper's orchestrator calls.
 * It handles routing to the correct MCP server and transforming results.
 *
 * @param {Object} toolDef - Forgekeeper tool definition with _mcp metadata
 * @param {Object} args - Tool arguments from Forgekeeper
 * @returns {Promise<string|Object>} Tool result in Forgekeeper format
 */
export async function executeMCPTool(toolDef, args) {
  if (!toolDef || !toolDef._mcp) {
    throw new Error('Invalid MCP tool definition: missing _mcp metadata');
  }

  const { serverName, originalName } = toolDef._mcp;

  try {
    // Get the registry and find the server
    const registry = getRegistry();
    const server = registry.getServer(serverName);

    if (!server) {
      throw new Error(`MCP server not found: ${serverName}`);
    }

    if (!server.connected) {
      throw new Error(`MCP server not connected: ${serverName}`);
    }

    // Map arguments to MCP format
    const mcpArgs = mapArgumentsToMCP(args, toolDef);

    // Call the tool on the MCP server
    const mcpResult = await server.callTool(originalName, mcpArgs);

    // Transform result to Forgekeeper format
    return transformResult(mcpResult);

  } catch (error) {
    // Transform error to Forgekeeper format
    return transformError(error, toolDef.function.name);
  }
}

/**
 * Get all available MCP tools from all connected servers
 *
 * @returns {Array} Array of Forgekeeper-compatible tool definitions
 */
export function getAllMCPTools() {
  try {
    const registry = getRegistry();
    const allTools = registry.getAllTools();

    const forgekeeperTools = [];

    for (const toolInfo of allTools) {
      const { server, definition } = toolInfo;

      try {
        const converted = mcpToolToForgekeeper(definition, server);
        forgekeeperTools.push(converted);
      } catch (err) {
        console.error(`[MCP Adapter] Failed to convert tool ${definition?.name} from ${server}:`, err);
      }
    }

    return forgekeeperTools;

  } catch (error) {
    console.error('[MCP Adapter] Failed to get MCP tools:', error);
    return [];
  }
}

/**
 * Check if a tool is an MCP tool
 *
 * @param {Object} toolDef - Tool definition
 * @returns {boolean} True if this is an MCP tool
 */
export function isMCPTool(toolDef) {
  return !!(toolDef && toolDef._mcp && toolDef._mcp.isMCP);
}

/**
 * Get MCP tool metadata
 *
 * @param {Object} toolDef - Tool definition
 * @returns {Object|null} MCP metadata or null if not an MCP tool
 */
export function getMCPMetadata(toolDef) {
  return isMCPTool(toolDef) ? toolDef._mcp : null;
}

/**
 * Create a unified tool runner that handles both native and MCP tools
 *
 * This can be used by the orchestrator to execute any tool regardless of origin.
 *
 * @param {Function} nativeRunner - Function to execute native Forgekeeper tools
 * @returns {Function} Unified tool runner
 */
export function createUnifiedToolRunner(nativeRunner) {
  return async function runTool(toolDef, args, metadata = {}) {
    // Check if this is an MCP tool
    if (isMCPTool(toolDef)) {
      // Execute via MCP adapter
      return await executeMCPTool(toolDef, args);
    }

    // Execute via native runner
    const toolName = toolDef.function?.name || toolDef.name;
    return await nativeRunner(toolName, args, metadata);
  };
}

/**
 * Get statistics about MCP tool usage
 *
 * @returns {Object} Statistics object
 */
export function getMCPToolStats() {
  try {
    const registry = getRegistry();
    const stats = registry.getStats();

    return {
      serverCount: stats.serverCount,
      totalTools: stats.toolCount,
      servers: stats.servers.map(s => ({
        name: s.name,
        toolCount: s.toolCount,
        connected: s.connected,
        uptime: s.uptime
      }))
    };

  } catch (error) {
    console.error('[MCP Adapter] Failed to get stats:', error);
    return {
      serverCount: 0,
      totalTools: 0,
      servers: []
    };
  }
}
