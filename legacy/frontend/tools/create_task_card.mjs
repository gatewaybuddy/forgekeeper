/**
 * create_task_card - Create a new task card in forgekeeper/tasks.md
 *
 * Enables the autonomous agent to create structured task cards from
 * improvement opportunities identified through telemetry or self-analysis.
 *
 * Part of the autonomous self-improvement loop (codex.plan Phase 1).
 */

import fs from 'fs/promises';
import path from 'path';

export const def = {
  type: 'function',
  function: {
    name: 'create_task_card',
    description: 'Create a new task card in forgekeeper/tasks.md with structured fields following the project task card format',
    parameters: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          pattern: '^T[0-9]+$',
          description: 'Task ID in format T<NUMBER> (e.g., T300, T301). Must be unique.'
        },
        title: {
          type: 'string',
          description: 'Short descriptive title for the task (50 chars max recommended)'
        },
        goal: {
          type: 'string',
          description: 'What this task accomplishes and why it matters'
        },
        scope: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific items/features included in this task (bullet points)'
        },
        out_of_scope: {
          type: 'array',
          items: { type: 'string' },
          description: 'What is explicitly NOT included (bullet points)'
        },
        allowed_touches: {
          type: 'array',
          items: { type: 'string' },
          description: 'File paths or globs that this task is allowed to modify (e.g., "forgekeeper/frontend/tools/*.mjs")'
        },
        done_when: {
          type: 'array',
          items: { type: 'string' },
          description: 'Concrete acceptance criteria that can be verified (bullet points)'
        },
        test_level: {
          type: 'string',
          enum: ['smoke', 'unit', 'integration', 'documentation'],
          description: 'Required test coverage level for this task'
        }
      },
      required: ['task_id', 'title', 'goal', 'scope', 'out_of_scope', 'allowed_touches', 'done_when', 'test_level'],
      additionalProperties: false
    },
    strict: true
  }
};

export async function run(args = {}) {
  // Validate required arguments
  const { task_id, title, goal, scope, out_of_scope, allowed_touches, done_when, test_level } = args;

  // Validate task_id format
  if (!task_id || typeof task_id !== 'string') {
    return { error: 'task_id is required and must be a string' };
  }

  const taskIdPattern = /^T[0-9]+$/;
  if (!taskIdPattern.test(task_id)) {
    return { error: `Invalid task_id format: "${task_id}". Must match pattern T<NUMBER> (e.g., T300)` };
  }

  // Validate title
  if (!title || typeof title !== 'string') {
    return { error: 'title is required and must be a string' };
  }

  // Validate arrays
  if (!Array.isArray(scope) || scope.length === 0) {
    return { error: 'scope is required and must be a non-empty array' };
  }
  if (!Array.isArray(out_of_scope)) {
    return { error: 'out_of_scope is required and must be an array' };
  }
  if (!Array.isArray(allowed_touches) || allowed_touches.length === 0) {
    return { error: 'allowed_touches is required and must be a non-empty array' };
  }
  if (!Array.isArray(done_when) || done_when.length === 0) {
    return { error: 'done_when is required and must be a non-empty array' };
  }

  // Validate test_level
  const validTestLevels = ['smoke', 'unit', 'integration', 'documentation'];
  if (!validTestLevels.includes(test_level)) {
    return { error: `test_level must be one of: ${validTestLevels.join(', ')}` };
  }

  // Determine tasks.md path (relative to repo root)
  const repoRoot = process.env.REPO_ROOT || process.cwd();
  const tasksPath = path.join(repoRoot, 'forgekeeper/tasks.md');

  try {
    // Read existing tasks.md
    let content;
    try {
      content = await fs.readFile(tasksPath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { error: `tasks.md not found at: ${tasksPath}` };
      }
      throw err;
    }

    // Check if task ID already exists
    const taskHeaderRegex = new RegExp(`^###\\s+${task_id}\\s+`, 'm');
    if (taskHeaderRegex.test(content)) {
      return {
        error: `Task ID ${task_id} already exists in tasks.md`,
        duplicate: true
      };
    }

    // Build task card markdown following the template format
    const scopeBullets = scope.map(s => `  - ${s}`).join('\n');
    const outOfScopeBullets = out_of_scope.map(s => `  - ${s}`).join('\n');
    const allowedTouchesFormatted = allowed_touches.map(t => `\`${t}\``).join(', ');
    const doneWhenBullets = done_when.map(d => `  - ${d}`).join('\n');

    const taskCard = `
### ${task_id} - ${title}
- Goal: ${goal}
- Scope:
${scopeBullets}
- Out of Scope:
${outOfScopeBullets}
- Allowed Touches: ${allowedTouchesFormatted}
- Done When:
${doneWhenBullets}
- Test Level: ${test_level}
`;

    // Find insertion point (before "## Completed" section or end of file)
    let insertionIndex = content.indexOf('## Completed');

    if (insertionIndex !== -1) {
      // Insert before "## Completed"
      content = content.slice(0, insertionIndex) + taskCard + '\n' + content.slice(insertionIndex);
    } else {
      // Append at end if no "## Completed" section
      content += '\n' + taskCard;
    }

    // Write updated content back to tasks.md
    await fs.writeFile(tasksPath, content, 'utf8');

    return {
      success: true,
      task_id,
      title,
      message: `Task card ${task_id} created successfully in forgekeeper/tasks.md`,
      path: 'forgekeeper/tasks.md',
      insertion_point: insertionIndex !== -1 ? 'before_completed_section' : 'end_of_file'
    };

  } catch (err) {
    return {
      error: `Failed to create task card: ${err.message}`,
      stack: err.stack
    };
  }
}
