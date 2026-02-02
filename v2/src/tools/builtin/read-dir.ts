/**
 * Read directory tool
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { Tool, ToolResult } from '../types.js';
import { resolveSafe, getRelativePath, normalizePath, validateArgs } from '../sandbox.js';

export const readDirTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'read_dir',
      description:
        'List contents of a directory. Returns file/directory names with metadata.',
      parameters: {
        type: 'object',
        properties: {
          dir: {
            type: 'string',
            description: 'Directory path to read (relative or absolute)',
          },
          recursive: {
            type: 'boolean',
            description: 'Recursively list subdirectories (default: false)',
          },
          includeHidden: {
            type: 'boolean',
            description: 'Include hidden files (starting with .) (default: false)',
          },
        },
        required: ['dir'],
        additionalProperties: false,
      },
      strict: true,
    },
  },

  async run(args): Promise<ToolResult> {
    try {
      validateArgs(args, ['dir']);

      const { dir, recursive = false, includeHidden = false } = args;
      const fullPath = resolveSafe(dir);

      // Check if directory exists
      const stats = await fs.stat(fullPath);

      if (!stats.isDirectory()) {
        return {
          success: false,
          error: `Not a directory: ${dir}`,
        };
      }

      // Read directory
      const entries = await readDirectory(fullPath, recursive, includeHidden);
      const relativePath = getRelativePath(fullPath);

      return {
        success: true,
        output: {
          path: normalizePath(relativePath),
          entries,
          count: entries.length,
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

async function readDirectory(
  dirPath: string,
  recursive: boolean,
  includeHidden: boolean
): Promise<Array<{ name: string; type: string; size: number }>> {
  const entries: Array<{ name: string; type: string; size: number }> = [];

  const items = await fs.readdir(dirPath, { withFileTypes: true });

  for (const item of items) {
    // Skip hidden files if not included
    if (!includeHidden && item.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(dirPath, item.name);
    const stats = await fs.stat(fullPath);

    entries.push({
      name: item.name,
      type: item.isDirectory() ? 'directory' : item.isFile() ? 'file' : 'other',
      size: stats.size,
    });

    // Recurse into subdirectories
    if (recursive && item.isDirectory()) {
      const subEntries = await readDirectory(fullPath, true, includeHidden);
      for (const subEntry of subEntries) {
        entries.push({
          name: path.join(item.name, subEntry.name),
          type: subEntry.type,
          size: subEntry.size,
        });
      }
    }
  }

  return entries;
}
