// Aggregates tool definitions and dispatches calls to individual tool modules.
import * as t_get_time from './get_time.mjs';
import * as t_echo from './echo.mjs';
import * as t_read_dir from './read_dir.mjs';
import * as t_read_file from './read_file.mjs';
import * as t_write_file from './write_file.mjs';
import * as t_run_powershell from './run_powershell.mjs';
import * as t_run_bash from './run_bash.mjs';
import * as t_refresh_tools from './refresh_tools.mjs';
import * as t_write_repo_file from './write_repo_file.mjs';
import * as t_http_fetch from './http_fetch.mjs';
import * as t_git_status from './git_status.mjs';
import * as t_git_diff from './git_diff.mjs';
import * as t_git_add from './git_add.mjs';
import * as t_git_commit from './git_commit.mjs';
import * as t_git_push from './git_push.mjs';
import * as t_git_pull from './git_pull.mjs';
import * as t_restart_frontend from './restart_frontend.mjs';
import * as t_search_conversations from './search_conversations.mjs';
import * as t_update_agent_config from './update_agent_config.mjs';
import * as t_create_tool from './create_tool.mjs';

export const TOOL_DEFS = [
  t_get_time.def,
  t_echo.def,
  t_read_dir.def,
  t_read_file.def,
  t_write_file.def,
  t_run_powershell.def,
  t_run_bash.def,
  t_refresh_tools.def,
  t_write_repo_file.def,
  t_http_fetch.def,
  t_git_status.def,
  t_git_diff.def,
  t_git_add.def,
  t_git_commit.def,
  t_git_push.def,
  t_git_pull.def,
  t_restart_frontend.def,
  t_search_conversations.definition,
  t_update_agent_config.def,
  t_create_tool.def,
];

const REGISTRY = new Map([
  ['get_time', t_get_time],
  ['echo', t_echo],
  ['read_dir', t_read_dir],
  ['read_file', t_read_file],
  ['write_file', t_write_file],
  ['run_powershell', t_run_powershell],
  ['run_bash', t_run_bash],
  ['refresh_tools', t_refresh_tools],
  ['write_repo_file', t_write_repo_file],
  ['http_fetch', t_http_fetch],
  ['git_status', t_git_status],
  ['git_diff', t_git_diff],
  ['git_add', t_git_add],
  ['git_commit', t_git_commit],
  ['git_push', t_git_push],
  ['git_pull', t_git_pull],
  ['restart_frontend', t_restart_frontend],
  ['search_conversations', t_search_conversations],
  ['update_agent_config', t_update_agent_config],
  ['create_tool', t_create_tool],
]);

export async function runTool(name, args) {
  // Optional runtime allowlist: TOOL_ALLOW=name1,name2
  const allow = (process?.env?.TOOL_ALLOW || '').trim();
  if (allow) {
    const set = new Set(allow.split(',').map((s) => s.trim()).filter(Boolean));
    if (!set.has(name)) throw new Error(`Tool not allowed by policy: ${name}`);
  }
  const mod = REGISTRY.get(name);
  if (!mod || typeof mod.run !== 'function') throw new Error(`Unknown tool: ${name}`);
  try {
    return await mod.run(args || {});
  } catch (e) {
    return `Tool error (${name}): ${e?.message || String(e)}`;
  }
}

export { FS_ROOT, MAX_READ_BYTES, MAX_WRITE_BYTES, resolveSafe } from './fs_common.mjs';
