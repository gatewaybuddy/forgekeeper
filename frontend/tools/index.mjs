// Aggregates tool definitions and dispatches calls to individual tool modules.
import * as t_get_time from './get_time.mjs';
import * as t_echo from './echo.mjs';
import * as t_read_dir from './read_dir.mjs';
import * as t_read_file from './read_file.mjs';
import * as t_write_file from './write_file.mjs';
import * as t_run_powershell from './run_powershell.mjs';

export const TOOL_DEFS = [
  t_get_time.def,
  t_echo.def,
  t_read_dir.def,
  t_read_file.def,
  t_write_file.def,
  t_run_powershell.def,
];

const REGISTRY = new Map([
  ['get_time', t_get_time],
  ['echo', t_echo],
  ['read_dir', t_read_dir],
  ['read_file', t_read_file],
  ['write_file', t_write_file],
  ['run_powershell', t_run_powershell],
]);

export async function runTool(name, args) {
  const mod = REGISTRY.get(name);
  if (!mod || typeof mod.run !== 'function') throw new Error(`Unknown tool: ${name}`);
  try {
    return await mod.run(args || {});
  } catch (e) {
    return `Tool error (${name}): ${e?.message || String(e)}`;
  }
}

export { FS_ROOT, MAX_READ_BYTES, MAX_WRITE_BYTES, resolveSafe } from './fs_common.mjs';

