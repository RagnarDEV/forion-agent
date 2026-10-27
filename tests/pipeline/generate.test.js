import { describe, it, expect } from 'vitest';
import { generateChanges, SAFE_EXTENSIONS } from '../../src/pipeline/generate.js';
import { UserError } from '../../src/lib/errors.js';

const mockEnv = { AI: { run: () => Promise.resolve({ response: '{"summary":"Ok","files":[]}'} ) } };

const safeHistory = [{role: 'system', content: '....'}, {role: 'user', content: '....'}];

const validFile = {
  path: 'skills/test-skill/SKILL.md',
  content: '# Test Skill Test\nbody'
};

const robotFile = {
  path: 'skills/test-skill/test.robot',
  content: '** Settings ***\nLibrary    SeleniumLibrary\n* Test Cases ***\nOpen Google    Open Browser    http://google.com  firefox'
};

const maliciousPath = '../secrets/config.json';


describe('Generate Pipeline - Creation Logic', () => {
  it('should allow .lg extension for logic files used in skills', async () => {
    const lgFile = {
      path: 'skills/test-skill/sample.lg',
      content: '# Sample logic file\nVariables'
    };
    const files = { response: JSON.stringify({
      summary: 'Created agent skill logic',
      files: [lgFile]
    }) };
    
    mockEnv.AI.run = async () => ({ response: JSON.stringify({
      summary: 'Created agent skill logic',
      files: [lgFile]
    }) });

    const result = await generateChanges(mockEnv, {
      task: 'Create an agent skill logic file for test-skill',
      history: safeHistory,
      files: [],
      existingPaths: []
    });

    expect(result.changed[0].path).toBe(lgFile.path);
    expect(result.changed[0].path.endsWith('.lg')).toBe(true);
  });

  it('should reject path traversal with ./ or ../', async () => {
    const dangerousFile = {
      path: '../config/secure.json',
      content: '{"password":"123"}'
    };
    
    mockEnv.AI.run = async () => ({ response: JSON.stringify({
      summary: 'Attempted dangerous write',
      files: [dangerousFile]
    }) });

    await expect(generateChanges(mockEnv, {
      task: 'Add dangerous file',
      history: safeHistory,
      files: [],
      existingPaths: []
    })).rejects.toThrow("رفض التوليد: مسار غير آمن");
  });

  it('should reject file creation when task does not request it', async () => {
    const newFile = {
      path: 'new-file.txt',
      content: 'hello'
    };
    
    mockEnv.AI.run = async () => ({ response: JSON.stringify({
      summary: 'Should not be created',
      files: [newFile]
    }) });

    await expect(generateChanges(mockEnv, {
      task: 'Just read the files',
      history: safeHistory,
      files: [validFile],
      existingPaths: []
    })).rejects.toThrow("رفض التوليد: لا يُسمح بإنشاء ملفات جديدة");
  });

  it('should allow .robot if using direct path, not traversal', async () => {
    const robotFileSafe = {
      path: 'skills/test-skill/test.robot',
      content: '** Test Cases ****\nExample'
    };
    
    mockEnv.AI.run = async () => ({ response: JSON.stringify({
      summary: 'Created workflow test',
      files: [robotFileSafe]
    }) });

    const result = await generateChanges(mockEnv, {
      task: 'Add robot test for skill',
      history: safeHistory,
      files: [],
      existingPaths: []
    });

    expect(result.changed[0].path).toBe(robotFileSafe.path);
    expect(result.changed[0].path).toContain('skills/') && expect(result.changed[0].path).toContain('test.robot');
  });
});