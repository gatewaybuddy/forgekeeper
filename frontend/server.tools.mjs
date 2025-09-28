// Server-side tool registry and runner (portable module)
// This module is framework-agnostic and can be reused in a standalone backend.

export const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'get_time',
      description: 'Get the current time in ISO 8601 format (UTC).',
      parameters: {
        type: 'object',
        properties: {},
      },
      strict: true,
    },
  },
  {
    type: 'function',
    function: {
      name: 'echo',
      description: 'Echo back the provided text. Useful for confirming arguments.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to echo back.' },
        },
        required: ['text'],
        additionalProperties: false,
      },
      strict: true,
    },
  },
];

export async function runTool(name, args) {
  try {
    switch (name) {
      case 'get_time': {
        return new Date().toISOString();
      }
      case 'echo': {
        if (!args || typeof args.text !== 'string') throw new Error('Missing required arg: text');
        return String(args.text);
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return `Tool error (${name}): ${e?.message || String(e)}`;
  }
}

