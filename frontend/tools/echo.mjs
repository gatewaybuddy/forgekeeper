export const def = {
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
};

export async function run(args = {}) {
  if (typeof args.text !== 'string') throw new Error('Missing required arg: text');
  return String(args.text);
}

