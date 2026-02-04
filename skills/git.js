// Git skill - repository operations via Claude Code
import { execute } from '../core/claude.js';

export default {
  name: 'git',
  description: 'Git repository operations (commit, push, pull, branch, PR)',
  triggers: ['commit', 'push', 'pull', 'branch', 'merge', 'pr', 'pull request', 'git'],

  approval: {
    required: false, // Most git ops are safe
    level: 'notify',
  },

  async execute(task) {
    const description = task.description.toLowerCase();

    // Determine the specific git operation
    let operation = 'general';
    if (description.includes('commit')) operation = 'commit';
    else if (description.includes('push')) operation = 'push';
    else if (description.includes('pull request') || description.includes('pr')) operation = 'pr';
    else if (description.includes('pull')) operation = 'pull';
    else if (description.includes('branch')) operation = 'branch';
    else if (description.includes('merge')) operation = 'merge';

    // Build a focused prompt for Claude Code
    const prompts = {
      commit: `Git commit task: ${task.description}

Steps:
1. Run git status to see changes
2. Stage appropriate files (be selective, don't add everything)
3. Write a clear commit message following conventional commits
4. Commit the changes
5. Report what was committed`,

      push: `Git push task: ${task.description}

Steps:
1. Check current branch and remote tracking
2. Push to the appropriate remote
3. Report success or any issues`,

      pr: `Create pull request: ${task.description}

Steps:
1. Check current branch and commits
2. Ensure changes are pushed
3. Use 'gh pr create' to create the PR
4. Provide a clear title and description
5. Report the PR URL`,

      pull: `Git pull task: ${task.description}

Steps:
1. Check current branch
2. Pull from remote
3. Report any merge conflicts or issues`,

      branch: `Git branch task: ${task.description}

Steps:
1. List or create branches as needed
2. Switch branches if requested
3. Report the current state`,

      merge: `Git merge task: ${task.description}

Steps:
1. Check current branch
2. Merge the specified branch
3. Handle any conflicts if simple, otherwise report them
4. Report the result`,

      general: `Git task: ${task.description}

Perform the requested git operation and report the result.`,
    };

    const result = await execute({
      description: prompts[operation],
      tags: ['git', operation],
    }, {
      allowedTools: ['Bash', 'Read', 'Glob'],
    });

    return result;
  },

  async validate(result) {
    // Check for common git errors in output
    if (result.output) {
      const output = result.output.toLowerCase();
      if (output.includes('fatal:') || output.includes('error:')) {
        return false;
      }
    }
    return result.success;
  },
};
