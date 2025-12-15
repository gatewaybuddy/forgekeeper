/**
 * Unit tests for ToolHandler orchestrator module
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolHandler } from '../../core/agent/orchestrator/tool-handler.mjs';
import { mockReflection, mockToolResult, mockFailedToolResult } from '../utils/fixtures.mjs';

describe('ToolHandler', () => {
  let toolHandler;
  let mockTaskPlanner;
  let mockExecutor;

  beforeEach(() => {
    mockTaskPlanner = {
      plan: vi.fn().mockResolvedValue({
        steps: [
          { tool: 'bash', args: { command: 'ls' }, description: 'List files' }
        ]
      })
    };

    mockExecutor = {
      toolRegistry: new Map([
        ['bash', { description: 'Run bash command', parameters: {} }],
        ['read_file', { description: 'Read file', parameters: {} }],
        ['write_file', { description: 'Write file', parameters: {} }],
        ['read_dir', { description: 'Read directory', parameters: {} }]
      ]),
      executeTool: vi.fn().mockResolvedValue({
        content: 'Success',
        error: null
      })
    };

    toolHandler = new ToolHandler({
      taskPlanner: mockTaskPlanner
    });
  });

  describe('constructor', () => {
    it('should initialize with task planner', () => {
      expect(toolHandler.taskPlanner).toBe(mockTaskPlanner);
    });
  });

  describe('planExecution', () => {
    it('should use tool_plan from reflection if available', () => {
      const reflection = {
        ...mockReflection,
        tool_plan: {
          tool: 'bash',
          purpose: 'Run command'
        },
        next_action: 'Execute ls command'
      };

      const plan = toolHandler.planExecution(reflection);

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].tool).toBe('bash');
      expect(plan.steps[0].purpose).toBe('Run command');
    });

    it('should infer tools from next_action if no tool_plan', () => {
      const reflection = {
        ...mockReflection,
        tool_plan: null,
        next_action: 'Read the config.json file'
      };

      const plan = toolHandler.planExecution(reflection);

      expect(plan.steps).toBeDefined();
      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('should handle empty reflection', () => {
      const reflection = {
        next_action: 'Do something'
      };

      const plan = toolHandler.planExecution(reflection);

      expect(plan.steps).toBeDefined();
      expect(Array.isArray(plan.steps)).toBe(true);
    });
  });

  describe('convertInstructionsToPlan', () => {
    it('should convert planner instructions to executable plan', () => {
      const instructionPlan = {
        steps: [
          {
            tool: 'bash',
            args: { command: 'ls -la' },
            description: 'List files',
            expected_outcome: 'File listing',
            error_handling: 'Retry once',
            confidence: 0.9
          }
        ],
        verification: 'Check output',
        prerequisites: ['Directory exists'],
        alternatives: ['Use find command']
      };

      const plan = toolHandler.convertInstructionsToPlan(instructionPlan);

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].tool).toBe('bash');
      expect(plan.steps[0].args).toEqual({ command: 'ls -la' });
      expect(plan.steps[0].purpose).toBe('List files');
      expect(plan.steps[0].expectedOutcome).toBe('File listing');
      expect(plan.verification).toBe('Check output');
      expect(plan.prerequisites).toEqual(['Directory exists']);
    });

    it('should handle steps without args', () => {
      const instructionPlan = {
        steps: [
          {
            tool: 'bash',
            description: 'Test step'
          }
        ]
      };

      const plan = toolHandler.convertInstructionsToPlan(instructionPlan);

      expect(plan.steps[0].args).toEqual({});
    });
  });

  describe('buildToolsList', () => {
    it('should build tools list from executor registry', () => {
      const tools = toolHandler.buildToolsList(mockExecutor);

      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0]).toHaveProperty('name');
      expect(tools[0]).toHaveProperty('description');
      expect(tools[0]).toHaveProperty('parameters');
    });

    it('should handle executor without toolRegistry', () => {
      const tools = toolHandler.buildToolsList({ toolRegistry: null });

      expect(tools).toEqual([]);
    });

    it('should handle null executor', () => {
      const tools = toolHandler.buildToolsList(null);

      expect(tools).toEqual([]);
    });
  });

  describe('executeRecoverySteps', () => {
    it('should execute all recovery steps successfully', async () => {
      const steps = [
        { tool: 'bash', args: { command: 'mkdir test' } },
        { tool: 'bash', args: { command: 'ls test' } }
      ];
      const context = { sandboxRoot: '/tmp' };

      const result = await toolHandler.executeRecoverySteps(steps, mockExecutor, context);

      expect(result.success).toBe(true);
      expect(result.summary).toContain('Step 1 OK');
      expect(result.summary).toContain('Step 2 OK');
      expect(mockExecutor.executeTool).toHaveBeenCalledTimes(2);
    });

    it('should stop on first failure', async () => {
      mockExecutor.executeTool
        .mockResolvedValueOnce({ content: 'Success', error: null })
        .mockResolvedValueOnce({ content: '', error: { message: 'Failed' } });

      const steps = [
        { tool: 'bash', args: { command: 'step1' } },
        { tool: 'bash', args: { command: 'step2' } },
        { tool: 'bash', args: { command: 'step3' } }
      ];
      const context = { sandboxRoot: '/tmp' };

      const result = await toolHandler.executeRecoverySteps(steps, mockExecutor, context);

      expect(result.success).toBe(false);
      expect(result.summary).toContain('Step 2 FAILED');
      expect(mockExecutor.executeTool).toHaveBeenCalledTimes(2); // Stopped after failure
    });

    it('should handle execution errors', async () => {
      mockExecutor.executeTool.mockRejectedValueOnce(new Error('Execution error'));

      const steps = [
        { tool: 'bash', args: { command: 'failing-command' } }
      ];
      const context = { sandboxRoot: '/tmp' };

      const result = await toolHandler.executeRecoverySteps(steps, mockExecutor, context);

      expect(result.success).toBe(false);
      expect(result.summary).toContain('Step 1 ERROR');
      expect(result.summary).toContain('Execution error');
    });

    it('should truncate long output in summary', async () => {
      const longOutput = 'A'.repeat(200);
      mockExecutor.executeTool.mockResolvedValueOnce({
        content: longOutput,
        error: null
      });

      const steps = [{ tool: 'bash', args: { command: 'test' } }];
      const context = { sandboxRoot: '/tmp' };

      const result = await toolHandler.executeRecoverySteps(steps, mockExecutor, context);

      expect(result.success).toBe(true);
      expect(result.summary).toContain('...');
      expect(result.summary.length).toBeLessThan(longOutput.length + 50);
    });
  });

  describe('inferToolsFromAction', () => {
    it('should infer read_dir for exploration', () => {
      const steps = toolHandler.inferToolsFromAction('Explore the codebase', {});

      expect(steps).toContainEqual(
        expect.objectContaining({ tool: 'read_dir' })
      );
    });

    it('should infer grep for search', () => {
      const steps = toolHandler.inferToolsFromAction('Search for "authentication"', {});

      expect(steps).toContainEqual(
        expect.objectContaining({
          tool: 'grep',
          args: expect.objectContaining({ pattern: 'authentication' })
        })
      );
    });

    it('should infer read_file for reading', () => {
      const steps = toolHandler.inferToolsFromAction('Read config.json', {});

      expect(steps).toContainEqual(
        expect.objectContaining({
          tool: 'read_file',
          args: expect.objectContaining({ file: 'config.json' })
        })
      );
    });

    it('should infer write_file for creating files', () => {
      const steps = toolHandler.inferToolsFromAction('Create test.py file', {});

      expect(steps).toContainEqual(
        expect.objectContaining({
          tool: 'write_file',
          args: expect.objectContaining({ file: 'test.py' })
        })
      );
    });

    it('should infer bash for running commands', () => {
      const steps = toolHandler.inferToolsFromAction('Run "npm test"', {});

      expect(steps).toContainEqual(
        expect.objectContaining({
          tool: 'run_bash',
          args: expect.objectContaining({ script: 'npm test' })
        })
      );
    });

    it('should default to read_dir for unclear actions', () => {
      const steps = toolHandler.inferToolsFromAction('Do something', {});

      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0].tool).toBe('read_dir');
    });
  });

  describe('extractFilePattern', () => {
    it('should extract pattern from "find all"', () => {
      const pattern = toolHandler.extractFilePattern('find all *.js files');

      expect(pattern).toBe('*.js');
    });

    it('should extract pattern from "locate"', () => {
      const pattern = toolHandler.extractFilePattern('locate test.py');

      expect(pattern).toBe('test.py');
    });

    it('should extract pattern from "files matching"', () => {
      const pattern = toolHandler.extractFilePattern('files matching "*.test.js"');

      expect(pattern).toBe('*.test.js');
    });

    it('should return null for no pattern', () => {
      const pattern = toolHandler.extractFilePattern('do something');

      expect(pattern).toBeNull();
    });
  });

  describe('extractSearchTerm', () => {
    it('should extract term from "search for"', () => {
      const term = toolHandler.extractSearchTerm('search for "authentication"');

      expect(term).toBe('authentication');
    });

    it('should extract term from "grep"', () => {
      const term = toolHandler.extractSearchTerm('grep "TODO"');

      expect(term).toBe('TODO');
    });

    it('should extract term from "containing"', () => {
      const term = toolHandler.extractSearchTerm('find files containing "import React"');

      expect(term).toBe('import React');
    });

    it('should return null for no term', () => {
      const term = toolHandler.extractSearchTerm('do something');

      expect(term).toBeNull();
    });
  });

  describe('generateInitialContent', () => {
    it('should generate Python template', () => {
      const content = toolHandler.generateInitialContent('test.py');

      expect(content).toContain('#!/usr/bin/env python3');
      expect(content).toContain('def main():');
    });

    it('should generate JavaScript template', () => {
      const content = toolHandler.generateInitialContent('test.js');

      expect(content).toContain('function main()');
    });

    it('should generate Markdown template', () => {
      const content = toolHandler.generateInitialContent('README.md');

      expect(content).toContain('# README');
      expect(content).toContain('## Overview');
    });

    it('should generate empty content for txt files', () => {
      const content = toolHandler.generateInitialContent('notes.txt');

      expect(content).toBe('');
    });

    it('should generate default template for unknown extensions', () => {
      const content = toolHandler.generateInitialContent('file.xyz');

      expect(content).toContain('# TODO: Implement');
    });
  });

  describe('inferTestCommand', () => {
    it('should infer pytest command', () => {
      const command = toolHandler.inferTestCommand('run pytest');

      expect(command).toContain('pytest');
    });

    it('should infer npm test command', () => {
      const command = toolHandler.inferTestCommand('run npm test');

      expect(command).toBe('npm test');
    });

    it('should infer jest command', () => {
      const command = toolHandler.inferTestCommand('run jest');

      expect(command).toBe('npm test');
    });

    it('should default to pytest for Python tests', () => {
      const command = toolHandler.inferTestCommand('test');

      expect(command).toContain('pytest');
    });
  });

  describe('inferToolArgs', () => {
    it('should infer write_file args', () => {
      const args = toolHandler.inferToolArgs('write_file', 'Write to frontend/test.txt');

      expect(args.file).toBe('frontend/test.txt');
      expect(args.content).toBeDefined();
    });

    it('should infer read_file args from quoted path', () => {
      const args = toolHandler.inferToolArgs('read_file', 'Read "config.json"');

      expect(args.file).toBe('config.json');
    });

    it('should infer read_file args from unquoted path', () => {
      const args = toolHandler.inferToolArgs('read_file', 'Read file: src/index.js');

      expect(args.file).toBe('src/index.js');
    });

    it('should infer read_dir args', () => {
      const args = toolHandler.inferToolArgs('read_dir', 'List files in src/');

      expect(args.dir).toBeDefined();
    });

    it('should infer bash args from quoted command', () => {
      const args = toolHandler.inferToolArgs('run_bash', 'Execute "ls -la"');

      expect(args.script).toBe('ls -la');
    });

    it('should default to safe values for unknown context', () => {
      const args = toolHandler.inferToolArgs('write_file', '');

      expect(args.file).toBeDefined();
      expect(args.content).toBeDefined();
    });

    it('should handle unknown tools', () => {
      const args = toolHandler.inferToolArgs('unknown_tool', 'some context');

      expect(args).toEqual({});
    });
  });

  describe('edge cases', () => {
    it('should handle very long action strings', () => {
      const longAction = 'A'.repeat(10000) + ' Read config.json';
      const steps = toolHandler.inferToolsFromAction(longAction, {});

      expect(steps).toBeDefined();
      expect(Array.isArray(steps)).toBe(true);
    });

    it('should handle special characters in actions', () => {
      const action = 'Search for "function()" in *.js files';
      const steps = toolHandler.inferToolsFromAction(action, {});

      expect(steps).toBeDefined();
    });

    it('should handle empty action string', () => {
      const steps = toolHandler.inferToolsFromAction('', {});

      expect(steps).toBeDefined();
      expect(steps.length).toBeGreaterThan(0);
    });

    it('should handle null/undefined action', () => {
      const steps = toolHandler.inferToolsFromAction(null, {});

      expect(steps).toBeDefined();
    });

    it('should handle empty recovery steps array', async () => {
      const result = await toolHandler.executeRecoverySteps([], mockExecutor, {});

      expect(result.success).toBe(false);
      expect(result.summary).toBe('');
    });
  });
});
