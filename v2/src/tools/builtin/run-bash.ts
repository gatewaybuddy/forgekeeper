/**
 * Run bash command tool
 */
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { Tool, ToolResult, ToolExecutionContext } from '../types.js';
import { validateArgs, expandTilde, FS_ROOT } from '../sandbox.js';

const execAsync = promisify(exec);

export const runBashTool: Tool = {
  definition: {
    type: 'function',
    function: {
      name: 'run_bash',
      description:
        'Execute a bash command. Returns stdout, stderr, and exit code. Use with caution.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Bash command to execute',
          },
          cwd: {
            type: 'string',
            description: 'Working directory (default: sandbox root)',
          },
          timeout: {
            type: 'integer',
            description: 'Timeout in milliseconds (default: 30000)',
          },
        },
        required: ['command'],
        additionalProperties: false,
      },
      strict: true,
    },
  },

  async run(args, context?: ToolExecutionContext): Promise<ToolResult> {
    try {
      validateArgs(args, ['command']);

      const { command, cwd, timeout = 30000 } = args;

      // Determine working directory
      const workingDir = cwd ? expandTilde(cwd) : context?.workingDirectory || FS_ROOT;

      // Execute command
      const startTime = Date.now();

      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: workingDir,
          timeout,
          maxBuffer: 10 * 1024 * 1024, // 10MB
          env: {
            ...process.env,
            ...context?.environment,
          },
        });

        const executionTime = Date.now() - startTime;

        return {
          success: true,
          output: {
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: 0,
            command,
            cwd: workingDir,
            executionTime,
          },
          executionTime,
        };
      } catch (error: any) {
        const executionTime = Date.now() - startTime;

        // Command failed but executed
        if (error.code !== undefined) {
          return {
            success: false,
            output: {
              stdout: error.stdout?.trim() || '',
              stderr: error.stderr?.trim() || '',
              exitCode: error.code,
              command,
              cwd: workingDir,
              executionTime,
            },
            error: `Command exited with code ${error.code}`,
            executionTime,
          };
        }

        // Other error (timeout, etc.)
        throw error;
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
