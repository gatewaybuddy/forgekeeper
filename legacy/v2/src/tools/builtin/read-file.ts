/**
 * Read file tool
 */
import fs from 'node:fs/promises';
import { Tool, ToolResult } from '../types.js';
import {
  resolveSafe,
  getRelativePath,
  normalizePath,
  validateArgs,
  MAX_READ_BYTES,
} from '../sandbox.js';

export const readFileTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read a text file from the filesystem. Returns file content with metadata. Large files are automatically truncated.',
      parameters: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'File path to read (relative or absolute)',
          },
          encoding: {
            type: 'string',
            description: 'Text encoding (default: utf8)',
            enum: ['utf8', 'ascii', 'base64', 'hex'],
          },
          maxBytes: {
            type: 'integer',
            description: `Maximum bytes to read (default: ${MAX_READ_BYTES})`,
          },
        },
        required: ['file'],
        additionalProperties: false,
      },
      strict: true,
    },
  },

  async run(args): Promise<ToolResult> {
    try {
      validateArgs(args, ['file']);

      const { file, encoding = 'utf8', maxBytes } = args;
      const fullPath = resolveSafe(file);

      // Check if file exists and is a file
      const stats = await fs.stat(fullPath);

      if (!stats.isFile()) {
        return {
          success: false,
          error: `Not a file: ${file}`,
        };
      }

      // Calculate read limit
      const limit = Math.max(1, Math.min(Number(maxBytes || MAX_READ_BYTES), MAX_READ_BYTES));

      let content: string;
      let truncated = false;

      if (stats.size > limit) {
        // Read only the first 'limit' bytes
        truncated = true;
        const fh = await fs.open(fullPath, 'r');
        try {
          const buf = Buffer.allocUnsafe(limit);
          await fh.read(buf, 0, limit, 0);
          content = buf.toString(encoding as BufferEncoding);
        } finally {
          await fh.close();
        }
      } else {
        // Read entire file
        content = await fs.readFile(fullPath, { encoding: encoding as BufferEncoding });
      }

      const relativePath = getRelativePath(fullPath);

      return {
        success: true,
        output: {
          path: normalizePath(relativePath),
          bytes: stats.size,
          readBytes: Buffer.byteLength(content, encoding as BufferEncoding),
          truncated,
          encoding,
          content,
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
