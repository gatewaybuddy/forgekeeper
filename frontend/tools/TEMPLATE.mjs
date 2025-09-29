// SAMPLE TOOL TEMPLATE — copy this file and adapt.
// Keep tools small, validated, and JSON-serializable.

export const def = {
  type: 'function',
  function: {
    name: 'sample_tool', // <- change me
    description: 'Describe what the tool does.',
    parameters: {
      type: 'object',
      properties: {
        // arg1: { type: 'string', description: '...' },
      },
      required: [/* 'arg1' */],
      additionalProperties: false,
    },
    strict: true,
  },
};

export async function run(args = {}) {
  // Validate inputs defensively
  // if (typeof args.arg1 !== 'string') throw new Error('arg1 is required');

  // Do the work
  // const result = ...

  // Return small JSON (or string)
  return { ok: true /*, result */ };
}

/*
To register:
1) Import and add to TOOL_DEFS in tools/index.mjs
   import * as t_sample from './sample_tool.mjs';
   export const TOOL_DEFS = [ ..., t_sample.def ];
   REGISTRY.set('sample_tool', t_sample);

Guidelines:
- Validate all inputs. Do not trust the model.
- Keep outputs compact and JSON-serializable.
- Use sandbox helpers for file/process access (see fs_common.mjs, run_powershell.mjs).
- Enforce time/space limits and env gates for risky operations.
*/

