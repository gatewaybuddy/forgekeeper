export const def = {
  type: 'function',
  function: {
    name: 'get_time',
    description: 'Get the current time in ISO 8601 format (UTC).',
    parameters: { type: 'object', properties: {} },
    strict: true,
  },
};

export async function run() {
  return new Date().toISOString();
}

