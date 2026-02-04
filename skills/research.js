// Research skill - web search, documentation lookup, codebase exploration
import { execute, query } from '../core/claude.js';

export default {
  name: 'research',
  description: 'Research tasks - web search, docs, codebase exploration',
  triggers: ['search', 'find', 'look up', 'research', 'documentation', 'docs', 'explore', 'investigate', 'learn about'],

  approval: {
    required: false,
    level: 'notify',
  },

  async execute(task) {
    const description = task.description.toLowerCase();

    // Determine research type
    let type = 'general';
    if (description.includes('codebase') || description.includes('code') || description.includes('function') || description.includes('class')) {
      type = 'codebase';
    } else if (description.includes('doc') || description.includes('api') || description.includes('reference')) {
      type = 'documentation';
    } else if (description.includes('web') || description.includes('search') || description.includes('online')) {
      type = 'web';
    }

    const prompts = {
      codebase: `Research in codebase: ${task.description}

Steps:
1. Use Glob to find relevant files
2. Use Grep to search for patterns
3. Read key files to understand the code
4. Summarize your findings clearly

Focus on:
- File locations
- Key functions/classes
- How things connect
- Any patterns or conventions`,

      documentation: `Documentation research: ${task.description}

Steps:
1. Search for relevant docs (local and web)
2. Find official documentation if available
3. Summarize the key information
4. Include code examples if helpful

Provide clear, actionable information.`,

      web: `Web research: ${task.description}

Steps:
1. Search the web for relevant information
2. Focus on authoritative sources
3. Summarize findings
4. Include links to sources

Be concise and factual.`,

      general: `Research task: ${task.description}

Investigate this topic thoroughly:
1. Search relevant sources (codebase, web, docs)
2. Gather key information
3. Synthesize findings
4. Present a clear summary

Be thorough but concise.`,
    };

    const result = await execute({
      description: prompts[type],
      tags: ['research', type],
    }, {
      allowedTools: ['Glob', 'Grep', 'Read', 'WebSearch', 'WebFetch'],
    });

    return result;
  },
};
