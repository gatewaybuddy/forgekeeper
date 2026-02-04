/**
 * Skills Loader (T501)
 *
 * Loads and parses skill definitions from .claude/skills/ directory.
 * Skills are markdown files with YAML frontmatter containing metadata
 * and instructions for Claude to follow.
 *
 * @module skills/loader
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse YAML frontmatter from markdown content
 *
 * @param {string} content - Markdown content with YAML frontmatter
 * @returns {Object} Parsed frontmatter and remaining content
 */
function parseFrontmatter(content) {
  const lines = content.split('\n');

  // Check for frontmatter delimiter
  if (lines[0] !== '---') {
    return { frontmatter: {}, content };
  }

  // Find end of frontmatter
  const endIndex = lines.slice(1).findIndex(line => line === '---');
  if (endIndex === -1) {
    return { frontmatter: {}, content };
  }

  // Extract frontmatter lines
  const frontmatterLines = lines.slice(1, endIndex + 1);
  const remainingContent = lines.slice(endIndex + 2).join('\n');

  // Parse YAML frontmatter
  const frontmatter = {};
  for (const line of frontmatterLines) {
    const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;

      // Handle arrays: [tag1, tag2, tag3]
      if (value.startsWith('[') && value.endsWith(']')) {
        const arrayContent = value.slice(1, -1);
        frontmatter[key] = arrayContent.split(',').map(v => v.trim());
      } else {
        frontmatter[key] = value.trim();
      }
    }
  }

  return { frontmatter, content: remainingContent };
}

/**
 * Load a single skill from a directory
 *
 * @param {string} skillPath - Path to skill directory
 * @returns {Promise<Object|null>} Parsed skill or null if invalid
 */
export async function loadSkill(skillPath) {
  try {
    const skillFile = path.join(skillPath, 'SKILL.md');

    // Check if SKILL.md exists
    try {
      await fs.access(skillFile);
    } catch {
      return null; // No SKILL.md, skip this directory
    }

    // Read skill content
    const content = await fs.readFile(skillFile, 'utf8');

    // Parse frontmatter
    const { frontmatter, content: instructions } = parseFrontmatter(content);

    // Validate required fields
    if (!frontmatter.name || !frontmatter.description) {
      console.warn(`[Skills] Skill missing required fields: ${skillPath}`);
      return null;
    }

    // Build skill object
    const skill = {
      name: frontmatter.name,
      description: frontmatter.description,
      tags: frontmatter.tags || [],
      version: frontmatter.version || '1.0.0',
      author: frontmatter.author || 'unknown',
      enabled: frontmatter.enabled !== 'false', // Default enabled unless explicitly disabled
      instructions,
      path: skillPath,
      file: skillFile
    };

    return skill;

  } catch (error) {
    console.error(`[Skills] Failed to load skill from ${skillPath}:`, error.message);
    return null;
  }
}

/**
 * Scan a directory for skills
 *
 * @param {string} skillsDir - Directory containing skills
 * @returns {Promise<Array>} Array of loaded skills
 */
export async function scanSkillsDirectory(skillsDir) {
  try {
    // Check if directory exists
    try {
      await fs.access(skillsDir);
    } catch {
      return []; // Directory doesn't exist, return empty array
    }

    // Read directory entries
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });

    // Filter directories (skip files and TEMPLATE)
    const skillDirs = entries
      .filter(entry => entry.isDirectory())
      .filter(entry => entry.name !== 'TEMPLATE')
      .map(entry => path.join(skillsDir, entry.name));

    // Load all skills
    const skills = await Promise.all(
      skillDirs.map(dir => loadSkill(dir))
    );

    // Filter out null (invalid) skills
    return skills.filter(Boolean);

  } catch (error) {
    console.error(`[Skills] Failed to scan directory ${skillsDir}:`, error.message);
    return [];
  }
}

/**
 * Load all skills from project and personal directories
 *
 * @param {Object} options - Loading options
 * @returns {Promise<Array>} Array of all loaded skills
 */
export async function loadAllSkills(options = {}) {
  const skills = [];

  // Load project skills (.claude/skills/)
  const projectSkillsDir = options.projectSkillsDir || path.resolve(process.cwd(), '.claude/skills');
  const projectSkills = await scanSkillsDirectory(projectSkillsDir);
  skills.push(...projectSkills);

  console.log(`[Skills] Loaded ${projectSkills.length} project skills from ${projectSkillsDir}`);

  // Load personal skills (~/.claude/skills/) if enabled
  if (options.loadPersonalSkills !== false) {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (homeDir) {
      const personalSkillsDir = options.personalSkillsDir || path.join(homeDir, '.claude/skills');
      const personalSkills = await scanSkillsDirectory(personalSkillsDir);
      skills.push(...personalSkills);

      console.log(`[Skills] Loaded ${personalSkills.length} personal skills from ${personalSkillsDir}`);
    }
  }

  // Filter enabled skills
  const enabledSkills = skills.filter(skill => skill.enabled);

  console.log(`[Skills] Total skills loaded: ${enabledSkills.length}/${skills.length} enabled`);

  return enabledSkills;
}

/**
 * Reload skills (for hot-reload functionality)
 *
 * @param {Object} options - Loading options
 * @returns {Promise<Array>} Refreshed array of skills
 */
export async function reloadSkills(options = {}) {
  console.log('[Skills] Reloading skills...');
  return await loadAllSkills(options);
}

/**
 * Get skill by name
 *
 * @param {Array} skills - Array of loaded skills
 * @param {string} name - Skill name to find
 * @returns {Object|null} Found skill or null
 */
export function getSkillByName(skills, name) {
  return skills.find(skill => skill.name === name) || null;
}

/**
 * Search skills by tags
 *
 * @param {Array} skills - Array of loaded skills
 * @param {Array<string>} tags - Tags to search for
 * @returns {Array} Skills matching any of the tags
 */
export function searchSkillsByTags(skills, tags) {
  if (!Array.isArray(tags) || tags.length === 0) {
    return [];
  }

  return skills.filter(skill => {
    if (!Array.isArray(skill.tags)) {
      return false;
    }

    // Match if skill has any of the search tags
    return tags.some(tag => skill.tags.includes(tag));
  });
}

/**
 * Search skills by description keywords
 *
 * @param {Array} skills - Array of loaded skills
 * @param {string} query - Search query
 * @returns {Array} Skills matching the query
 */
export function searchSkillsByDescription(skills, query) {
  if (!query || typeof query !== 'string') {
    return [];
  }

  const lowerQuery = query.toLowerCase();

  return skills.filter(skill => {
    const lowerDesc = skill.description.toLowerCase();
    const lowerName = skill.name.toLowerCase();

    return lowerDesc.includes(lowerQuery) || lowerName.includes(lowerQuery);
  });
}

/**
 * Format skill for injection into system prompt
 *
 * @param {Object} skill - Skill to format
 * @returns {string} Formatted skill instructions
 */
export function formatSkillForPrompt(skill) {
  const tags = Array.isArray(skill.tags) && skill.tags.length > 0
    ? skill.tags.join(', ')
    : 'none';

  return `## Skill: ${skill.name}

**Description**: ${skill.description}
**Tags**: ${tags}

${skill.instructions}

---
`;
}

/**
 * Format multiple skills for injection into system prompt
 *
 * @param {Array} skills - Skills to format
 * @returns {string} Formatted skills block
 */
export function formatSkillsForPrompt(skills) {
  if (!Array.isArray(skills) || skills.length === 0) {
    return '';
  }

  const header = `# Available Skills

You have access to the following skills. Use them when the task matches the skill description.

`;

  const skillsContent = skills.map(formatSkillForPrompt).join('\n');

  return header + skillsContent;
}
