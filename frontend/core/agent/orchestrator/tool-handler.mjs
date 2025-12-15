/**
 * Tool Handler for Autonomous Agent
 *
 * Handles all tool-related operations:
 * - Tool planning and execution
 * - Heuristic tool inference from natural language
 * - Argument construction
 * - Recovery execution
 *
 * Extracted from autonomous.mjs to improve modularity and testability.
 */

import { ulid } from 'ulid';
import { contextLogEvents } from '../../services/contextlog-events.mjs';

/**
 * Tool Handler - manages tool planning, inference, and execution
 */
export class ToolHandler {
  /**
   * @param {Object} config - Configuration object
   * @param {Object} config.taskPlanner - Task planner subsystem
   */
  constructor(config) {
    this.taskPlanner = config.taskPlanner;
  }

  /**
   * Plan tool execution based on reflection
   *
   * @param {Object} reflection - Reflection result
   * @returns {Object} Plan with steps array
   */
  planExecution(reflection) {
    // If reflection includes specific tool plan, use it
    if (reflection.tool_plan && reflection.tool_plan.tool) {
      return {
        steps: [
          {
            tool: reflection.tool_plan.tool,
            args: this.inferToolArgs(reflection.tool_plan.tool, reflection.next_action),
            purpose: reflection.tool_plan.purpose,
          },
        ],
      };
    }

    // Otherwise, infer from next_action description
    const steps = this.inferToolsFromAction(reflection.next_action, {});

    return { steps };
  }

  /**
   * Convert instruction plan from task planner to executable format
   *
   * @param {Object} instructionPlan - Plan from task planner
   * @returns {Object} Executable plan with steps
   */
  convertInstructionsToPlan(instructionPlan) {
    return {
      steps: instructionPlan.steps.map(step => ({
        tool: step.tool,
        args: step.args || {},
        purpose: step.description,
        expectedOutcome: step.expected_outcome,
        errorHandling: step.error_handling,
        confidence: step.confidence,
      })),
      verification: instructionPlan.verification,
      prerequisites: instructionPlan.prerequisites,
      alternatives: instructionPlan.alternatives,
    };
  }

  /**
   * Build available tools list for task planner
   *
   * @param {Object} executor - Tool executor with registry
   * @returns {Array} Available tools with descriptions
   */
  buildToolsList(executor) {
    if (!executor || !executor.toolRegistry) {
      return [];
    }

    return Array.from(executor.toolRegistry.entries()).map(([name, tool]) => ({
      name,
      description: tool.description || 'No description',
      parameters: tool.parameters || {},
    }));
  }

  /**
   * Execute recovery steps for error recovery
   *
   * @param {Array} steps - Recovery steps to execute
   * @param {Object} executor - Tool executor
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Recovery result
   */
  async executeRecoverySteps(steps, executor, context) {
    let summary = '';
    let success = false;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      try {
        console.log(`[ToolHandler] Recovery step ${i + 1}/${steps.length}: ${step.tool}(${JSON.stringify(step.args).slice(0, 50)}...)`);

        // Execute tool via executor
        const result = await executor.executeTool(
          {
            type: 'function',
            function: {
              name: step.tool,
              arguments: typeof step.args === 'string' ? step.args : JSON.stringify(step.args),
            },
          },
          {
            ...context,
            cwd: context.sandboxRoot || '.',
            sandboxRoot: context.sandboxRoot || '.',
          }
        );

        // Check if recovery step succeeded
        if (result.error) {
          summary += `Step ${i + 1} FAILED: ${result.error.message}\n`;
          console.error(`[ToolHandler] Recovery step ${i + 1} failed:`, result.error);
          success = false;
          break; // Stop trying recovery if any step fails
        } else {
          const resultPreview = result.content.length > 100
            ? result.content.slice(0, 100) + '...'
            : result.content;
          summary += `Step ${i + 1} OK: ${resultPreview}\n`;
          success = true; // Mark as success if at least steps complete
        }
      } catch (error) {
        summary += `Step ${i + 1} ERROR: ${error.message}\n`;
        console.error(`[ToolHandler] Recovery step ${i + 1} threw:`, error);
        success = false;
        break;
      }
    }

    return {
      success,
      summary: summary.trim(),
      stepsCompleted: success ? steps.length : 0,
    };
  }

  /**
   * Infer tool calls from action description
   *
   * Enhanced heuristic-based inference for common patterns including
   * research, multi-step, and documentation tasks
   *
   * @param {string} action - Action description
   * @param {Object} state - Current agent state
   * @returns {Array} Array of tool call steps
   */
  inferToolsFromAction(action, state) {
    const actionStr = String(action || '');
    const lower = actionStr.toLowerCase();
    const steps = [];

    // Exploratory task - multi-tool search plan
    const taskStr = String(state.task || actionStr);
    const iteration = Number(state.iteration ?? 1);
    const taskType = this.detectTaskType(taskStr);

    if (taskType === 'exploratory' && iteration <= 3) {
      // First 3 iterations: cast a wide net with multiple tools
      const keywords = this.extractKeywords(taskStr);

      // Always start with directory exploration
      steps.push({
        tool: 'read_dir',
        args: { path: '.' },
        purpose: 'Explore root directory structure',
      });

      if (keywords.length > 0) {
        // Build find command with keywords
        const namePatterns = keywords.map(kw => `-name "*${kw}*"`).join(' -o ');
        steps.push({
          tool: 'run_bash',
          args: { command: `find . \\( ${namePatterns} \\) -type f 2>/dev/null | head -20` },
          purpose: `Find files matching keywords: ${keywords.join(', ')}`,
        });

        // Build grep command for content search
        const grepPattern = keywords.join('\\|');
        steps.push({
          tool: 'run_bash',
          args: { command: `grep -r -i "${grepPattern}" . --include="*.py" --include="*.js" --include="*.mjs" --include="*.md" --include="*.txt" 2>/dev/null | head -15` },
          purpose: `Search file contents for: ${keywords.join(', ')}`,
        });
      }

      return steps;
    }

    // Research/Analysis: Explore codebase
    if (lower.includes('explore') || lower.includes('analyze codebase') || lower.includes('examine structure')) {
      steps.push({
        tool: 'read_dir',
        args: { path: '.' },
        purpose: 'Explore directory structure',
      });
      return steps;
    }

    // Research: Find files matching pattern
    if (lower.includes('find all') || lower.includes('locate')) {
      const filePattern = this.extractFilePattern(action);
      if (filePattern) {
        steps.push({
          tool: 'run_bash',
          args: { command: `find . -name "${filePattern}" -type f | head -20` },
          purpose: 'Find files matching pattern',
        });
      } else {
        steps.push({
          tool: 'run_bash',
          args: { command: 'find . -type f -name "*.py" -o -name "*.js" -o -name "*.mjs" | head -20' },
          purpose: 'Find code files',
        });
      }
      return steps;
    }

    // Research: Search for content
    if (lower.includes('search for') || lower.includes('grep')) {
      const searchTerm = this.extractSearchTerm(action);
      if (searchTerm) {
        steps.push({
          tool: 'run_bash',
          args: { command: `grep -r "${searchTerm}" . --include="*.py" --include="*.js" --include="*.mjs" | head -20` },
          purpose: 'Search for pattern in code',
        });
      }
      return steps;
    }

    // Documentation: Read multiple files
    if (lower.includes('read') && (lower.includes('all') || lower.includes('multiple'))) {
      // Will need to be followed up with specific file reads
      steps.push({
        tool: 'read_dir',
        args: { path: '.' },
        purpose: 'List files to read',
      });
      return steps;
    }

    // File operations: Create
    if (lower.includes('create') && (lower.includes('file') || lower.includes('.py') || lower.includes('.js') || lower.includes('.md'))) {
      const match = action.match(/create\s+(\S+\.\w+)/i);
      if (match) {
        const fileName = match[1];
        const content = this.generateInitialContent(fileName);
        steps.push({
          tool: 'write_file',
          args: { path: fileName, content },
          purpose: 'Create file',
        });
      }
      return steps;
    }

    // File operations: Write/Update
    if (lower.includes('write') || lower.includes('update')) {
      const match = action.match(/(?:write|update)\s+(\S+\.\w+)/i);
      if (match) {
        steps.push({
          tool: 'write_file',
          args: { path: match[1], content: '# Content to be added\n' },
          purpose: 'Write to file',
        });
      }
      return steps;
    }

    // File operations: Read specific file
    if (lower.includes('read')) {
      const match = action.match(/read\s+(\S+\.\w+)/i) || action.match(/read\s+file\s+(\S+)/i);
      if (match) {
        steps.push({
          tool: 'read_file',
          args: { path: match[1] },
          purpose: 'Read file',
        });
        return steps;
      }
    }

    // Directory operations
    if (lower.includes('list') || lower.includes('directory') || lower.includes('ls ')) {
      const pathMatch = action.match(/(?:list|directory|ls)\s+(\S+)/i);
      const path = pathMatch ? pathMatch[1] : '.';
      steps.push({
        tool: 'read_dir',
        args: { path },
        purpose: 'List directory',
      });
      return steps;
    }

    // Testing: Run tests
    if (lower.includes('test') && (lower.includes('run') || lower.includes('execute'))) {
      const testCmd = this.inferTestCommand(action);
      steps.push({
        tool: 'run_bash',
        args: { command: testCmd },
        purpose: 'Run tests',
      });
      return steps;
    }

    // Shell commands: Generic execution
    if (lower.includes('run') || lower.includes('execute')) {
      const match = action.match(/(?:run|execute)\s+(.+)/i);
      if (match) {
        steps.push({
          tool: 'run_bash',
          args: { command: match[1].trim() },
          purpose: 'Execute command',
        });
      }
      return steps;
    }

    // Documentation: Create README
    if (lower.includes('readme') || lower.includes('documentation')) {
      steps.push({
        tool: 'write_file',
        args: {
          path: 'README.md',
          content: '# Documentation\n\n## Overview\n\n(To be completed)\n'
        },
        purpose: 'Create documentation',
      });
      return steps;
    }

    // Fallback: read_dir to explore
    steps.push({
      tool: 'read_dir',
      args: { path: '.' },
      purpose: 'Explore current directory',
    });

    return steps;
  }

  /**
   * Extract file pattern from action description
   *
   * @param {string} action - Action text
   * @returns {string|null} File pattern or null
   */
  extractFilePattern(action) {
    const patterns = [
      /find\s+all\s+(\S+\.\w+)/i,
      /locate\s+(\S+\.\w+)/i,
      /files?\s+matching\s+['"]*([^'"]+)['"]/i,
    ];

    for (const pattern of patterns) {
      const match = action.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  /**
   * Extract search term from action description
   *
   * @param {string} action - Action text
   * @returns {string|null} Search term or null
   */
  extractSearchTerm(action) {
    const patterns = [
      /search\s+for\s+['"]*([^'"]+)['"]/i,
      /grep\s+['"]*([^'"]+)['"]/i,
      /find.*containing\s+['"]*([^'"]+)['"]/i,
    ];

    for (const pattern of patterns) {
      const match = action.match(pattern);
      if (match) return match[1];
    }

    return null;
  }

  /**
   * Generate initial file content based on filename
   *
   * @param {string} filename - File name
   * @returns {string} Initial file content
   */
  generateInitialContent(filename) {
    const ext = filename.split('.').pop();

    switch (ext) {
      case 'py':
        return '#!/usr/bin/env python3\n"""TODO: Add docstring"""\n\ndef main():\n    pass\n\nif __name__ == "__main__":\n    main()\n';

      case 'js':
      case 'mjs':
        return '/**\n * TODO: Add description\n */\n\nfunction main() {\n  // TODO: Implement\n}\n\nif (require.main === module) {\n  main();\n}\n';

      case 'md':
        return `# ${filename.replace('.md', '')}\n\n## Overview\n\n(To be completed)\n`;

      case 'txt':
        return '';

      default:
        return '# TODO: Implement\n';
    }
  }

  /**
   * Infer test command from action/context
   *
   * @param {string} action - Action text
   * @returns {string} Test command
   */
  inferTestCommand(action) {
    const lower = action.toLowerCase();

    if (lower.includes('pytest')) {
      return 'pytest -v';
    }

    if (lower.includes('npm test') || lower.includes('jest')) {
      return 'npm test';
    }

    if (lower.includes('python')) {
      const match = action.match(/test[_-](\w+)\.py/i);
      if (match) {
        return `python test_${match[1]}.py`;
      }
      return 'python -m pytest';
    }

    // Default Python test
    return 'python -m pytest -v';
  }

  /**
   * Infer tool arguments from context
   *
   * @param {string} tool - Tool name
   * @param {string} context - Context string
   * @returns {Object} Tool arguments
   */
  inferToolArgs(tool, context) {
    // Context-aware argument inference using pattern matching
    const contextStr = String(context || '').trim();

    switch (tool) {
      case 'write_file': {
        // Extract file path - look for paths with extensions like .txt, .json, etc
        let file = 'output.txt'; // default
        let content = contextStr;

        // Pattern 1: Look for any path ending in .ext (with forward slashes)
        // Matches: frontend/AUTONOMOUS_DEPLOYMENT_TEST_MARKER.txt, src/index.js, etc.
        const pathPattern = /([a-z0-9_\-]+(?:\/[a-z0-9_\-]+)*\.[a-z]{2,5})/i;
        const pathMatch = contextStr.match(pathPattern);
        if (pathMatch) {
          file = pathMatch[1];
        }

        // For content, we won't use the whole context since it contains the instruction
        // Default to a placeholder that indicates the agent needs to provide actual content
        content = "TODO: Agent should provide content";

        return { file, content };
      }

      case 'read_file': {
        // Extract file path
        let file = 'input.txt'; // default

        const quotedPath = contextStr.match(/["']([^"']+\.[a-z]{2,5})["']/i);
        if (quotedPath) {
          file = quotedPath[1];
        } else {
          const unquotedPath = contextStr.match(/\b([a-z0-9_\-\/\.]+\.[a-z]{2,5})\b/i);
          if (unquotedPath) {
            file = unquotedPath[1];
          } else {
            const colonPath = contextStr.match(/file[:\s]+([a-z0-9_\-\/\.]+\.[a-z]{2,5})/i);
            if (colonPath) {
              file = colonPath[1];
            }
          }
        }

        return { file };
      }

      case 'read_dir': {
        // Extract directory path
        let dir = '.'; // default to current directory

        // Pattern 1: "directory/path" or 'directory/path'
        const quotedDir = contextStr.match(/["']([a-z0-9_\-\/\.]+\/?)["']/i);
        if (quotedDir && !quotedDir[1].includes('.')) { // No extension = likely a directory
          dir = quotedDir[1];
        } else {
          // Pattern 2: dir: path or directory: path
          const colonDir = contextStr.match(/(?:dir|directory)[:\s]+([a-z0-9_\-\/\.]+)/i);
          if (colonDir) {
            dir = colonDir[1];
          } else {
            // Pattern 3: "list contents of X" or "list files in X"
            const listMatch = contextStr.match(/(?:list|check|view|see).+?(?:of|in)\s+([a-z0-9_\-\/\.]+)/i);
            if (listMatch) {
              dir = listMatch[1];
            }
          }
        }

        return { dir };
      }

      case 'run_bash': {
        // Extract bash command/script
        let script = 'echo "TODO"'; // default

        // Pattern 1: "command" or 'command'
        const quotedCmd = contextStr.match(/["']([^"']+)["']/);
        if (quotedCmd) {
          script = quotedCmd[1];
        } else {
          // Pattern 2: script: command or command: command
          const colonCmd = contextStr.match(/(?:script|command)[:\s]+(.+?)(?:\n|$)/i);
          if (colonCmd) {
            script = colonCmd[1].trim();
          } else {
            // Pattern 3: Just use the whole context if it looks like a command
            if (contextStr.length < 200 && (
              contextStr.includes('ls ') ||
              contextStr.includes('cd ') ||
              contextStr.includes('git ') ||
              contextStr.includes('npm ') ||
              contextStr.includes('docker ') ||
              contextStr.includes('echo ')
            )) {
              script = contextStr;
            }
          }
        }

        return { script };
      }

      case 'git_add': {
        // Extract files to stage
        let files = ['.'];

        const quotedFiles = contextStr.match(/["']([^"']+)["']/);
        if (quotedFiles) {
          files = [quotedFiles[1]];
        } else {
          const pathMatch = contextStr.match(/\b([a-z0-9_\-\/\.]+\.[a-z]{2,5})\b/i);
          if (pathMatch) {
            files = [pathMatch[1]];
          }
        }

        return { files };
      }

      case 'git_commit': {
        // Extract commit message
        let message = 'Update';

        const quotedMsg = contextStr.match(/["']([^"']+)["']/);
        if (quotedMsg) {
          message = quotedMsg[1];
        } else {
          const msgMatch = contextStr.match(/message[:\s]+(.+?)(?:\n\n|\n-|$)/is);
          if (msgMatch) {
            message = msgMatch[1].trim();
          }
        }

        return { message };
      }

      default:
        return {};
    }
  }

  /**
   * Extract meaningful keywords from task description
   *
   * @param {string} task - Task description
   * @returns {Array<string>} Array of keywords
   */
  extractKeywords(task) {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can', 'may', 'might']);
    const words = String(task || '').toLowerCase().split(/\s+/);
    const keywords = [];

    words.forEach(word => {
      const cleaned = word.replace(/[^a-z0-9_-]/g, '');
      if (cleaned.length >= 3 && !stopWords.has(cleaned)) {
        if (!keywords.includes(cleaned)) {
          keywords.push(cleaned);
        }
      }
    });

    return keywords.slice(0, 5); // Limit to 5 most relevant keywords
  }

  /**
   * Detect task type for specialized handling
   *
   * @param {string} task - Task description
   * @returns {string} Task type
   */
  detectTaskType(task) {
    const safe = String(task || '');
    const lower = safe.toLowerCase();
    if (!safe.trim()) return 'simple';

    // Exploratory/uncertain tasks (check FIRST - highest priority for vague tasks)
    const exploratoryPatterns = [
      /see\s+if/i,
      /check\s+(whether|if)/i,
      /find\s+out/i,
      /look\s+(for|in)/i,
      /do\s+you\s+have/i,
      /are\s+there/i,
      /locate/i,
      /search\s+for/i,
    ];

    if (exploratoryPatterns.some(pattern => pattern.test(task))) {
      return 'exploratory';
    }

    // Check documentation first (more specific than research)
    if (lower.includes('readme') || lower.includes('documentation') || lower.includes('docs')) {
      return 'documentation';
    }

    // Research tasks
    if (lower.includes('analyze') || lower.includes('research') || lower.includes('find') || lower.includes('document')) {
      return 'research';
    }

    // Multi-step with tests
    if (lower.includes('test') && (lower.includes('create') || lower.includes('write'))) {
      return 'multi-step';
    }

    // Self-improvement
    if (lower.includes('refactor') || lower.includes('improve') || lower.includes('optimize')) {
      return 'self-improvement';
    }

    // Multi-step indicators
    if (lower.includes('multiple') || lower.includes('several') || lower.match(/\d+\s+(files|functions|tests)/)) {
      return 'multi-step';
    }

    return 'simple';
  }
}
