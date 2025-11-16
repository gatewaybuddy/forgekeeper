/**
 * TGT Week 8 Smoke Tests
 *
 * Validates critical Week 8 functionality:
 * - Task Lifecycle Funnel
 * - Smart Auto-Approval
 * - Task Templates
 * - Batch Operations
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';

// Import Week 8 modules
const { calculateFunnel } = await import('../core/taskgen/task-lifecycle.mjs');
const { shouldAutoApprove, getAutoApprovalStats, resetAutoApprovalHistory } = await import('../core/taskgen/auto-approval.mjs');
const { loadTemplates, getTemplate, createTaskFromTemplate } = await import('../core/taskgen/templates.mjs');
const { saveTask, loadTasks, approveTask, dismissTask } = await import('../core/taskgen/task-store.mjs');

describe('TGT Week 8: Task Lifecycle Funnel', () => {
  it('should calculate funnel with no tasks', async () => {
    const funnel = await calculateFunnel({ daysBack: 7 });

    expect(funnel).toBeDefined();
    expect(funnel.period).toBeDefined();
    expect(funnel.stages).toBeDefined();
    expect(funnel.stages.generated.count).toBeGreaterThanOrEqual(0);
    expect(funnel.summary).toBeDefined();
    expect(funnel.summary.healthScore).toBeGreaterThanOrEqual(0);
    expect(funnel.summary.healthScore).toBeLessThanOrEqual(100);
  });

  it('should calculate conversion rates', async () => {
    const funnel = await calculateFunnel({ daysBack: 30 });

    expect(funnel.conversionRates).toBeDefined();
    expect(funnel.conversionRates.generatedToEngaged).toBeDefined();
    expect(funnel.conversionRates.engagedToApproved).toBeDefined();
    expect(funnel.conversionRates.approvedToCompleted).toBeDefined();
    expect(funnel.conversionRates.engagedToDismissed).toBeDefined();
  });

  it('should identify drop-off points', async () => {
    const funnel = await calculateFunnel({ daysBack: 7 });

    expect(funnel.dropoffs).toBeDefined();
    expect(Array.isArray(funnel.dropoffs)).toBe(true);
    // Dropoffs should have stage, rate, and description
    if (funnel.dropoffs.length > 0) {
      expect(funnel.dropoffs[0]).toHaveProperty('stage');
      expect(funnel.dropoffs[0]).toHaveProperty('rate');
      expect(funnel.dropoffs[0]).toHaveProperty('description');
    }
  });

  it('should provide actionable recommendations', async () => {
    const funnel = await calculateFunnel({ daysBack: 7 });

    expect(funnel.summary.recommendation).toBeDefined();
    expect(typeof funnel.summary.recommendation).toBe('string');
    expect(funnel.summary.recommendation.length).toBeGreaterThan(0);
  });
});

describe('TGT Week 8: Smart Auto-Approval', () => {
  beforeAll(() => {
    resetAutoApprovalHistory();
  });

  it('should have auto-approval stats', () => {
    const stats = getAutoApprovalStats();

    expect(stats).toBeDefined();
    expect(stats.config).toBeDefined();
    expect(stats.config).toHaveProperty('enabled');
    expect(stats.config).toHaveProperty('minConfidence');
    expect(stats.config).toHaveProperty('trustedAnalyzers');
    expect(stats.config).toHaveProperty('maxPerHour');
    expect(stats.stats).toBeDefined();
    expect(stats.stats).toHaveProperty('approvalsThisHour');
    expect(stats.stats).toHaveProperty('remainingQuota');
  });

  it('should reject low confidence tasks', async () => {
    const lowConfidenceTask = {
      id: 'test_low_confidence',
      analyzer: 'continuation',
      confidence: 0.5,
    };

    const result = await shouldAutoApprove(lowConfidenceTask, { enabled: true });

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Confidence');
    expect(result.checks.confidence).toBe(false);
  });

  it('should reject untrusted analyzers', async () => {
    const untrustedTask = {
      id: 'test_untrusted',
      analyzer: 'unknown_analyzer',
      confidence: 0.95,
    };

    const result = await shouldAutoApprove(untrustedTask, { enabled: true });

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('not in trusted list');
    expect(result.checks.analyzer).toBe(false);
  });

  it('should check all eligibility criteria', async () => {
    const task = {
      id: 'test_eligible',
      analyzer: 'continuation',
      confidence: 0.95,
    };

    const result = await shouldAutoApprove(task, { enabled: true });

    expect(result.checks).toBeDefined();
    expect(result.checks).toHaveProperty('enabled');
    expect(result.checks).toHaveProperty('confidence');
    expect(result.checks).toHaveProperty('analyzer');
    expect(result.checks).toHaveProperty('historicalRate');
    expect(result.checks).toHaveProperty('rateLimit');
    expect(result.checks).toHaveProperty('taskType');
  });
});

describe('TGT Week 8: Task Templates', () => {
  it('should load default templates', async () => {
    const templates = await loadTemplates();

    expect(templates).toBeDefined();
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThanOrEqual(5); // 5 built-in templates
  });

  it('should have all required template fields', async () => {
    const templates = await loadTemplates();
    const template = templates[0];

    expect(template).toHaveProperty('id');
    expect(template).toHaveProperty('name');
    expect(template).toHaveProperty('description');
    expect(template).toHaveProperty('taskType');
    expect(template).toHaveProperty('severity');
    expect(template).toHaveProperty('defaultPriority');
    expect(template).toHaveProperty('titlePattern');
    expect(template).toHaveProperty('descriptionPattern');
  });

  it('should get template by ID', async () => {
    const template = await getTemplate('template_error_spike');

    expect(template).toBeDefined();
    expect(template.id).toBe('template_error_spike');
    expect(template.name).toContain('Error Spike');
  });

  it('should create task from template', async () => {
    const variables = {
      error_type: 'NullPointerException',
      component: 'UserService',
      magnitude: '10',
      time_window: 'last hour',
    };

    const task = await createTaskFromTemplate('template_error_spike', variables);

    expect(task).toBeDefined();
    expect(task.id).toBeDefined();
    expect(task.title).toContain('NullPointerException');
    expect(task.title).toContain('UserService');
    expect(task.description).toContain('10x normal rate');
    expect(task.analyzer).toBe('template');
    expect(task.confidence).toBe(1.0);
  });

  it('should replace all variables in template', async () => {
    const variables = {
      feature: 'TaskGenerator',
      location: 'docs/tgt/',
      usage_count: '50',
      missing_type: 'API reference',
    };

    const task = await createTaskFromTemplate('template_docs_gap', variables);

    expect(task.title).not.toContain('{feature}');
    expect(task.title).not.toContain('{location}');
    expect(task.description).not.toContain('{usage_count}');
    expect(task.description).not.toContain('{missing_type}');
  });
});

describe('TGT Week 8: Integration - Funnel with Real Data', () => {
  let testTaskIds = [];

  beforeAll(async () => {
    // Create sample tasks in different states
    const tasks = [
      {
        id: 'funnel_test_generated_1',
        type: 'Continuation',
        severity: 'high',
        status: 'generated',
        title: 'Test task - generated',
        description: 'Test',
        priority: 75,
        confidence: 0.85,
        generatedAt: new Date().toISOString(),
        analyzer: 'continuation',
      },
      {
        id: 'funnel_test_approved_1',
        type: 'ErrorSpike',
        severity: 'critical',
        status: 'approved',
        title: 'Test task - approved',
        description: 'Test',
        priority: 90,
        confidence: 0.95,
        generatedAt: new Date().toISOString(),
        approvedAt: new Date().toISOString(),
        analyzer: 'error_spike',
      },
      {
        id: 'funnel_test_completed_1',
        type: 'DocsGap',
        severity: 'medium',
        status: 'completed',
        title: 'Test task - completed',
        description: 'Test',
        priority: 60,
        confidence: 0.8,
        generatedAt: new Date().toISOString(),
        approvedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        analyzer: 'docs_gap',
      },
      {
        id: 'funnel_test_dismissed_1',
        type: 'Performance',
        severity: 'medium',
        status: 'dismissed',
        title: 'Test task - dismissed',
        description: 'Test',
        priority: 65,
        confidence: 0.75,
        generatedAt: new Date().toISOString(),
        dismissedAt: new Date().toISOString(),
        dismissReason: 'Test dismissal',
        analyzer: 'performance',
      },
    ];

    for (const task of tasks) {
      await saveTask(task);
      testTaskIds.push(task.id);
    }
  });

  afterAll(async () => {
    // Cleanup test tasks
    // (Note: In production, add cleanup method to task-store.mjs)
  });

  it('should calculate funnel with test data', async () => {
    const funnel = await calculateFunnel({ daysBack: 1 });

    // Should have at least our 4 test tasks
    expect(funnel.stages.generated.count).toBeGreaterThanOrEqual(4);
    expect(funnel.stages.approved.count).toBeGreaterThanOrEqual(2); // approved + completed
    expect(funnel.stages.completed.count).toBeGreaterThanOrEqual(1);
    expect(funnel.stages.dismissed.count).toBeGreaterThanOrEqual(1);
  });
});

console.log('✅ Week 8 smoke tests completed!');
