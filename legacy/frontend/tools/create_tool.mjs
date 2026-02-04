/**
 * Create Tool - Allows agents to create new tools
 *
 * Enables agents to extend their own capabilities by writing new tool files.
 * This is the foundation of agent self-evolution.
 */

import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Tool definition for LLM
 */
export const def = {
  type: 'function',
  function: {
    name: 'create_tool',
    description: 'Create a new tool to extend your capabilities. Write a complete .mjs tool file with definition and implementation. The tool will be available after frontend restart.',
    parameters: {
      type: 'object',
      properties: {
        tool_name: {
          type: 'string',
          description: 'Tool name (snake_case, alphanumeric + underscores only, e.g., "analyze_logs", "fetch_weather")'
        },
        description: {
          type: 'string',
          description: 'Clear description of what this tool does'
        },
        parameters: {
          type: 'object',
          description: 'JSON Schema for tool parameters. Must include "type", "properties", and optionally "required".',
          properties: {
            type: { type: 'string' },
            properties: { type: 'object' },
            required: { type: 'array', items: { type: 'string' } }
          },
          required: ['type', 'properties']
        },
        implementation: {
          type: 'string',
          description: 'JavaScript code for the run() function body. Should handle errors and return JSON string. You have access to: fetch, fs, path, child_process. Example: "const result = await fetch(args.url); return JSON.stringify({ success: true, data: await result.text() });"'
        },
        imports: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional import statements (e.g., ["import { exec } from \'child_process\';", "import fetch from \'node-fetch\';"])'
        },
        reason: {
          type: 'string',
          description: 'Why you\'re creating this tool and what capability gap it fills'
        }
      },
      required: ['tool_name', 'description', 'parameters', 'implementation', 'reason']
    }
  }
};

/**
 * Validate tool name
 */
function validateToolName(name) {
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error('Tool name must be snake_case (lowercase letters, numbers, underscores only)');
  }
  if (name.startsWith('_') || name.endsWith('_')) {
    throw new Error('Tool name cannot start or end with underscore');
  }
  if (name.length < 3 || name.length > 50) {
    throw new Error('Tool name must be 3-50 characters');
  }
}

/**
 * Auto-register tool in index.mjs
 */
async function registerToolInIndex(toolName) {
  const indexPath = join(__dirname, 'index.mjs');
  let indexContent = await readFile(indexPath, 'utf8');

  // Add import statement
  const importStatement = `import * as t_${toolName} from './${toolName}.mjs';`;

  // Find the last import line
  const lastImportMatch = indexContent.match(/import \* as t_\w+ from '\.\/\w+\.mjs';/g);
  if (lastImportMatch) {
    const lastImport = lastImportMatch[lastImportMatch.length - 1];
    indexContent = indexContent.replace(
      lastImport,
      `${lastImport}\n${importStatement}`
    );
  }

  // Add to TOOL_DEFS array
  const toolDefsMatch = indexContent.match(/(export const TOOL_DEFS = \[[^\]]+)/s);
  if (toolDefsMatch) {
    const beforeClosingBracket = toolDefsMatch[1];
    const lastToolDef = beforeClosingBracket.split('\n').filter(line => line.trim().startsWith('t_')).pop();
    if (lastToolDef) {
      indexContent = indexContent.replace(
        lastToolDef,
        `${lastToolDef}\n  t_${toolName}.def,`
      );
    }
  }

  // Add to REGISTRY map
  const registryMatch = indexContent.match(/(const REGISTRY = new Map\(\[[^\]]+)/s);
  if (registryMatch) {
    const beforeClosingBracket = registryMatch[1];
    const lastRegistryEntry = beforeClosingBracket.split('\n').filter(line => line.trim().startsWith('[')).pop();
    if (lastRegistryEntry) {
      indexContent = indexContent.replace(
        lastRegistryEntry,
        `${lastRegistryEntry}\n  ['${toolName}', t_${toolName}],`
      );
    }
  }

  // Write updated index.mjs
  await writeFile(indexPath, indexContent, 'utf8');
}

/**
 * Generate tool file content
 */
function generateToolFile(toolName, description, parameters, implementation, imports = []) {
  const importStatements = imports.length > 0
    ? imports.join('\n') + '\n\n'
    : '';

  return `/**
 * ${toolName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Tool
 *
 * ${description}
 *
 * This tool was created by an agent for self-improvement.
 */

${importStatements}/**
 * Tool definition for LLM
 */
export const def = {
  type: 'function',
  function: {
    name: '${toolName}',
    description: '${description.replace(/'/g, "\\'")}',
    parameters: ${JSON.stringify(parameters, null, 6).replace(/\n/g, '\n    ')}
  }
};

/**
 * Execute tool
 */
export async function run(args) {
  try {
${implementation.split('\n').map(line => '    ' + line).join('\n')}
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error.message || String(error)
    });
  }
}

export default { def, run };
`;
}

/**
 * Execute tool
 */
export async function run(args) {
  const { tool_name, description, parameters, implementation, imports = [], reason } = args;

  if (!tool_name || !description || !parameters || !implementation || !reason) {
    return JSON.stringify({
      success: false,
      error: 'Missing required fields: tool_name, description, parameters, implementation, reason'
    });
  }

  try {
    // Validate tool name
    validateToolName(tool_name);

    // Check if tool already exists
    const toolPath = join(__dirname, `${tool_name}.mjs`);
    try {
      await import(`file://${toolPath}`);
      return JSON.stringify({
        success: false,
        error: `Tool '${tool_name}' already exists. Use a different name or delete the existing tool first.`
      });
    } catch (err) {
      // Good - tool doesn't exist yet
    }

    // Validate parameters schema
    if (!parameters.type || !parameters.properties) {
      return JSON.stringify({
        success: false,
        error: 'parameters must include "type" and "properties" fields'
      });
    }

    // Generate tool file
    const fileContent = generateToolFile(
      tool_name,
      description,
      parameters,
      implementation,
      imports
    );

    // Write to tools directory
    await writeFile(toolPath, fileContent, 'utf8');

    // Auto-register in index.mjs
    await registerToolInIndex(tool_name);

    // Hot-reload tools module
    try {
      const { reloadTools } = await import('../server.tools.mjs');
      await reloadTools();
      console.log(`[create_tool] Tools reloaded successfully`);
    } catch (reloadErr) {
      console.warn(`[create_tool] Failed to hot-reload tools:`, reloadErr.message);
      // Continue anyway - tool is created and registered
    }

    // Log creation
    console.log(`[create_tool] New tool created: ${tool_name}`);
    console.log(`[create_tool] Reason: ${reason}`);
    console.log(`[create_tool] Path: ${toolPath}`);

    return JSON.stringify({
      success: true,
      message: `Tool '${tool_name}' created and registered successfully! Ready to use immediately.`,
      tool_name: tool_name,
      tool_path: `tools/${tool_name}.mjs`,
      reason,
      ready: true,
      note: 'You can call this tool right away - no restart needed!'
    });

  } catch (error) {
    return JSON.stringify({
      success: false,
      error: `Failed to create tool: ${error.message}`
    });
  }
}

export default { def, run };
