import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillsInjector, STRATEGIES } from '../../skills/injector.mjs';

// Mock the registry
const mockRegistry = {
  getAll: vi.fn(() => [
    { name: 'skill1', description: 'Testing skill', tags: ['test'], instructions: 'Test instructions' },
    { name: 'skill2', description: 'Documentation skill', tags: ['docs'], instructions: 'Doc instructions' }
  ]),
  findRelevantSkills: vi.fn((message) => {
    if (message.toLowerCase().includes('test')) {
      return [{ name: 'skill1', description: 'Testing skill', tags: ['test'], instructions: 'Test instructions' }];
    }
    return [];
  }),
  searchByTags: vi.fn((tags) => {
    if (tags.includes('test')) {
      return [{ name: 'skill1', description: 'Testing skill', tags: ['test'], instructions: 'Test instructions' }];
    }
    return [];
  }),
  calculateRelevanceScore: vi.fn(() => 5),
  formatForPrompt: vi.fn((skills) => {
    return skills.map(s => `Skill: ${s.name}`).join('\n');
  })
};

vi.mock('../../skills/registry.mjs', () => ({
  getRegistry: () => mockRegistry
}));

describe('Skills Injector', () => {
  let injector;

  beforeEach(() => {
    injector = new SkillsInjector({ enabled: true });
    vi.clearAllMocks();
  });

  describe('analyzeMessage', () => {
    it('returns all skills with ALL strategy', () => {
      injector.configure({ strategy: STRATEGIES.ALL });
      const skills = injector.analyzeMessage('any message');

      expect(skills).toHaveLength(2);
      expect(mockRegistry.getAll).toHaveBeenCalled();
    });

    it('returns relevant skills with RELEVANT strategy', () => {
      injector.configure({ strategy: STRATEGIES.RELEVANT });
      const skills = injector.analyzeMessage('help me write tests');

      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('skill1');
      expect(mockRegistry.findRelevantSkills).toHaveBeenCalledWith('help me write tests');
    });

    it('returns tagged skills with TAGGED strategy', () => {
      injector.configure({ strategy: STRATEGIES.TAGGED, tags: ['test'] });
      const skills = injector.analyzeMessage('any message');

      expect(skills).toHaveLength(1);
      expect(mockRegistry.searchByTags).toHaveBeenCalledWith(['test']);
    });

    it('returns empty array with NONE strategy', () => {
      injector.configure({ strategy: STRATEGIES.NONE });
      const skills = injector.analyzeMessage('any message');

      expect(skills).toHaveLength(0);
    });

    it('returns empty array when disabled', () => {
      injector.configure({ enabled: false });
      const skills = injector.analyzeMessage('help me write tests');

      expect(skills).toHaveLength(0);
    });

    it('respects maxSkills limit', () => {
      injector.configure({ strategy: STRATEGIES.ALL, maxSkills: 1 });
      const skills = injector.analyzeMessage('any message');

      expect(skills).toHaveLength(1);
    });
  });

  describe('processConversation', () => {
    it('injects skills into existing system message', () => {
      const messages = [
        { role: 'system', content: 'You are an assistant.' },
        { role: 'user', content: 'Help me write tests' }
      ];

      const result = injector.processConversation(messages);

      expect(result.injected).toBe(true);
      expect(result.skills).toHaveLength(1);
      expect(result.skillNames).toEqual(['skill1']);
      expect(result.messages[0].content).toContain('You are an assistant.');
      expect(result.messages[0].content).toContain('Skill: skill1');
    });

    it('creates system message if none exists', () => {
      const messages = [
        { role: 'user', content: 'Help me write tests' }
      ];

      const result = injector.processConversation(messages);

      expect(result.injected).toBe(true);
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe('system');
      expect(result.messages[0].content).toContain('Skill: skill1');
    });

    it('does not modify messages when no skills found', () => {
      const messages = [
        { role: 'user', content: 'Hello' }
      ];

      const result = injector.processConversation(messages);

      expect(result.injected).toBeUndefined();
      expect(result.skills).toHaveLength(0);
      expect(result.messages).toEqual(messages);
    });

    it('handles empty messages array', () => {
      const result = injector.processConversation([]);

      expect(result.skills).toHaveLength(0);
      expect(result.messages).toEqual([]);
    });
  });

  describe('configure', () => {
    it('updates configuration', () => {
      injector.configure({ maxSkills: 10, strategy: STRATEGIES.ALL });

      const config = injector.getConfig();

      expect(config.maxSkills).toBe(10);
      expect(config.strategy).toBe(STRATEGIES.ALL);
    });

    it('merges with existing config', () => {
      const originalStrategy = injector.getConfig().strategy;

      injector.configure({ maxSkills: 10 });

      const config = injector.getConfig();

      expect(config.maxSkills).toBe(10);
      expect(config.strategy).toBe(originalStrategy);
    });
  });

  describe('getStats', () => {
    it('returns current statistics', () => {
      const stats = injector.getStats();

      expect(stats).toHaveProperty('enabled');
      expect(stats).toHaveProperty('strategy');
      expect(stats).toHaveProperty('maxSkills');
      expect(stats).toHaveProperty('totalSkillsAvailable');
    });
  });
});
