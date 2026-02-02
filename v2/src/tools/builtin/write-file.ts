/**
 * Write file tool
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { Tool, ToolResult } from '../types.js';
import { resolveSafe, getRelativePath, normalizePath, validateArgs } from '../sandbox.js';

export const writeFileTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Write content to a file. Creates parent directories if needed. Overwrites existing files.',
      parameters: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'File path to write (relative or absolute)',
          },
          content: {
            type: 'string',
            description: 'Content to write to the file',
          },
          encoding: {
            type: 'string',
            description: 'Text encoding (default: utf8)',
            enum: ['utf8', 'ascii', 'base64', 'hex'],
          },
          createDirs: {
            type: 'boolean',
            description: 'Create parent directories if they don\'t exist (default: true)',
          },
        },
        required: ['file', 'content'],
        additionalProperties: false,
      },
      strict: true,
    },
  },

  async run(args): Promise<ToolResult> {
    try {
      validateArgs(args, ['file', 'content']);

      const { file, content, encoding = 'utf8', createDirs = true } = args;
      const fullPath = resolveSafe(file);

      // Create parent directories if needed
      if (createDirs) {
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
      }

      // Write file
      await fs.writeFile(fullPath, content, { encoding: encoding as BufferEncoding });

      // Get file stats
      const stats = await fs.stat(fullPath);
      const relativePath = getRelativePath(fullPath);

      return {
        success: true,
        output: {
          path: normalizePath(relativePath),
          bytes: stats.size,
          encoding,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
