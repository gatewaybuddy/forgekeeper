/**
 * Built-in tools registry
 * Exports all built-in tools
 */
import { Tool } from '../types.js';
import { readFileTool } from './read-file.js';
import { writeFileTool } from './write-file.js';
import { readDirTool } from './read-dir.js';
import { runBashTool } from './run-bash.js';
import { getTimeTool } from './get-time.js';
import { httpFetchTool } from './http-fetch.js';

export const builtinTools: Tool[] = [
  readFileTool,
  writeFileTool,
  readDirTool,
  runBashTool,
  getTimeTool,
  httpFetchTool,
];

export {
  readFileTool,
  writeFileTool,
  readDirTool,
  runBashTool,
  getTimeTool,
  httpFetchTool,
};
