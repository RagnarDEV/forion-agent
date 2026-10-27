import { describe, it, expect, vi, beforeEach } from 'vitest';
import { selectFiles, SKILLS_REGISTRY } from '../../src/pipeline/select.js';
import { UserError } from '../../src/lib/errors.js';
import { createRegistry } from '../../src/lib/skills/skills-registry.js';

const mockEnv = {};

// استخدام مكتبة مهارات واحدة منفصلة
SKILLS_REGISTRY = new SkillsRegistry({ baseUrl: 'skills' });

// Register generic skills for testing
SKILLS_REGISTRY.registerSkill('lint', {
  name: 'Static Analysis',
  description: 'Helper for linting',
  tags: ['code-quality'],
  instructions: 'Static analysis skill.'
});
SKILLS_REGISTRY.registerSkill('security', {
  name: 'Security Review',
  description: 'Review for vulnerabilities',
  tags: ['security'],
  instructions: 'Security review instruction.'
});

vi.mock('../lib/ai.js', () => ({
  askAI: vi.fn(() => new Promise(resolve => resolve(JSON.stringify({ paths: ['src/index.js'] }))),
  parseModelJSON: vi.fn((raw, name) => JSON.parse(raw))
}));

describe('Skills Integration in Select Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Skill Detection', () => {
    it('should detect active skills from user request', async () => {
      const task = 'Use security and lint skills';
      const scan = {
        candidates: [{ path: 'src/index.js', size: 1000 }],
        candidateMap: new Map([['src/index.js', { path: 'src/index.js', size: 1000 }]])
      };

      const result = await selectFiles(mockEnv, { task, history: [], scan });

      expect(result).toHaveProperty('skills');
      expect(result.skills).toHaveLength(2);
      expect(result.skills.some(s => s.name === 'Security Review')).toBe(true);
      expect(result.skills.some(s => s.name === 'Static Analysis')).toBe(true);
    });

    it('should not include non-existent skills', async () => {
      const task = 'Use non-existent skill';
      const scan = {
        candidates: [{ path: 'src/index.js', size: 1000 }],
        candidateMap: new Map([['src/index.js', { path: 'src/index.js', size: 1000 }]])
      };

      const result = await selectFiles(mockEnv, { task, history: [], scan });

      expect(result).toHaveProperty('skills');
      expect(result.skills.filter(s => s.name === 'Security Review')).toHaveLength(0);
    });

    it('should handle intent keyword extraction', async () => {
      const task = 'create a new skill for api testing';
      const scan = {
        candidates: [],
        candidateMap: new Map()
      };

      const result = await selectFiles(mockEnv, { task, history: [], scan });

      expect(SKILLS_REGISTRY.extractIntentKeywords).toHaveBeenCalled();
      expect(SKILLS_REGISTRY.listActiveSkills).toHaveBeenCalled();
    });
  });

  describe('Intent Context', () => {
    it('should provide skill context in the prompt', async () => {
      const task = 'Use the security skill';
      const scan = {
        candidates: [{ path: 'src/index.js', size: 1000 }],
        candidateMap: new Map([['src/index.js', { path: 'src/index.js', size: 1000 }]])
      };

      // Capture the prompt passed to askAI to verify skills context
      const { askAI } = await import('../lib/ai.js');
      await selectFiles(mockEnv, { task, history: [], scan });

      const prompt = askAI.mock.calls[0][1].find(msg => msg.role === 'user').content;

      expect(prompt).toContain('Active Skills');
      expect(prompt).toContain('Security Review');
    });
  });
});
