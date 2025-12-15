/**
 * Unit Tests for Risk Assessment Engine (T302)
 *
 * Tests risk classification, scoring, pattern matching, and approval logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  assessRisk,
  requiresApproval,
  getRiskLevel,
  explainRisk,
  getRiskConfig,
} from '../server/collaborative/risk-assessment.mjs';

describe('Risk Assessment Engine (T302)', () => {
  beforeEach(() => {
    // Set default approval threshold to 'high' (0.75)
    process.env.AUTONOMOUS_APPROVAL_REQUIRED = 'high';
  });

  describe('Risk Classification - Critical Level', () => {
    it('should classify production deployment as critical', () => {
      const assessment = assessRisk('deploy_production');

      expect(assessment.level).toBe('critical');
      expect(assessment.score).toBeGreaterThanOrEqual(0.85);
      expect(assessment.requiresApproval).toBe(true);
    });

    it('should classify database drop as critical', () => {
      const assessment = assessRisk('drop_database');

      expect(assessment.level).toBe('critical');
      expect(assessment.score).toBe(1.0);
      expect(assessment.requiresApproval).toBe(true);
    });

    it('should classify recursive force delete as critical', () => {
      const assessment = assessRisk('rm_-rf_folder');

      expect(assessment.level).toBe('critical');
      expect(assessment.score).toBeGreaterThanOrEqual(0.85);
      expect(assessment.requiresApproval).toBe(true);
    });

    it('should classify security changes as critical', () => {
      const assessment = assessRisk('security_config_change');

      expect(assessment.level).toBe('critical');
      expect(assessment.score).toBeGreaterThanOrEqual(0.85);
      expect(assessment.requiresApproval).toBe(true);
    });
  });

  describe('Risk Classification - High Level', () => {
    it('should classify git force push as high', () => {
      const assessment = assessRisk('git_push_force');

      expect(assessment.level).toBe('high');
      expect(assessment.score).toBeGreaterThanOrEqual(0.65);
      expect(assessment.score).toBeLessThan(0.85);
      expect(assessment.requiresApproval).toBe(true);
    });

    it('should classify deployment as high', () => {
      const assessment = assessRisk('deploy_staging');

      expect(assessment.level).toBe('high');
      expect(assessment.score).toBeGreaterThanOrEqual(0.65);
      expect(assessment.requiresApproval).toBe(true);
    });

    it('should classify file deletion as high', () => {
      const assessment = assessRisk('delete_file');

      expect(assessment.level).toBe('high');
      expect(assessment.score).toBeGreaterThanOrEqual(0.65);
      expect(assessment.requiresApproval).toBe(true);
    });

    it('should classify external API call as high', () => {
      const assessment = assessRisk('api_call_external');

      expect(assessment.level).toBe('high');
      expect(assessment.score).toBeGreaterThanOrEqual(0.65);
      expect(assessment.requiresApproval).toBe(true);
    });
  });

  describe('Risk Classification - Medium Level', () => {
    it('should classify git commit as medium', () => {
      const assessment = assessRisk('git_commit');

      expect(assessment.level).toBe('medium');
      expect(assessment.score).toBeGreaterThanOrEqual(0.35);
      expect(assessment.score).toBeLessThan(0.65);
    });

    it('should classify file write as medium', () => {
      const assessment = assessRisk('file_write');

      expect(assessment.level).toBe('medium');
      expect(assessment.score).toBeGreaterThanOrEqual(0.35);
      expect(assessment.score).toBeLessThan(0.65);
    });

    it('should classify shell command as medium', () => {
      const assessment = assessRisk('shell_command_ls');

      expect(assessment.level).toBe('medium');
      expect(assessment.score).toBeGreaterThanOrEqual(0.35);
      expect(assessment.score).toBeLessThan(0.65);
    });
  });

  describe('Risk Classification - Low Level', () => {
    it('should classify read operation as low', () => {
      const assessment = assessRisk('read_file');

      expect(assessment.level).toBe('low');
      expect(assessment.score).toBeLessThan(0.35);
      expect(assessment.requiresApproval).toBe(false);
    });

    it('should classify list operation as low', () => {
      const assessment = assessRisk('list_files');

      expect(assessment.level).toBe('low');
      expect(assessment.score).toBeLessThan(0.35);
      expect(assessment.requiresApproval).toBe(false);
    });

    it('should classify search operation as low', () => {
      const assessment = assessRisk('search_code');

      expect(assessment.level).toBe('low');
      expect(assessment.score).toBeLessThan(0.35);
      expect(assessment.requiresApproval).toBe(false);
    });

    it('should classify analyze operation as low', () => {
      const assessment = assessRisk('analyze_data');

      expect(assessment.level).toBe('low');
      expect(assessment.score).toBeLessThan(0.35);
      expect(assessment.requiresApproval).toBe(false);
    });
  });

  describe('Context-Based Risk Adjustment', () => {
    it('should increase risk for production environment', () => {
      const baseAssessment = assessRisk('file_write');
      const prodAssessment = assessRisk('file_write', { environment: 'production' });

      expect(prodAssessment.score).toBeGreaterThan(baseAssessment.score);
      expect(prodAssessment.factors).toContainEqual(
        expect.objectContaining({ description: 'Production environment' })
      );
    });

    it('should increase risk for irreversible operations', () => {
      const baseAssessment = assessRisk('file_write');
      const irreversibleAssessment = assessRisk('file_write', { irreversible: true });

      expect(irreversibleAssessment.score).toBeGreaterThan(baseAssessment.score);
      expect(irreversibleAssessment.factors).toContainEqual(
        expect.objectContaining({ description: 'Irreversible operation' })
      );
    });

    it('should increase risk for sensitive data', () => {
      const baseAssessment = assessRisk('file_write');
      const sensitiveAssessment = assessRisk('file_write', { sensitiveData: true });

      expect(sensitiveAssessment.score).toBeGreaterThan(baseAssessment.score);
      expect(sensitiveAssessment.factors).toContainEqual(
        expect.objectContaining({ description: 'Involves sensitive data' })
      );
    });

    it('should increase risk for external API calls', () => {
      const baseAssessment = assessRisk('tool_execution');
      const externalAssessment = assessRisk('tool_execution', { externalAPI: true });

      expect(externalAssessment.score).toBeGreaterThan(baseAssessment.score);
      expect(externalAssessment.factors).toContainEqual(
        expect.objectContaining({ description: 'External API interaction' })
      );
    });

    it('should increase risk for batch operations', () => {
      const baseAssessment = assessRisk('file_write');
      const batchAssessment = assessRisk('file_write', { batchOperation: true });

      expect(batchAssessment.score).toBeGreaterThan(baseAssessment.score);
      expect(batchAssessment.factors).toContainEqual(
        expect.objectContaining({ description: 'Batch/bulk operation' })
      );
    });

    it('should increase risk for untested code', () => {
      const baseAssessment = assessRisk('code_change');
      const untestedAssessment = assessRisk('code_change', { hasTests: false });

      expect(untestedAssessment.score).toBeGreaterThan(baseAssessment.score);
      expect(untestedAssessment.factors).toContainEqual(
        expect.objectContaining({ description: 'No test coverage' })
      );
    });

    it('should stack multiple context factors', () => {
      const baseAssessment = assessRisk('file_write');
      const complexAssessment = assessRisk('file_write', {
        environment: 'production',
        irreversible: true,
        sensitiveData: true,
        batchOperation: true,
      });

      // Should have significantly higher risk with 4 context factors
      // Base is 0.5, adding 4 factors (0.3+0.2+0.2+0.15=0.85) should give us at least 0.85+
      expect(complexAssessment.score).toBeGreaterThanOrEqual(0.85);
      expect(complexAssessment.score).toBeGreaterThan(baseAssessment.score);
      expect(complexAssessment.factors.length).toBeGreaterThanOrEqual(5); // Base + 4 context
      expect(complexAssessment.level).toMatch(/high|critical/);
    });
  });

  describe('Approval Requirement Logic', () => {
    it('should require approval for high threshold with high risk operation', () => {
      process.env.AUTONOMOUS_APPROVAL_REQUIRED = 'high';

      const assessment = assessRisk('git_push_force');

      expect(assessment.requiresApproval).toBe(true);
    });

    it('should not require approval for high threshold with low risk operation', () => {
      process.env.AUTONOMOUS_APPROVAL_REQUIRED = 'high';

      const assessment = assessRisk('read_file');

      expect(assessment.requiresApproval).toBe(false);
    });

    it('should require approval for medium threshold with medium risk operation', () => {
      process.env.AUTONOMOUS_APPROVAL_REQUIRED = 'medium';

      const assessment = assessRisk('git_commit');

      expect(assessment.requiresApproval).toBe(true);
    });

    it('should require approval for low threshold with most operations', () => {
      process.env.AUTONOMOUS_APPROVAL_REQUIRED = 'low';

      // Config read has score 0.4, which is >= 0.25 (low threshold)
      const configReadAssessment = assessRisk('config_read');
      expect(configReadAssessment.requiresApproval).toBe(true);

      const mediumRiskAssessment = assessRisk('git_commit');
      expect(mediumRiskAssessment.requiresApproval).toBe(true);
    });

    it('should only require approval for critical when threshold is critical', () => {
      process.env.AUTONOMOUS_APPROVAL_REQUIRED = 'critical';

      const highRiskAssessment = assessRisk('git_push_force');
      expect(highRiskAssessment.requiresApproval).toBe(false); // High, not critical

      const criticalRiskAssessment = assessRisk('deploy_production');
      expect(criticalRiskAssessment.requiresApproval).toBe(true); // Critical
    });
  });

  describe('Helper Functions', () => {
    it('requiresApproval() should return boolean directly', () => {
      const required = requiresApproval('deploy_production');

      expect(typeof required).toBe('boolean');
      expect(required).toBe(true);
    });

    it('getRiskLevel() should return level string directly', () => {
      const level = getRiskLevel('git_commit');

      expect(typeof level).toBe('string');
      expect(level).toBe('medium');
    });

    it('explainRisk() should return human-readable explanation', () => {
      const assessment = assessRisk('deploy_production', { environment: 'production' });
      const explanation = explainRisk(assessment);

      expect(explanation).toContain('Risk Level: CRITICAL');
      expect(explanation).toContain('Production deployment');
      expect(explanation).toContain('Approval Required: YES');
      expect(explanation).toContain('Risk Factors:');
    });

    it('getRiskConfig() should return current configuration', () => {
      process.env.AUTONOMOUS_APPROVAL_REQUIRED = 'high';

      const config = getRiskConfig();

      expect(config.approvalRequired).toBe('high');
      expect(config.approvalThreshold).toBe(0.75);
      expect(config.levels).toBeDefined();
      expect(config.levels.low).toBe('0.0 - 0.34');
      expect(config.levels.high).toBe('0.65 - 0.84');
    });
  });

  describe('Unknown Operations', () => {
    it('should default to medium risk for unknown operations', () => {
      const assessment = assessRisk('unknown_operation_xyz');

      expect(assessment.level).toBe('medium');
      expect(assessment.score).toBe(0.5);
      expect(assessment.reasoning).toContain('Unknown operation type');
    });

    it('should still apply context factors to unknown operations', () => {
      const assessment = assessRisk('unknown_op', {
        environment: 'production',
        irreversible: true,
      });

      expect(assessment.score).toBeGreaterThan(0.5);
      expect(assessment.level).toMatch(/high|critical/);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty operation name', () => {
      const assessment = assessRisk('');

      expect(assessment).toBeDefined();
      expect(assessment.level).toBeDefined();
      expect(assessment.score).toBeGreaterThanOrEqual(0);
      expect(assessment.score).toBeLessThanOrEqual(1);
    });

    it('should handle operation with special characters', () => {
      const assessment = assessRisk('git_commit@#$%');

      expect(assessment).toBeDefined();
      expect(assessment.level).toBeDefined();
    });

    it('should cap score at 1.0 even with many context factors', () => {
      const assessment = assessRisk('deploy_production', {
        environment: 'production',
        irreversible: true,
        sensitiveData: true,
        batchOperation: true,
        externalAPI: true,
        hasTests: false,
      });

      expect(assessment.score).toBeLessThanOrEqual(1.0);
    });

    it('should handle null context gracefully', () => {
      const assessment = assessRisk('read_file', null);

      expect(assessment).toBeDefined();
      expect(assessment.level).toBe('low');
    });
  });

  describe('Risk Factor Analysis', () => {
    it('should provide detailed risk factors', () => {
      const assessment = assessRisk('deploy_production', {
        environment: 'production',
        irreversible: true,
      });

      expect(assessment.factors.length).toBeGreaterThan(0);
      expect(assessment.factors[0]).toHaveProperty('category');
      expect(assessment.factors[0]).toHaveProperty('description');
      expect(assessment.factors[0]).toHaveProperty('weight');
    });

    it('should categorize risk factors correctly', () => {
      const assessment = assessRisk('deploy_production', {
        environment: 'production',
        sensitiveData: true,
      });

      const categories = assessment.factors.map(f => f.category);
      expect(categories).toContain('code');
      expect(categories).toContain('external'); // Production environment
      expect(categories).toContain('security'); // Sensitive data
    });
  });
});
