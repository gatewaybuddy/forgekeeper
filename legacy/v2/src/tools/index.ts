/**
 * Tools module
 * Central export for all tool-related functionality
 */
export * from './types.js';
export * from './sandbox.js';
export * from './executor.js';
export * from './builtin/index.js';

import { getToolExecutor } from './executor.js';
import { builtinTools } from './builtin/index.js';
import { logger } from '../utils/logger.js';

/**
 * Initialize tool executor with built-in tools
 */
export function initializeTools(): void {
  const executor = getToolExecutor();

  logger.info(`Registering ${builtinTools.length} built-in tools...`);

  for (const tool of builtinTools) {
    executor.register(tool);
  }

  logger.info({ count: executor.count() }, 'Tools initialized');
}

/**
 * Get tool definitions for LLM function calling
 */
export function getToolDefinitions(): any[] {
  const executor = getToolExecutor();
  return executor.getDefinitions();
}

/**
 * Execute a tool by name
 */
export async function executeTool(name: string, args: any, context?: any) {
  const executor = getToolExecutor();
  return executor.execute(name, args, context);
}
