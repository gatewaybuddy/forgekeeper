import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  loadSkill,
  getSkillByName,
  searchSkillsByTags,
  searchSkillsByDescription,
  formatSkillForPrompt
} from '../../skills/loader.mjs';

// Access the private parseFrontmatter function by importing the module
// For testing, we'll manually import and test the exported functions

describe('Skills Loader', () => {
  describe('getSkillByName', () => {
    const skills = [
      { name: 'skill1', description: 'First skill' },
      { name: 'skill2', description: 'Second skill' }
    ];

    it('finds skill by name', () => {
      const result = getSkillByName(skills, 'skill1');
      expect(result).toEqual({ name: 'skill1', description: 'First skill' });
    });

    it('returns null for non-existent skill', () => {
      const result = getSkillByName(skills, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('searchSkillsByTags', () => {
    const skills = [
      { name: 'skill1', tags: ['test', 'demo'] },
      { name: 'skill2', tags: ['production', 'demo'] },
      { name: 'skill3', tags: ['test'] }
    ];

    it('finds skills by single tag', () => {
      const results = searchSkillsByTags(skills, ['test']);
      expect(results).toHaveLength(2);
      expect(results.map(s => s.name)).toEqual(['skill1', 'skill3']);
    });

    it('finds skills by multiple tags', () => {
      const results = searchSkillsByTags(skills, ['demo']);
      expect(results).toHaveLength(2);
    });

    it('returns empty array for no matches', () => {
      const results = searchSkillsByTags(skills, ['nonexistent']);
      expect(results).toHaveLength(0);
    });

    it('handles empty tags array', () => {
      const results = searchSkillsByTags(skills, []);
      expect(results).toHaveLength(0);
    });
  });

  describe('searchSkillsByDescription', () => {
    const skills = [
      { name: 'test-gen', description: 'Generate comprehensive unit tests' },
      { name: 'task-card', description: 'Create task cards for planning' },
      { name: 'docs', description: 'Generate API documentation' }
    ];

    it('finds skills by description keyword', () => {
      const results = searchSkillsByDescription(skills, 'generate');
      expect(results).toHaveLength(2);
    });

    it('finds skills case-insensitively', () => {
      const results = searchSkillsByDescription(skills, 'GENERATE');
      expect(results).toHaveLength(2);
    });

    it('finds skills by name', () => {
      const results = searchSkillsByDescription(skills, 'test-gen');
      expect(results).toHaveLength(1);
    });

    it('returns empty array for no matches', () => {
      const results = searchSkillsByDescription(skills, 'nonexistent');
      expect(results).toHaveLength(0);
    });

    it('handles empty query', () => {
      const results = searchSkillsByDescription(skills, '');
      expect(results).toHaveLength(0);
    });
  });

  describe('formatSkillForPrompt', () => {
    it('formats skill with all fields', () => {
      const skill = {
        name: 'test-skill',
        description: 'A test skill',
        tags: ['test', 'demo'],
        instructions: '## Step 1\nDo something\n\n## Step 2\nDo more'
      };

      const result = formatSkillForPrompt(skill);

      expect(result).toContain('## Skill: test-skill');
      expect(result).toContain('**Description**: A test skill');
      expect(result).toContain('**Tags**: test, demo');
      expect(result).toContain('## Step 1');
      expect(result).toContain('Do something');
    });

    it('handles skill with no tags (array)', () => {
      const skill = {
        name: 'no-tags',
        description: 'No tags skill',
        tags: [],
        instructions: 'Instructions'
      };

      const result = formatSkillForPrompt(skill);

      expect(result).toContain('**Tags**: none');
    });

    it('handles skill with undefined tags', () => {
      const skill = {
        name: 'undefined-tags',
        description: 'Undefined tags',
        tags: undefined,
        instructions: 'Instructions'
      };

      const result = formatSkillForPrompt(skill);

      expect(result).toContain('**Tags**: none');
    });
  });
});
