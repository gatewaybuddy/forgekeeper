/**
 * Sandbox utilities for tool execution
 * Provides path validation and resource limits
 */
import path from 'node:path';
import { homedir } from 'node:os';
import { logger } from '../utils/logger.js';

// Configuration
export const SANDBOX_ENABLED = process.env.ENABLE_SANDBOX === 'true';
export const FS_ROOT = process.env.TOOLS_FS_ROOT || process.cwd();
export const MAX_READ_BYTES = Number(process.env.TOOLS_MAX_READ_BYTES) || 10 * 1024 * 1024; // 10MB
export const MAX_OUTPUT_SIZE = Number(process.env.TOOLS_MAX_OUTPUT_SIZE) || 1 * 1024 * 1024; // 1MB
export const DEFAULT_TIMEOUT = Number(process.env.TOOLS_DEFAULT_TIMEOUT) || 30000; // 30s

/**
 * Resolve a path safely within the sandbox
 * Prevents path traversal attacks
 */
export function resolveSafe(relativePath: string): string {
  if (!relativePath) {
    throw new Error('Path is required');
  }

  // Normalize and resolve
  const normalized = path.normalize(relativePath);
  const resolved = path.resolve(FS_ROOT, normalized);

  // Check if resolved path is within FS_ROOT
  if (SANDBOX_ENABLED && !resolved.startsWith(FS_ROOT)) {
    logger.warn(
      { relativePath, resolved, fsRoot: FS_ROOT },
      'Path traversal attempt blocked'
    );
    throw new Error(`Access denied: path outside sandbox (${relativePath})`);
  }

  return resolved;
}

/**
 * Normalize path for consistent output
 */
export function normalizePath(p: string): string {
  return p.split(path.sep).join('/');
}

/**
 * Get relative path from FS_ROOT
 */
export function getRelativePath(absolutePath: string): string {
  return normalizePath(path.relative(FS_ROOT, absolutePath));
}

/**
 * Expand tilde in paths
 */
export function expandTilde(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return filepath.replace('~', homedir());
  }
  return filepath;
}

/**
 * Truncate output if too large
 */
export function truncateOutput(
  output: string,
  maxSize: number = MAX_OUTPUT_SIZE
): { content: string; truncated: boolean } {
  if (output.length <= maxSize) {
    return { content: output, truncated: false };
  }

  const truncated = output.slice(0, maxSize);
  const suffix = `\n\n... (truncated ${output.length - maxSize} bytes)`;

  return {
    content: truncated + suffix,
    truncated: true,
  };
}

/**
 * Create timeout wrapper for async functions
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT,
  errorMessage = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Validate tool arguments against schema
 */
export function validateArgs(args: any, required: string[] = []): void {
  for (const field of required) {
    if (!(field in args) || args[field] === undefined || args[field] === null) {
      throw new Error(`Required argument missing: ${field}`);
    }
  }
}

/**
 * Get sandbox info for debugging
 */
export function getSandboxInfo(): {
  enabled: boolean;
  fsRoot: string;
  maxReadBytes: number;
  maxOutputSize: number;
  defaultTimeout: number;
} {
  return {
    enabled: SANDBOX_ENABLED,
    fsRoot: FS_ROOT,
    maxReadBytes: MAX_READ_BYTES,
    maxOutputSize: MAX_OUTPUT_SIZE,
    defaultTimeout: DEFAULT_TIMEOUT,
  };
}
