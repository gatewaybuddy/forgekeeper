/**
 * Get time tool
 */
import { Tool, ToolResult } from '../types.js';

export const getTimeTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'get_time',
      description:
        'Get current date and time in various formats. Useful for timestamps and time-based operations.',
      parameters: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            description: 'Output format: iso, unix, locale, utc (default: iso)',
            enum: ['iso', 'unix', 'locale', 'utc'],
          },
          timezone: {
            type: 'string',
            description: 'Timezone (e.g., America/New_York, UTC)',
          },
        },
        additionalProperties: false,
      },
      strict: true,
    },
  },

  async run(args): Promise<ToolResult> {
    try {
      const { format = 'iso', timezone } = args;
      const now = new Date();

      let formatted: string;

      switch (format) {
        case 'unix':
          formatted = Math.floor(now.getTime() / 1000).toString();
          break;

        case 'locale':
          formatted = timezone
            ? now.toLocaleString('en-US', { timeZone: timezone })
            : now.toLocaleString();
          break;

        case 'utc':
          formatted = now.toUTCString();
          break;

        case 'iso':
        default:
          formatted = now.toISOString();
          break;
      }

      return {
        success: true,
        output: {
          formatted,
          timestamp: now.getTime(),
          iso: now.toISOString(),
          timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
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
