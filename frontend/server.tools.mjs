// Compatibility wrapper: re-export modular tools aggregator.
export { TOOL_DEFS, runTool } from './tools/index.mjs';

/*
Modular tools live under ./tools/*.mjs
- Add a new tool by copying ./tools/TEMPLATE.mjs and registering it in ./tools/index.mjs.
- Env and sandbox helpers are in ./tools/fs_common.mjs.
*/

