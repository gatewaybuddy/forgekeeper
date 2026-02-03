// Tests for core/guardrails.js
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  checkGuardrails,
  requiresApproval,
  validateGeneratedCode,
  checkRateLimit,
} from '../../core/guardrails.js';

describe('Guardrails Module', async () => {
  describe('checkGuardrails', () => {
    it('should allow safe commands', () => {
      const result = checkGuardrails('npm install express');
      assert.strictEqual(result.allowed, true);
    });

    it('should block rm -rf /', () => {
      const result = checkGuardrails('rm -rf /');
      assert.strictEqual(result.allowed, false);
      assert.strictEqual(result.type, 'destructive');
    });

    it('should block rm -rf ~/', () => {
      const result = checkGuardrails('sudo rm -rf ~/');
      assert.strictEqual(result.allowed, false);
    });

    it('should block DROP TABLE', () => {
      const result = checkGuardrails('DROP TABLE users;');
      assert.strictEqual(result.allowed, false);
      assert.strictEqual(result.type, 'destructive');
    });

    it('should block DELETE without WHERE', () => {
      const result = checkGuardrails('DELETE FROM users;');
      assert.strictEqual(result.allowed, false);
    });

    it('should allow DELETE with WHERE', () => {
      const result = checkGuardrails('DELETE FROM users WHERE id = 1;');
      assert.strictEqual(result.allowed, true);
    });

    it('should block git push --force', () => {
      const result = checkGuardrails('git push --force origin main');
      assert.strictEqual(result.allowed, false);
    });

    it('should block access to .ssh', () => {
      const result = checkGuardrails('cat "~/.ssh/id_rsa"');
      assert.strictEqual(result.allowed, false);
      assert.strictEqual(result.type, 'sensitive_path');
    });

    it('should block access to .env files', () => {
      const result = checkGuardrails('cat ".env.local"');
      assert.strictEqual(result.allowed, false);
    });

    it('should block credentials.json access', () => {
      const result = checkGuardrails('read credentials.json');
      assert.strictEqual(result.allowed, false);
    });

    it('should block fork bombs', () => {
      const result = checkGuardrails(':(){ :|:& };:');
      assert.strictEqual(result.allowed, false);
    });

    it('should block chmod 777', () => {
      const result = checkGuardrails('chmod 777 /var/www');
      assert.strictEqual(result.allowed, false);
    });
  });

  describe('requiresApproval', () => {
    it('should require approval for self-extension', () => {
      const result = requiresApproval({ type: 'self_extension' });
      assert.strictEqual(result.required, true);
      assert.strictEqual(result.level, 'review');
    });

    it('should recommend review for high complexity', () => {
      const result = requiresApproval({
        description: 'Complex refactoring',
        estimated_complexity: 'high',
      });
      assert.strictEqual(result.recommended, true);
    });

    it('should not require approval for normal tasks', () => {
      const result = requiresApproval({
        description: 'Fix typo in README',
        estimated_complexity: 'low',
      });
      assert.strictEqual(result.required, false);
    });

    it('should require approval for destructive content', () => {
      const result = requiresApproval({
        content: 'rm -rf /tmp/cache',
      });
      assert.strictEqual(result.required, true);
    });
  });

  describe('validateGeneratedCode', () => {
    it('should flag eval usage', () => {
      const code = `
        const result = eval(userInput);
      `;
      const result = validateGeneratedCode(code);
      assert.strictEqual(result.safe, false);
      assert.ok(result.issues.some(i => i.includes('eval')));
    });

    it('should flag HTTP (non-HTTPS) requests', () => {
      const code = `
        fetch("http://external-api.com/data");
      `;
      const result = validateGeneratedCode(code);
      assert.strictEqual(result.safe, false);
      assert.ok(result.issues.some(i => i.includes('HTTPS')));
    });

    it('should allow HTTPS requests', () => {
      const code = `
        fetch("https://api.example.com/data");
      `;
      const result = validateGeneratedCode(code);
      assert.ok(!result.issues.some(i => i.includes('HTTPS')));
    });

    it('should allow localhost HTTP', () => {
      const code = `
        fetch("http://localhost:3000/api");
      `;
      const result = validateGeneratedCode(code);
      assert.ok(!result.issues.some(i => i.includes('HTTPS')));
    });

    it('should flag shell execution without validation', () => {
      const code = `
        import { exec } from 'child_process';
        exec(command);
      `;
      const result = validateGeneratedCode(code);
      assert.strictEqual(result.safe, false);
      assert.ok(result.issues.some(i => i.includes('Shell')));
    });

    it('should flag file operations', () => {
      const code = `
        writeFileSync('/etc/passwd', 'hacked');
      `;
      const result = validateGeneratedCode(code);
      assert.ok(result.issues.some(i => i.includes('File')));
    });

    it('should pass clean code', () => {
      const code = `
        function add(a, b) {
          return a + b;
        }
        console.log(add(1, 2));
      `;
      const result = validateGeneratedCode(code);
      assert.strictEqual(result.safe, true);
      assert.strictEqual(result.issues.length, 0);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow first action', () => {
      const result = checkRateLimit('test-user-1', 'unique-action-1');
      assert.strictEqual(result.allowed, true);
    });

    it('should track actions per user/action combo', () => {
      const userId = 'rate-limit-test-user';
      const action = 'rate-limit-test-action';

      // First 10 should be allowed
      for (let i = 0; i < 10; i++) {
        const result = checkRateLimit(userId, action);
        assert.strictEqual(result.allowed, true);
      }

      // 11th should be blocked
      const blocked = checkRateLimit(userId, action);
      assert.strictEqual(blocked.allowed, false);
      assert.ok(blocked.retryAfter > 0);
    });
  });
});
