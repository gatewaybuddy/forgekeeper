// Code skill - writing, editing, and refactoring code
import { execute } from '../core/claude.js';
import { learnings } from '../core/memory.js';

export default {
  name: 'code',
  description: 'Write, edit, refactor, or fix code',
  triggers: ['write', 'create', 'implement', 'build', 'code', 'function', 'class', 'component', 'fix', 'bug', 'refactor', 'edit'],

  approval: {
    required: false,
    level: 'notify',
  },

  async execute(task) {
    const description = task.description.toLowerCase();

    // Determine code task type
    let type = 'write';
    if (description.includes('fix') || description.includes('bug') || description.includes('error')) {
      type = 'fix';
    } else if (description.includes('refactor') || description.includes('improve') || description.includes('clean')) {
      type = 'refactor';
    } else if (description.includes('test')) {
      type = 'test';
    }

    // Get relevant learnings for context
    const relevantLearnings = learnings.find(['code', type], 0.5);
    const learningContext = relevantLearnings.length > 0
      ? `\nRelevant learnings:\n${relevantLearnings.map(l => `- ${l.observation}`).join('\n')}`
      : '';

    const prompts = {
      write: `Write code: ${task.description}
${learningContext}

Guidelines:
1. Understand the requirements first
2. Check existing code patterns in the project
3. Write clean, maintainable code
4. Add necessary imports
5. Follow project conventions

Do NOT over-engineer. Keep it simple and focused.`,

      fix: `Fix bug: ${task.description}
${learningContext}

Steps:
1. Understand the error/issue
2. Locate the relevant code
3. Identify the root cause
4. Apply a minimal fix
5. Verify the fix doesn't break other things

Explain what you found and what you fixed.`,

      refactor: `Refactor code: ${task.description}
${learningContext}

Guidelines:
1. Understand the current implementation
2. Identify what needs improvement
3. Make incremental changes
4. Preserve functionality
5. Improve readability/maintainability

Do NOT change behavior unless explicitly requested.`,

      test: `Write tests: ${task.description}
${learningContext}

Guidelines:
1. Identify what needs testing
2. Follow existing test patterns
3. Write clear, focused tests
4. Cover edge cases
5. Make tests maintainable

Focus on meaningful coverage, not just line count.`,
    };

    const result = await execute({
      description: prompts[type],
      tags: ['code', type],
    }, {
      allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
    });

    return result;
  },

  async validate(result) {
    // Basic validation - check for common error patterns
    if (result.output) {
      const output = result.output.toLowerCase();
      // Check for syntax errors, crashes, etc.
      if (output.includes('syntaxerror') || output.includes('traceback') || output.includes('undefined is not')) {
        return false;
      }
    }
    return result.success;
  },
};
