/**
 * Tool Executor
 *
 * Unified wrapper for tool execution with:
 * - Consistent error handling
 * - Output truncation
 * - Event emission
 * - Performance tracking
 * - Validation
 */

import { createTruncator } from '../orchestrator/truncator.mjs';
import { contextLogEvents } from '../services/contextlog-events.mjs';

/**
 * @typedef {Object} ExecutorConfig
 * @property {Object} toolRegistry - Tool registry
 * @property {Object} truncatorConfig - Truncation configuration
 * @property {string} sandboxLevel - Default sandbox level
 */

/**
 * @typedef {Object} ExecutionContext
 * @property {string} convId - Conversation ID
 * @property {number} turnId - Turn ID
 * @property {string} cwd - Current working directory
 * @property {string} sandboxRoot - Sandbox root directory
 * @property {Object} env - Environment variables
 */

/**
 * @typedef {Object} ExecutionResult
 * @property {string} content - Tool output (truncated if needed)
 * @property {boolean} truncated - Whether output was truncated
 * @property {number} originalBytes - Original output size
 * @property {number} elapsedMs - Execution time
 * @property {number} [exitCode] - Exit code for shell tools
 * @property {Error} [error] - Error if execution failed
 */

export class ToolExecutor {
  /**
   * @param {ExecutorConfig} config
   */
  constructor(config) {
    this.toolRegistry = config.toolRegistry;
    this.truncator = createTruncator(config.truncatorConfig || {});
    this.defaultSandboxLevel = config.sandboxLevel || 'workspace';
    this.events = contextLogEvents;
  }

  /**
   * Execute a tool call
   *
   * @param {Object} toolCall - Tool call from LLM
   * @param {ExecutionContext} context - Execution context
   * @returns {Promise<ExecutionResult>}
   */
  async execute(toolCall, context) {
    const startTime = Date.now();

    // Emit start event
    await this.events.emitToolCallBegin(
      context.convId,
      context.turnId,
      toolCall,
      this.defaultSandboxLevel
    );

    try {
      // Get tool handler
      const handler = this.getHandler(toolCall.function.name);

      if (!handler) {
        throw new Error(`Unknown tool: ${toolCall.function.name}`);
      }

      // Parse arguments
      const args = this.parseArguments(toolCall);

      // Validate arguments
      this.validateArguments(args, handler);

      // Execute tool
      const rawResult = await handler.execute(args, context);

      // Handle different result types
      const resultString = this.normalizeResult(rawResult);

      // Truncate output
      const truncated = this.truncator.truncate(resultString, toolCall.function.name);

      const elapsedMs = Date.now() - startTime;

      // Emit completion event
      await this.events.emitToolCallEnd(
        context.convId,
        context.turnId,
        toolCall,
        truncated.content,
        elapsedMs,
        truncated.truncated,
        truncated.originalBytes,
        rawResult.exitCode // For shell tools
      );

      return {
        content: truncated.content,
        truncated: truncated.truncated,
        originalBytes: truncated.originalBytes,
        elapsedMs,
        exitCode: rawResult.exitCode,
      };

    } catch (error) {
      const elapsedMs = Date.now() - startTime;

      // Emit error event
      await this.events.emitToolCallError(
        context.convId,
        context.turnId,
        toolCall,
        error,
        elapsedMs
      );

      return {
        content: `Error: ${error.message}`,
        truncated: false,
        originalBytes: 0,
        elapsedMs,
        error,
      };
    }
  }

  /**
   * Get tool handler from registry
   *
   * @param {string} toolName
   * @returns {Object|null}
   */
  getHandler(toolName) {
    return this.toolRegistry.get(toolName);
  }

  /**
   * Parse tool arguments from string or object
   *
   * @param {Object} toolCall
   * @returns {Object}
   */
  parseArguments(toolCall) {
    const args = toolCall.function.arguments;

    if (typeof args === 'string') {
      try {
        return JSON.parse(args);
      } catch (error) {
        throw new Error(`Failed to parse tool arguments: ${error.message}`);
      }
    }

    return args;
  }

  /**
   * Validate arguments against tool schema
   *
   * @param {Object} args
   * @param {Object} handler
   * @throws {Error} if validation fails
   */
  validateArguments(args, handler) {
    if (!handler.parameters) {
      return; // No schema to validate against
    }

    const schema = handler.parameters;

    // Check required properties
    if (schema.required) {
      for (const prop of schema.required) {
        if (!(prop in args)) {
          throw new Error(`Missing required parameter: ${prop}`);
        }
      }
    }

    // Check types
    if (schema.properties) {
      for (const [key, value] of Object.entries(args)) {
        const propSchema = schema.properties[key];

        if (!propSchema) {
          // Unknown property - warn but don't fail
          console.warn(`Unknown parameter '${key}' for tool ${handler.name}`);
          continue;
        }

        const expectedType = propSchema.type;
        const actualType = Array.isArray(value) ? 'array' : typeof value;

        if (expectedType && actualType !== expectedType) {
          throw new Error(
            `Parameter '${key}' should be ${expectedType}, got ${actualType}`
          );
        }
      }
    }
  }

  /**
   * Normalize result to string
   *
   * @param {any} result
   * @returns {string}
   */
  normalizeResult(result) {
    if (typeof result === 'string') {
      return result;
    }

    if (result && typeof result === 'object') {
      // Handle { stdout, stderr, exitCode } from shell tools
      if ('stdout' in result || 'stderr' in result) {
        let output = '';
        if (result.stdout) output += result.stdout;
        if (result.stderr) {
          if (output) output += '\n\n';
          output += `[stderr]\n${result.stderr}`;
        }
        return output || '(no output)';
      }

      // Handle { content } wrapper
      if ('content' in result) {
        return this.normalizeResult(result.content);
      }

      // Fallback: JSON stringify
      return JSON.stringify(result, null, 2);
    }

    // Fallback: convert to string
    return String(result);
  }

  /**
   * Execute multiple tools in sequence
   *
   * @param {Object[]} toolCalls
   * @param {ExecutionContext} context
   * @returns {Promise<ExecutionResult[]>}
   */
  async executeSequence(toolCalls, context) {
    const results = [];

    for (const toolCall of toolCalls) {
      const result = await this.execute(toolCall, context);
      results.push(result);

      // Stop on error if configured
      if (result.error && context.stopOnError) {
        break;
      }
    }

    return results;
  }

  /**
   * Execute multiple tools in parallel
   * (Simple version - real parallel execution would need dependency analysis)
   *
   * @param {Object[]} toolCalls
   * @param {ExecutionContext} context
   * @returns {Promise<ExecutionResult[]>}
   */
  async executeParallel(toolCalls, context) {
    const promises = toolCalls.map(toolCall =>
      this.execute(toolCall, context)
    );

    return await Promise.all(promises);
  }

  /**
   * Set truncator configuration
   *
   * @param {Object} config
   */
  configureTruncator(config) {
    this.truncator = createTruncator(config);
  }

  /**
   * Set tool-specific truncation limit
   *
   * @param {string} toolName
   * @param {Object} limit
   */
  setToolLimit(toolName, limit) {
    this.truncator.setToolLimit(toolName, limit);
  }

  /**
   * Get execution statistics
   *
   * @returns {Object}
   */
  getStats() {
    return {
      truncator: {
        maxBytes: this.truncator.maxBytes,
        maxLines: this.truncator.maxLines,
        strategy: this.truncator.strategy,
      },
      sandboxLevel: this.defaultSandboxLevel,
    };
  }
}

/**
 * Create default executor instance
 *
 * @param {ExecutorConfig} config
 * @returns {ToolExecutor}
 */
export function createExecutor(config) {
  return new ToolExecutor(config);
}
