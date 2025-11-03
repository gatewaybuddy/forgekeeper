/**
 * Task Planner - "5 Hows" Instruction Generation
 * [T400] ADR-0004: Intelligent Task Planning
 *
 * Takes high-level actions and generates detailed, step-by-step instructions
 * using the LLM's full reasoning capability - the same way it instructs users.
 *
 * Key Principle: "The agent should instruct itself the same way it instructs users."
 *
 * Flow:
 * 1. Receive high-level action from reflection (e.g., "Clone repository")
 * 2. Build comprehensive planning prompt with context
 * 3. LLM generates detailed instructions with tools, args, error handling
 * 4. Validate and structure the response
 * 5. Return executable instruction plan
 */

import { ulid } from 'ulid';

/**
 * @typedef {Object} PlanningContext
 * @property {string} taskGoal - Original user task
 * @property {Array<Object>} availableTools - Tools with names and descriptions
 * @property {string} cwd - Current working directory
 * @property {number} iteration - Current iteration number
 * @property {Array<Object>} previousActions - Last 3-5 actions
 * @property {Array<Object>} [recentFailures] - Recent failures with context
 */

/**
 * @typedef {Object} InstructionStep
 * @property {number} step_number - Step sequence number
 * @property {string} description - Clear description of what to do
 * @property {string} tool - Exact tool name to use
 * @property {Object} args - Tool arguments
 * @property {string} expected_outcome - What should happen
 * @property {string} error_handling - Fallback if step fails
 * @property {number} confidence - 0.0-1.0 confidence in this step
 */

/**
 * @typedef {Object} InstructionPlan
 * @property {string} id - Unique plan ID
 * @property {string} timestamp - ISO-8601 timestamp
 * @property {string} taskAction - High-level action being planned
 * @property {string} approach - Overall strategy description
 * @property {Array<string>} prerequisites - Checks needed before execution
 * @property {Array<InstructionStep>} steps - Detailed executable steps
 * @property {Object} verification - How to verify success
 * @property {Array<Object>} alternatives - Alternative approaches
 * @property {number} overallConfidence - Average confidence across steps
 * @property {boolean} fallbackUsed - Whether fallback to heuristics was used
 * @property {number} planningTimeMs - Time taken to generate plan
 */

/**
 * Create task planner instance
 *
 * @param {Object} llmClient - LLM client for instruction generation
 * @param {string} model - Model to use for planning
 * @param {Object} [config] - Configuration options
 * @returns {Object} Task planner interface
 */
export function createTaskPlanner(llmClient, model, config = {}) {
  const temperature = config.temperature || 0.2; // More deterministic
  const maxTokens = config.maxTokens || 1024;
  // Increased from 3s to 15s for slower LLM backends (Phase 4 fix)
  // Configurable via TASK_PLANNER_TIMEOUT_MS env var
  const defaultTimeout = parseInt(process.env.TASK_PLANNER_TIMEOUT_MS || '15000', 10);
  const timeout = config.timeout || defaultTimeout;
  const enableFallback = config.enableFallback !== false;

  /**
   * Generate detailed instructions for a high-level action
   *
   * @param {string} taskAction - High-level action from reflection
   * @param {PlanningContext} context - Execution context
   * @returns {Promise<InstructionPlan>} Detailed instruction plan
   */
  async function generateInstructions(taskAction, context) {
    const startTime = Date.now();
    const planId = ulid();

    console.log(`[TaskPlanner] ${planId}: Planning how to: "${taskAction}"`);

    // Build comprehensive planning prompt
    const prompt = buildPlanningPrompt(taskAction, context);

    try {
      // Call LLM with timeout
      const response = await Promise.race([
        llmClient.chat({
          model,
          messages: [
            {
              role: 'system',
              content: buildSystemPrompt(),
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature,
          max_tokens: maxTokens,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'instruction_plan',
              strict: true,
              schema: getInstructionPlanSchema(),
            },
          },
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Planning timeout')), timeout)
        ),
      ]);

      // Parse and validate response
      const planData = JSON.parse(response.choices[0].message.content);
      const elapsedMs = Date.now() - startTime;

      // Validate tool names against available tools
      const validatedPlan = validatePlan(planData, context.availableTools);

      // Calculate overall confidence
      const overallConfidence =
        validatedPlan.steps.reduce((sum, step) => sum + (step.confidence || 0.7), 0) /
        validatedPlan.steps.length;

      const instructionPlan = {
        id: planId,
        timestamp: new Date().toISOString(),
        taskAction,
        approach: validatedPlan.approach || 'Approach not specified',
        prerequisites: validatedPlan.prerequisites || [],
        steps: validatedPlan.steps || [],
        verification: validatedPlan.verification || null,
        alternatives: validatedPlan.alternatives || [],
        overallConfidence,
        fallbackUsed: false,
        planningTimeMs: elapsedMs,
      };

      console.log(
        `[TaskPlanner] ${planId}: Generated ${instructionPlan.steps.length}-step plan in ${elapsedMs}ms (confidence: ${(overallConfidence * 100).toFixed(0)}%)`
      );

      // Warn if confidence is low
      if (overallConfidence < 0.5) {
        console.warn(`[TaskPlanner] ${planId}: Low confidence plan (${(overallConfidence * 100).toFixed(0)}%)`);
      }

      return instructionPlan;
    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      console.error(`[TaskPlanner] ${planId}: Planning failed after ${elapsedMs}ms:`, error.message);

      // Fallback to heuristic-based plan
      if (enableFallback) {
        console.log(`[TaskPlanner] ${planId}: Using fallback heuristic plan`);
        return buildFallbackPlan(planId, taskAction, context, elapsedMs);
      }

      // If no fallback, return empty plan
      return {
        id: planId,
        timestamp: new Date().toISOString(),
        taskAction,
        approach: 'Planning failed, no fallback available',
        prerequisites: [],
        steps: [],
        verification: null,
        alternatives: [],
        overallConfidence: 0,
        fallbackUsed: false,
        planningTimeMs: elapsedMs,
        error: error.message,
      };
    }
  }

  /**
   * Build system prompt for planning
   *
   * @returns {string} System prompt
   */
  function buildSystemPrompt() {
    return `You are an expert technical instructor and task planner.

Your job: Generate detailed, executable step-by-step instructions for accomplishing technical tasks.

Key principles:
1. **Be Specific**: Use exact tool names, precise commands, and concrete parameters
2. **Be Thorough**: Include prerequisites, error handling, and verification steps
3. **Be Practical**: Consider common failure modes and provide fallbacks
4. **Be Clear**: Each step should be unambiguous and executable

Think like you're instructing a competent developer who needs to know:
- WHAT to do (precise action)
- HOW to do it (exact tool and command)
- WHAT could go wrong (error handling)
- HOW to verify it worked (success criteria)

Always respond with valid JSON matching the schema provided.`;
  }

  /**
   * Build planning prompt with full context
   *
   * @param {string} taskAction - High-level action to plan
   * @param {PlanningContext} context - Execution context
   * @returns {string} Detailed planning prompt
   */
  function buildPlanningPrompt(taskAction, context) {
    // Format available tools with parameters
    const toolsList = context.availableTools
      .map((tool) => {
        let entry = `- **${tool.name}**: ${tool.description}`;

        // Add parameter information if available
        if (tool.parameters && tool.parameters.properties) {
          const params = Object.entries(tool.parameters.properties)
            .map(([key, schema]) => {
              const required = tool.parameters.required?.includes(key) ? ' (required)' : '';
              const desc = schema.description || '';
              return `    - \`${key}\`${required}: ${desc}`;
            })
            .join('\n');

          if (params) {
            entry += '\n' + params;
          }
        }

        return entry;
      })
      .join('\n\n');

    // Format previous actions (if any)
    const previousActionsText =
      context.previousActions && context.previousActions.length > 0
        ? context.previousActions
            .map((action) => `  - Iteration ${action.iteration}: ${action.action}`)
            .join('\n')
        : '  (No previous actions yet)';

    // Format recent failures (if any)
    const recentFailuresText =
      context.recentFailures && context.recentFailures.length > 0
        ? `\n## Recent Failures to Avoid\n\n${context.recentFailures
            .slice(-3)
            .map(
              (failure) =>
                `- **${failure.tool}** failed: ${failure.error}\n  Root cause: ${failure.diagnosis?.rootCause?.description || 'Unknown'}`
            )
            .join('\n')}\n`
        : '';

    return `# Task Planning Request

## Task to Accomplish

**High-Level Action**: ${taskAction}

**Original User Goal**: ${context.taskGoal}

**Current Context**:
- Working Directory: \`${context.cwd}\`
- Iteration: ${context.iteration}
- Previous Actions:
${previousActionsText}
${recentFailuresText}

## Available Tools

You have access to these tools. **Use exact tool names** from this list:

${toolsList}

**IMPORTANT**: When specifying a tool in your plan, you MUST use one of the exact names listed above.

## Planning Instructions

Generate a detailed, step-by-step plan to accomplish: "${taskAction}"

Consider the following:

### 1. What tools are available?
Choose from the exact tool names listed above. Consider which combination will best accomplish the task.

### 2. What are the prerequisites?
What needs to be checked or verified before starting (e.g., tool availability, authentication, file existence)?

### 3. What's the best approach?
If multiple methods exist, which is most reliable? Consider:
- GitHub repos: \`gh\` command is preferred over \`git\` for authenticated access
- Shell operations: Use \`run_bash\` with the \`script\` parameter (NOT \`command\`)
- File operations: Check existence before reading/writing

### 4. What could go wrong?
For EACH step, consider common failure modes and specify fallback actions:
- Command not found → Try alternative approach
- Permission denied → Check/fix permissions
- File not found → Verify path and retry

### 5. How do I verify success?
What command or check confirms the task completed correctly?

## Output Format

Break the task into 3-7 concrete, executable steps. Each step should specify:
- **step_number**: Sequential number (1, 2, 3, ...)
- **description**: Clear description of what this step does
- **tool**: Exact tool name (from available tools list)
- **args**: Specific parameters as a JSON object
- **expected_outcome**: What should happen if this step succeeds
- **error_handling**: What to do if this step fails
- **confidence**: Your confidence this step will work (0.0 - 1.0)

Include:
- **approach**: Overall strategy summary
- **prerequisites**: List of checks before starting
- **verification**: Command to verify final success
- **alternatives**: Other approaches if the primary plan fails

Respond with JSON only, matching the schema.`;
  }

  /**
   * Get JSON schema for instruction plans
   *
   * @returns {Object} JSON schema
   */
  function getInstructionPlanSchema() {
    return {
      type: 'object',
      properties: {
        approach: {
          type: 'string',
          description: 'Brief description of the overall strategy',
        },
        prerequisites: {
          type: 'array',
          description: 'Checks needed before execution',
          items: {
            type: 'string',
          },
        },
        steps: {
          type: 'array',
          description: 'Detailed executable steps',
          items: {
            type: 'object',
            properties: {
              step_number: {
                type: 'integer',
                description: 'Sequential step number',
              },
              description: {
                type: 'string',
                description: 'Clear description of this step',
              },
              tool: {
                type: 'string',
                description: 'Exact tool name to use',
              },
              args: {
                type: 'object',
                description: 'Tool arguments as key-value pairs',
                additionalProperties: true,
              },
              expected_outcome: {
                type: 'string',
                description: 'What should happen if step succeeds',
              },
              error_handling: {
                type: 'string',
                description: 'What to do if step fails',
              },
              confidence: {
                type: 'number',
                description: 'Confidence this step will work (0.0-1.0)',
                minimum: 0,
                maximum: 1,
              },
            },
            required: [
              'step_number',
              'description',
              'tool',
              'args',
              'expected_outcome',
              'error_handling',
            ],
            additionalProperties: false,
          },
        },
        verification: {
          type: 'object',
          description: 'How to verify overall success',
          properties: {
            check_command: {
              type: 'string',
              description: 'Command to verify success',
            },
            success_criteria: {
              type: 'string',
              description: 'What indicates success',
            },
          },
          required: ['check_command', 'success_criteria'],
          additionalProperties: false,
        },
        alternatives: {
          type: 'array',
          description: 'Alternative approaches if primary fails',
          items: {
            type: 'object',
            properties: {
              approach: {
                type: 'string',
                description: 'Alternative method',
              },
              when_to_use: {
                type: 'string',
                description: 'When to prefer this alternative',
              },
              confidence: {
                type: 'number',
                description: 'Confidence in alternative (0.0-1.0)',
                minimum: 0,
                maximum: 1,
              },
            },
            required: ['approach', 'when_to_use'],
            additionalProperties: false,
          },
        },
      },
      required: ['approach', 'steps'],
      additionalProperties: false,
    };
  }

  /**
   * Validate plan against available tools
   *
   * @param {Object} planData - Raw plan from LLM
   * @param {Array<Object>} availableTools - Available tool list
   * @returns {Object} Validated plan
   */
  function validatePlan(planData, availableTools) {
    const toolNames = new Set(availableTools.map((t) => t.name));

    // Validate each step's tool name
    const validatedSteps = (planData.steps || []).map((step) => {
      if (!toolNames.has(step.tool)) {
        console.warn(
          `[TaskPlanner] Invalid tool "${step.tool}" in step ${step.step_number}, attempting to map to valid tool`
        );

        // Try to map to a valid tool
        const mappedTool = mapToValidTool(step.tool, toolNames);
        if (mappedTool) {
          step.tool = mappedTool;
          console.log(`[TaskPlanner] Mapped to valid tool: ${mappedTool}`);
        } else {
          console.error(`[TaskPlanner] Could not map "${step.tool}" to any valid tool`);
          // Mark step with low confidence
          step.confidence = Math.min(step.confidence || 0.5, 0.3);
        }
      }

      // Ensure confidence is set
      if (typeof step.confidence !== 'number') {
        step.confidence = 0.7; // Default confidence
      }

      return step;
    });

    return {
      ...planData,
      steps: validatedSteps,
    };
  }

  /**
   * Attempt to map invalid tool name to valid one
   *
   * @param {string} invalidTool - Invalid tool name
   * @param {Set<string>} validTools - Set of valid tool names
   * @returns {string|null} Mapped tool name or null
   */
  function mapToValidTool(invalidTool, validTools) {
    const mappings = {
      bash: 'run_bash',
      shell: 'run_bash',
      sh: 'run_bash',
      command: 'run_bash',
      powershell: 'run_powershell',
      ps: 'run_powershell',
      read: 'read_file',
      cat: 'read_file',
      write: 'write_file',
      ls: 'read_dir',
      dir: 'read_dir',
      list: 'read_dir',
      time: 'get_time',
      clock: 'get_time',
    };

    const normalized = invalidTool.toLowerCase();
    const mapped = mappings[normalized];

    return mapped && validTools.has(mapped) ? mapped : null;
  }

  /**
   * Build fallback plan using heuristics (when LLM planning fails)
   *
   * @param {string} planId - Plan ID
   * @param {string} taskAction - Task action
   * @param {PlanningContext} context - Execution context
   * @param {number} elapsedMs - Time elapsed
   * @returns {InstructionPlan} Fallback plan
   */
  function buildFallbackPlan(planId, taskAction, context, elapsedMs) {
    console.log(`[TaskPlanner] ${planId}: Building heuristic fallback plan`);

    const lower = taskAction.toLowerCase();
    let steps = [];

    // Simple heuristic patterns
    if (lower.includes('clone') && lower.includes('github')) {
      const urlMatch = taskAction.match(/https?:\/\/github\.com\/[\w-]+\/[\w-]+/);
      const repoUrl = urlMatch ? urlMatch[0] : '';

      steps = [
        {
          step_number: 1,
          description: 'Check if gh command is available',
          tool: 'run_bash',
          args: { script: 'gh --version' },
          expected_outcome: 'gh version displayed',
          error_handling: 'Fall back to git clone with HTTPS',
          confidence: 0.8,
        },
        {
          step_number: 2,
          description: `Clone repository using gh`,
          tool: 'run_bash',
          args: { script: `gh repo clone ${repoUrl.replace('https://github.com/', '')}` },
          expected_outcome: 'Repository cloned to current directory',
          error_handling: 'Try git clone as fallback',
          confidence: 0.7,
        },
      ];
    } else if (lower.includes('read') || lower.includes('list')) {
      steps = [
        {
          step_number: 1,
          description: 'List directory contents',
          tool: 'read_dir',
          args: { dir: '.' },
          expected_outcome: 'Directory listing displayed',
          error_handling: 'Check path and permissions',
          confidence: 0.9,
        },
      ];
    } else if (lower.includes('write') || lower.includes('create') && (lower.includes('file') || lower.includes('.txt') || lower.includes('.md'))) {
      // Extract filename from task - support paths with slashes
      const filenameMatch = taskAction.match(/(?:file|called|named)\s+([a-z0-9_\-\.\/]+)/i);
      const filename = filenameMatch ? filenameMatch[1] : 'output.txt';

      // Extract content from task (text in quotes, or placeholder if pattern-based)
      const contentMatch = taskAction.match(/(?:text|content)?\s*["']([^"']+)["']/i);
      const content = contentMatch ? contentMatch[1] : 'TODO: Agent should provide content';

      steps = [
        {
          step_number: 1,
          description: `Create file ${filename} with specified content`,
          tool: 'write_file',
          args: { file: filename, content: content.trim() },
          expected_outcome: `File ${filename} created successfully`,
          error_handling: 'Check permissions and file path',
          confidence: 0.8,
        },
      ];
    } else if (lower.includes('read') && (lower.includes('file') || lower.match(/read\s+[a-z0-9_\-\.]+\.txt|\.md|\.json/i))) {
      // Read file task
      const filenameMatch = taskAction.match(/(?:file|read)\s+([a-z0-9_\-\.\/]+)/i);
      const filename = filenameMatch ? filenameMatch[1] : 'README.md';

      steps = [
        {
          step_number: 1,
          description: `Read file ${filename}`,
          tool: 'read_file',
          args: { file: filename },
          expected_outcome: `File contents displayed`,
          error_handling: 'Check if file exists and path is correct',
          confidence: 0.8,
        },
      ];
    } else if (lower.includes('search') || lower.includes('find') || lower.includes('grep')) {
      // Search/find task
      const searchTerm = taskAction.match(/(?:search|find|grep)\s+(?:for\s+)?["']?([^"'\s]+)["']?/i);
      const term = searchTerm ? searchTerm[1] : '';

      if (term) {
        steps = [
          {
            step_number: 1,
            description: `Search for "${term}" in codebase`,
            tool: 'run_bash',
            args: { script: `grep -r "${term}" . || find . -name "*${term}*"` },
            expected_outcome: `Search results for "${term}"`,
            error_handling: 'Try different search pattern or tool',
            confidence: 0.7,
          },
        ];
      } else {
        steps = [
          {
            step_number: 1,
            description: 'List current directory to help with search',
            tool: 'read_dir',
            args: { dir: '.' },
            expected_outcome: 'Directory listing',
            error_handling: 'Check permissions',
            confidence: 0.6,
          },
        ];
      }
    } else if (lower.includes('git status') || lower.includes('git diff') || lower.includes('check changes')) {
      // Git operations
      if (lower.includes('diff')) {
        steps = [
          {
            step_number: 1,
            description: 'Show git diff',
            tool: 'run_bash',
            args: { script: 'git diff' },
            expected_outcome: 'Git diff output',
            error_handling: 'Check if in git repository',
            confidence: 0.9,
          },
        ];
      } else {
        steps = [
          {
            step_number: 1,
            description: 'Show git status',
            tool: 'run_bash',
            args: { script: 'git status' },
            expected_outcome: 'Git status output',
            error_handling: 'Check if in git repository',
            confidence: 0.9,
          },
        ];
      }
    } else if (lower.includes('install') || lower.includes('npm') && lower.includes('install')) {
      // Install/setup task
      const isNpmInstall = lower.includes('npm');

      steps = [
        {
          step_number: 1,
          description: isNpmInstall ? 'Install npm dependencies' : 'Install dependencies',
          tool: 'run_bash',
          args: { script: isNpmInstall ? 'npm install' : 'echo "Specify package manager"' },
          expected_outcome: 'Dependencies installed',
          error_handling: 'Check package.json exists and permissions',
          confidence: 0.8,
        },
      ];
    } else if (lower.includes('test') && (lower.includes('run') || lower.includes('execute'))) {
      // Test execution task
      let testCommand = 'npm test';

      if (lower.includes('pytest')) {
        testCommand = 'pytest';
      } else if (lower.includes('jest')) {
        testCommand = 'npm run test:jest || jest';
      } else if (lower.includes('vitest')) {
        testCommand = 'npm run test:vitest || vitest run';
      } else if (lower.includes('mocha')) {
        testCommand = 'npm run test:mocha || mocha';
      } else if (lower.includes('npm')) {
        testCommand = 'npm test';
      }

      steps = [
        {
          step_number: 1,
          description: `Run tests using ${testCommand}`,
          tool: 'run_bash',
          args: { script: testCommand },
          expected_outcome: 'Tests executed and results displayed',
          error_handling: 'Check test framework installed and test files exist',
          confidence: 0.85,
        },
      ];
    } else if (lower.includes('build') || lower.includes('compile')) {
      // Build/compile task
      let buildCommand = 'npm run build';

      if (lower.includes('make')) {
        buildCommand = 'make';
      } else if (lower.includes('cargo')) {
        buildCommand = 'cargo build';
      } else if (lower.includes('maven') || lower.includes('mvn')) {
        buildCommand = 'mvn package';
      } else if (lower.includes('gradle')) {
        buildCommand = 'gradle build';
      } else if (lower.includes('tsc') || lower.includes('typescript')) {
        buildCommand = 'npm run build || tsc';
      } else if (lower.includes('vite')) {
        buildCommand = 'npm run build || vite build';
      }

      steps = [
        {
          step_number: 1,
          description: `Build project using ${buildCommand}`,
          tool: 'run_bash',
          args: { script: buildCommand },
          expected_outcome: 'Project built successfully',
          error_handling: 'Check build configuration and dependencies',
          confidence: 0.85,
        },
      ];
    } else if (lower.includes('run') && (lower.includes('dev') || lower.includes('start') || lower.includes('serve'))) {
      // Run/start development server task
      let runCommand = 'npm run dev';

      if (lower.includes('vite')) {
        runCommand = 'npm run dev || vite';
      } else if (lower.includes('next')) {
        runCommand = 'npm run dev || next dev';
      } else if (lower.includes('react')) {
        runCommand = 'npm start || npm run dev';
      } else if (lower.includes('python')) {
        const scriptMatch = taskAction.match(/python\s+([a-z0-9_\-\.\/]+\.py)/i);
        runCommand = scriptMatch ? `python ${scriptMatch[1]}` : 'python app.py';
      } else if (lower.includes('node')) {
        const scriptMatch = taskAction.match(/node\s+([a-z0-9_\-\.\/]+\.js)/i);
        runCommand = scriptMatch ? `node ${scriptMatch[1]}` : 'node server.js';
      }

      steps = [
        {
          step_number: 1,
          description: `Start development server using ${runCommand}`,
          tool: 'run_bash',
          args: { script: runCommand },
          expected_outcome: 'Development server running',
          error_handling: 'Check port availability and dependencies',
          confidence: 0.8,
        },
      ];
    } else if (lower.includes('log') || lower.includes('debug') || lower.includes('error')) {
      // Debug/log viewing task
      let logCommand = 'tail -100 *.log';

      if (lower.includes('npm')) {
        logCommand = 'npm run dev 2>&1 | tail -100';
      } else if (lower.includes('docker')) {
        logCommand = 'docker logs $(docker ps -q) --tail 100';
      } else if (lower.includes('tail')) {
        const fileMatch = taskAction.match(/tail.*?([a-z0-9_\-\.\/]+\.log)/i);
        logCommand = fileMatch ? `tail -100 ${fileMatch[1]}` : 'tail -100 *.log';
      }

      steps = [
        {
          step_number: 1,
          description: `View logs using ${logCommand}`,
          tool: 'run_bash',
          args: { script: logCommand },
          expected_outcome: 'Log contents displayed',
          error_handling: 'Check if log files exist',
          confidence: 0.75,
        },
      ];
    } else if ((lower.includes('clone') || lower.includes('install')) && lower.includes('then')) {
      // Multi-step: clone then install (complex workflow)
      const urlMatch = taskAction.match(/https?:\/\/github\.com\/[\w-]+\/[\w-]+/);
      const repoUrl = urlMatch ? urlMatch[0] : '';

      if (repoUrl) {
        steps = [
          {
            step_number: 1,
            description: 'Clone repository',
            tool: 'run_bash',
            args: { script: `git clone ${repoUrl}` },
            expected_outcome: 'Repository cloned',
            error_handling: 'Check git is installed and URL is correct',
            confidence: 0.8,
          },
          {
            step_number: 2,
            description: 'Install dependencies',
            tool: 'run_bash',
            args: { script: `cd $(basename ${repoUrl} .git) && npm install` },
            expected_outcome: 'Dependencies installed',
            error_handling: 'Check package.json exists',
            confidence: 0.75,
          },
        ];
      } else {
        // Fallback to single install step
        steps = [
          {
            step_number: 1,
            description: 'Install dependencies',
            tool: 'run_bash',
            args: { script: 'npm install' },
            expected_outcome: 'Dependencies installed',
            error_handling: 'Check package.json exists',
            confidence: 0.7,
          },
        ];
      }
    } else if (lower.includes('docker')) {
      // Docker/container operations
      let dockerCommand = 'docker ps';

      if (lower.includes('build')) {
        dockerCommand = 'docker build -t app .';
      } else if (lower.includes('run')) {
        dockerCommand = 'docker run -d app';
      } else if (lower.includes('exec')) {
        dockerCommand = 'docker exec -it $(docker ps -q) /bin/bash';
      } else if (lower.includes('compose')) {
        if (lower.includes('up')) {
          dockerCommand = 'docker compose up -d';
        } else if (lower.includes('down')) {
          dockerCommand = 'docker compose down';
        } else {
          dockerCommand = 'docker compose ps';
        }
      } else if (lower.includes('ps') || lower.includes('list')) {
        dockerCommand = 'docker ps';
      } else if (lower.includes('stop')) {
        dockerCommand = 'docker stop $(docker ps -q)';
      }

      steps = [
        {
          step_number: 1,
          description: `Execute Docker command: ${dockerCommand}`,
          tool: 'run_bash',
          args: { script: dockerCommand },
          expected_outcome: 'Docker command executed',
          error_handling: 'Check Docker is installed and running',
          confidence: 0.8,
        },
      ];
    } else if (lower.includes('move') || lower.includes('rename') || lower.includes('copy') || lower.includes('delete') || lower.includes('remove')) {
      // File manipulation operations
      let fileCommand = '';
      let description = '';
      const fileMatch = taskAction.match(/([a-z0-9_\-\.\/]+\.[a-z0-9]+)/i);
      const file = fileMatch ? fileMatch[1] : 'file.txt';

      if (lower.includes('move') || lower.includes('rename')) {
        const destinationMatch = taskAction.match(/to\s+([a-z0-9_\-\.\/]+)/i);
        const destination = destinationMatch ? destinationMatch[1] : `${file}.moved`;
        fileCommand = `mv ${file} ${destination}`;
        description = `Move/rename ${file} to ${destination}`;
      } else if (lower.includes('copy')) {
        const destinationMatch = taskAction.match(/to\s+([a-z0-9_\-\.\/]+)/i);
        const destination = destinationMatch ? destinationMatch[1] : `${file}.copy`;
        fileCommand = `cp ${file} ${destination}`;
        description = `Copy ${file} to ${destination}`;
      } else if (lower.includes('delete') || lower.includes('remove')) {
        fileCommand = `rm ${file}`;
        description = `Delete ${file}`;
      }

      steps = [
        {
          step_number: 1,
          description: description,
          tool: 'run_bash',
          args: { script: fileCommand },
          expected_outcome: 'File operation completed',
          error_handling: 'Check file exists and permissions',
          confidence: 0.75,
        },
      ];
    } else if (lower.includes('count') || lower.includes('how many')) {
      // Count operations (lines, files, etc.)
      let countCommand = 'ls -1 | wc -l';

      if (lower.includes('lines')) {
        const fileMatch = taskAction.match(/(?:in|of)\s+([a-z0-9_\-\.\/]+)/i);
        const file = fileMatch ? fileMatch[1] : '*.txt';
        countCommand = `wc -l ${file}`;
      } else if (lower.includes('files')) {
        countCommand = 'find . -type f | wc -l';
      } else if (lower.includes('words')) {
        const fileMatch = taskAction.match(/(?:in|of)\s+([a-z0-9_\-\.\/]+)/i);
        const file = fileMatch ? fileMatch[1] : '*.txt';
        countCommand = `wc -w ${file}`;
      }

      steps = [
        {
          step_number: 1,
          description: `Count using: ${countCommand}`,
          tool: 'run_bash',
          args: { script: countCommand },
          expected_outcome: 'Count result displayed',
          error_handling: 'Check files exist',
          confidence: 0.8,
        },
      ];
    } else {
      // Generic fallback
      steps = [
        {
          step_number: 1,
          description: 'Execute generic action',
          tool: 'get_time',
          args: {},
          expected_outcome: 'Current time displayed (no specific action inferred)',
          error_handling: 'Request clarification from user',
          confidence: 0.3,
        },
      ];
    }

    return {
      id: planId,
      timestamp: new Date().toISOString(),
      taskAction,
      approach: 'Heuristic fallback plan (LLM planning failed)',
      prerequisites: [],
      steps,
      verification: null,
      alternatives: [],
      overallConfidence: steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length,
      fallbackUsed: true,
      planningTimeMs: elapsedMs,
    };
  }

  return {
    generateInstructions,
  };
}
