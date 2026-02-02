/**
 * Tool type definitions
 * Compatible with OpenAI/Anthropic function calling
 */

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
      additionalProperties?: boolean;
    };
    strict?: boolean;
  };
}

export interface ToolResult {
  success: boolean;
  output?: any;
  error?: string;
  executionTime?: number;
  truncated?: boolean;
}

export interface ToolExecutionContext {
  sessionId: string;
  workingDirectory?: string;
  environment?: Record<string, string>;
  timeout?: number;
  maxOutputSize?: number;
}

export interface Tool {
  definition: ToolDefinition;
  run: (args: any, context?: ToolExecutionContext) => Promise<ToolResult>;
}

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  getAll(): Tool[];
  getDefinitions(): ToolDefinition[];
  execute(name: string, args: any, context?: ToolExecutionContext): Promise<ToolResult>;
}
