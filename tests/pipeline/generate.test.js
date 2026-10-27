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
  it('should allow file creation when explicitly requested', async () => {
    const result = await generateChanges(mockEnv, {
      task: 'Create a new skill file called test.lg',
      history: safeHistory,
      files: [validFile],
      existingPaths: ['README.md']
    });

    expect(result.changed).toHaveLength(1);
    expect(result.changed[0].path).toBe(validFile.path);
  });

  it('should allow .robot extension for workflow files', async () => {
    const files = { response: JSON.stringify({
      summary: 'Created robot test',
      files: [robotFile]
    }) };
    
    // Stub AI to return safe robot file
    mockEnv.AI.run = async () => ({ response: JSON.stringify({
      summary: 'Created robot test',
      files: [robotFile]
    }) });

    const result = await generateChanges(mockEnv, {
      task: 'Create robot test files',
      history: safeHistory,
      files: [],
      existingPaths: []
    });

    expect(result.changed[0].path).toBe(robotFile.path);
  });

  it('should reject malicious path traversal', async () => {
    const result = await generateChanges(mockEnv, {
      task: 'Add dangerous file',
      history: safeHistory,
      files: [{ path: maliciousPath, content: 'secret' }],
      existingPaths: []
    });

    expect(result).toBeUndefined();
  });

  it('should reject disallowed extensions', async () => {
    const result = await generateChanges(mockEnv, {
      task: 'Create executable',
      history: safeHistory,
      files: [{ path: 'script/bad.sh', content: 'echo 1' }],
      existingPaths: []
    });

    expect(result).toBeUndefined();
  });
});