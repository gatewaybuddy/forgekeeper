// Reload the dynamic tool registry and optionally update the allowlist so the UI/backend
// immediately "knows" about newly added tools. Dev only; gated by FRONTEND_ENABLE_SELF_UPDATE.

export const def = {
  type: 'function',
  function: {
    name: 'refresh_tools',
    description: 'Reload the tool registry and return tool names/defs; optionally update TOOL_ALLOW to include all tools.',
    parameters: {
      type: 'object',
      properties: {
        auto_allow: { type: 'boolean', description: 'If true, set TOOL_ALLOW to include all loaded tools.' }
      },
      additionalProperties: false,
    },
    strict: true,
  },
};

export async function run({ auto_allow = false } = {}) {
  if (process.env.FRONTEND_ENABLE_SELF_UPDATE !== '1') {
    throw new Error('Self-update disabled (set FRONTEND_ENABLE_SELF_UPDATE=1)');
  }
  const toolsMod = await import('../server.tools.mjs');
  await toolsMod.reloadTools();
  const defs = await toolsMod.getToolDefs();
  const names = Array.isArray(defs) ? defs.map((d) => d?.function?.name).filter(Boolean) : [];
  if (auto_allow) {
    process.env.TOOL_ALLOW = names.join(',');
  }
  return {
    count: names.length,
    names,
    auto_allow_applied: !!auto_allow,
    allow: process.env.TOOL_ALLOW || ''
  };
}

