/**
 * Tool executor with timeout and error handling
 */
import { Tool, ToolResult, ToolExecutionContext, ToolRegistry as IToolRegistry } from './types.js';
import { withTimeout, DEFAULT_TIMEOUT, truncateOutput, MAX_OUTPUT_SIZE } from './sandbox.js';
import { logger } from '../utils/logger.js';

export class ToolExecutor implements IToolRegistry {
  private tools = new Map<string, Tool>();

  /**
   * Register a tool
   */
  register(tool: Tool): void {
    const name = tool.definition.function.name;

    if (this.tools.has(name)) {
      logger.warn({ name }, 'Tool already registered, overwriting');
    }

    this.tools.set(name, tool);
    logger.debug({ name }, 'Tool registered');
  }

  /**
   * Get tool by name
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all tool definitions (for LLM function calling)
   */
  getDefinitions(): any[] {
    return this.getAll().map((tool) => tool.definition);
  }

  /**
   * Execute a tool with timeout and error handling
   */
  async execute(
    name: string,
    args: any,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const tool = this.tools.get(name);

    if (!tool) {
      logger.error({ name }, 'Tool not found');
      return {
        success: false,
        error: `Tool not found: ${name}`,
        executionTime: Date.now() - startTime,
      };
    }

    logger.debug({ name, args, context }, 'Executing tool');

    try {
      // Execute with timeout
      const timeout = context?.timeout || DEFAULT_TIMEOUT;
      const resultPromise = tool.run(args, context);
      const result = await withTimeout(resultPromise, timeout, `Tool execution timed out after ${timeout}ms`);

      const executionTime = Date.now() - startTime;

      // Truncate output if needed
      if (result.output && typeof result.output === 'string') {
        const maxSize = context?.maxOutputSize || MAX_OUTPUT_SIZE;
        const { content, truncated } = truncateOutput(result.output, maxSize);

        if (truncated) {
          result.output = content;
          result.truncated = true;
        }
      }

      logger.info(
        {
          name,
          success: result.success,
          executionTime,
          outputSize: result.output ? JSON.stringify(result.output).length : 0,
        },
        'Tool execution complete'
      );

      return {
        ...result,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(
        { name, error: errorMessage, executionTime, args },
        'Tool execution failed'
      );

      return {
        success: false,
        error: errorMessage,
        executionTime,
      };
    }
  }

  /**
   * Execute multiple tools in parallel
   */
  async executeMany(
    executions: Array<{ name: string; args: any; context?: ToolExecutionContext }>
  ): Promise<ToolResult[]> {
    return Promise.all(
      executions.map((exec) => this.execute(exec.name, exec.args, exec.context))
    );
  }

  /**
   * Check if tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    const existed = this.tools.delete(name);
    if (existed) {
      logger.debug({ name }, 'Tool unregistered');
    }
    return existed;
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
    logger.info('All tools cleared');
  }

  /**
   * Get tool count
   */
  count(): number {
    return this.tools.size;
  }
}

// Singleton instance
let executorInstance: ToolExecutor | null = null;

export function getToolExecutor(): ToolExecutor {
  if (!executorInstance) {
    executorInstance = new ToolExecutor();
  }
  return executorInstance;
}
