// Self-extension skill - allows Forgekeeper to create new MCP servers
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import { approvals } from '../core/memory.js';
import { query } from '../core/claude.js';
import { validateGeneratedCode } from '../core/guardrails.js';

export default {
  name: 'self-extend',
  description: 'Create new MCP servers to extend Forgekeeper capabilities',
  triggers: ['create mcp', 'add capability', 'extend', 'new integration', 'self extend'],

  approval: {
    required: true, // ALWAYS require approval for self-extension
    level: 'review', // Show the code for review
  },

  async execute(task) {
    const description = task.description;

    // Step 1: Plan the MCP server
    console.log('[Self-Extend] Planning MCP server...');
    const plan = await planMcpServer(description);

    if (!plan.success) {
      return { success: false, error: plan.error };
    }

    // Step 2: Generate the code
    console.log('[Self-Extend] Generating code...');
    const generated = await generateMcpServer(plan.spec);

    if (!generated.success) {
      return { success: false, error: generated.error };
    }

    // Step 3: Validate the code
    console.log('[Self-Extend] Validating code...');
    const validation = validateGeneratedCode(generated.code);

    if (!validation.safe) {
      console.log('[Self-Extend] Code validation issues:', validation.issues);
    }

    // Step 4: Request approval
    const approval = approvals.request({
      type: 'self_extension',
      taskId: task.id,
      description: `Create MCP server: ${plan.spec.name}`,
      reason: 'Self-extension requires user approval',
      level: 'review',
      data: {
        serverName: plan.spec.name,
        serverDescription: plan.spec.description,
        tools: plan.spec.tools,
        code: generated.code,
        validationIssues: validation.issues,
      },
    });

    return {
      success: true,
      pendingApproval: true,
      approvalId: approval.id,
      message: `MCP server "${plan.spec.name}" designed. Awaiting approval.`,
      spec: plan.spec,
      codePreview: generated.code.slice(0, 500) + '...',
    };
  },

  // Called after approval to actually write the file
  async onApproved(approvalData) {
    const { serverName, code } = approvalData;

    const mcpDir = config.paths.mcpServers;
    if (!existsSync(mcpDir)) {
      mkdirSync(mcpDir, { recursive: true });
    }

    const filePath = join(mcpDir, `${serverName}.js`);
    writeFileSync(filePath, code);

    console.log(`[Self-Extend] MCP server written to: ${filePath}`);

    return {
      success: true,
      filePath,
      message: `MCP server "${serverName}" created at ${filePath}`,
    };
  },
};

// Plan the MCP server structure
async function planMcpServer(description) {
  const prompt = `Design an MCP (Model Context Protocol) server based on this request:

Request: ${description}

Return a JSON object with:
- name: server name (lowercase, hyphenated)
- description: what the server does
- tools: array of tool definitions, each with:
  - name: tool name
  - description: what it does
  - parameters: array of {name, type, description, required}

Example:
\`\`\`json
{
  "name": "weather-api",
  "description": "Fetch weather data from various sources",
  "tools": [
    {
      "name": "get_weather",
      "description": "Get current weather for a location",
      "parameters": [
        {"name": "location", "type": "string", "description": "City name or coordinates", "required": true}
      ]
    }
  ]
}
\`\`\`

Return ONLY the JSON object.`;

  const result = await query(prompt);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  try {
    const jsonMatch = result.output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found');
    const spec = JSON.parse(jsonMatch[0]);
    return { success: true, spec };
  } catch (e) {
    return { success: false, error: `Failed to parse plan: ${e.message}` };
  }
}

// Generate the MCP server code
async function generateMcpServer(spec) {
  const prompt = `Generate a Node.js MCP server based on this specification:

${JSON.stringify(spec, null, 2)}

The server should:
1. Use stdio transport (stdin/stdout for communication)
2. Follow MCP protocol for tool definitions and execution
3. Include proper error handling
4. Be a single self-contained file

Here's the template structure to follow:

\`\`\`javascript
#!/usr/bin/env node
// MCP Server: ${spec.name}
// ${spec.description}

import { createInterface } from 'readline';

const TOOLS = ${JSON.stringify(spec.tools, null, 2)};

// Tool implementations
const handlers = {
  // Implement each tool
};

// MCP Protocol handling
const rl = createInterface({ input: process.stdin });

rl.on('line', async (line) => {
  try {
    const request = JSON.parse(line);
    const response = await handleRequest(request);
    console.log(JSON.stringify(response));
  } catch (e) {
    console.log(JSON.stringify({ error: e.message }));
  }
});

async function handleRequest(request) {
  const { method, params } = request;

  if (method === 'tools/list') {
    return { tools: TOOLS };
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params;
    const handler = handlers[name];
    if (!handler) return { error: \`Unknown tool: \${name}\` };
    return await handler(args);
  }

  return { error: \`Unknown method: \${method}\` };
}

console.error('[MCP] ${spec.name} server started');
\`\`\`

Generate the complete implementation with actual tool logic.
Return ONLY the JavaScript code, no explanations.`;

  const result = await query(prompt);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Extract code from response
  let code = result.output;
  const codeMatch = code.match(/```(?:javascript|js)?\n([\s\S]*?)```/);
  if (codeMatch) {
    code = codeMatch[1];
  }

  return { success: true, code };
}
