// Skills registry - loads and manages high-level skills
import { readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { pathToFileURL } from 'url';
import { config } from '../config.js';

const skills = new Map();

// Load all skills from the skills directory
export async function loadSkills() {
  const skillsDir = config.paths.skills;

  if (!existsSync(skillsDir)) {
    console.log(`[Skills] Directory not found: ${skillsDir}`);
    return [];
  }

  const files = readdirSync(skillsDir).filter(f => f.endsWith('.js') && f !== 'registry.js');

  for (const file of files) {
    try {
      const filePath = join(process.cwd(), skillsDir, file);
      const fileUrl = pathToFileURL(filePath).href;
      const module = await import(fileUrl);

      if (module.default && module.default.name) {
        const skill = module.default;
        skills.set(skill.name, skill);
        console.log(`  - Loaded skill: ${skill.name}`);
      }
    } catch (error) {
      console.error(`[Skills] Failed to load ${file}:`, error.message);
    }
  }

  return Array.from(skills.values());
}

// Get a skill by name
export function getSkill(name) {
  return skills.get(name);
}

// List all loaded skills
export function listSkills() {
  return Array.from(skills.values());
}

// Register a skill dynamically (for self-extension)
export function registerSkill(skill) {
  if (!skill.name) {
    throw new Error('Skill must have a name');
  }
  if (!skill.execute || typeof skill.execute !== 'function') {
    throw new Error('Skill must have an execute function');
  }

  skills.set(skill.name, skill);
  console.log(`[Skills] Registered: ${skill.name}`);
  return skill;
}

// Unregister a skill
export function unregisterSkill(name) {
  const removed = skills.delete(name);
  if (removed) {
    console.log(`[Skills] Unregistered: ${name}`);
  }
  return removed;
}

// Skill template - what all skills should look like
export const SKILL_TEMPLATE = {
  // Required
  name: 'skill-name',
  description: 'What this skill does',
  execute: async (task) => {
    // Implementation
    return { success: true, result: null };
  },

  // Optional
  triggers: [], // Keywords that activate this skill
  approval: {
    required: false,
    level: 'notify', // notify | confirm | review
  },
  validate: async (result) => {
    // Validate the result
    return true;
  },
};

export default { loadSkills, getSkill, listSkills, registerSkill, unregisterSkill, SKILL_TEMPLATE };
