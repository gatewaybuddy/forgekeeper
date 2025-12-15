import { describe, it, expect } from 'vitest';

import {
  redactPreview,
  truncatePreview,
  redactSensitiveData,
  redactForLogging,
  containsSensitiveData,
  redactObject
} from '../server/core/guardrails.mjs';

describe('server.guardrails - Pattern-based redaction', () => {
  it('redacts Stripe API keys', () => {
    const tests = [
      { input: 'sk_live_1234567890abcdefghij', expected: '<redacted:stripe-live-key>' },
      { input: 'sk_test_9876543210zyxwvutsrq', expected: '<redacted:stripe-test-key>' },
      { input: 'pk_live_abcd1234efgh5678ijkl', expected: '<redacted:stripe-pub-key>' }
    ];

    tests.forEach(({ input, expected }) => {
      const out = redactPreview(input);
      expect(out).toContain(expected);
      expect(out).not.toContain(input);
    });
  });

  it('redacts OpenAI API keys', () => {
    const key = 'sk-1234567890abcdefghijklmnopqrstuvwxyz';
    const out = redactPreview(key);
    expect(out).toContain('<redacted:openai-key>');
    expect(out).not.toContain(key);
  });

  it('redacts Anthropic API keys', () => {
    const key = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz';
    const out = redactPreview(key);
    expect(out).toContain('<redacted:anthropic-key>');
    expect(out).not.toContain(key);
  });

  it('redacts AWS access keys', () => {
    const key = 'AKIAIOSFODNN7EXAMPLE';
    const out = redactPreview(key);
    expect(out).toContain('<redacted:aws-access-key>');
    expect(out).not.toContain(key);
  });

  it('redacts GitHub tokens', () => {
    const tests = [
      { input: 'ghp_1234567890abcdefghijklmnopqrstuvwxyz', expected: '<redacted:github-pat>' },
      { input: 'gho_1234567890abcdefghijklmnopqrstuvwxyz', expected: '<redacted:github-oauth>' },
      { input: 'github_pat_11AAAAAAAAAAAAAAAAAAAAA_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', expected: '<redacted:github-pat-v2>' }
    ];

    tests.forEach(({ input, expected }) => {
      const out = redactPreview(input);
      expect(out).toContain(expected);
      expect(out).not.toContain(input);
    });
  });

  it('redacts JWT tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const out = redactPreview(jwt);
    expect(out).toContain('<redacted:jwt-token>');
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  it('redacts SSH private keys', () => {
    const key = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----';
    const out = redactPreview(key);
    expect(out).toContain('<redacted:ssh-private-key>');
    expect(out).not.toContain('MIIEpAIBAAKCAQEA');
  });

  it('redacts email addresses', () => {
    const email = 'contact me at alice@example.com for help';
    const out = redactPreview(email);
    expect(out).toContain('<redacted:email>');
    expect(out).not.toContain('alice@example.com');
  });

  it('redacts URL credentials', () => {
    const tests = [
      { input: 'https://user:pass@example.com/path', pattern: 'https://<redacted:url-creds>@' },
      { input: 'http://admin:secret123@localhost:8080', pattern: 'http://<redacted:url-creds>@' },
      { input: 'mongodb://dbuser:dbpass@cluster0.mongodb.net', pattern: 'mongodb://<redacted:db-creds>@' },
      { input: 'postgresql://pguser:pgpass@postgres.example.com:5432/mydb', pattern: 'postgresql://<redacted:db-creds>@' }
    ];

    tests.forEach(({ input, pattern }) => {
      const out = redactPreview(input);
      expect(out).toContain(pattern);
    });
  });

  it('redacts passwords in various formats', () => {
    const tests = [
      'password=mysecret123',
      'passwd: topsecret',
      'pwd="SuperSecret!"'
    ];

    tests.forEach(input => {
      const out = redactPreview(input);
      expect(out).toContain('<redacted:password>');
      expect(out).not.toContain('mysecret');
      expect(out).not.toContain('topsecret');
      expect(out).not.toContain('SuperSecret');
    });
  });

  it('redacts credit card numbers', () => {
    const cards = [
      '4532015112830366',  // Visa
      '5425233430109903',  // MasterCard
      '374245455400126',   // Amex
      '6011111111111117'   // Discover
    ];

    cards.forEach(card => {
      const out = redactPreview(`Card: ${card}`);
      expect(out).toContain('<redacted:credit-card>');
      expect(out).not.toContain(card);
    });
  });

  it('redacts environment variables with sensitive keys', () => {
    const env = 'OPENAI_API_KEY=sk-1234567890\nDATABASE_URL=postgres://user:pass@localhost';
    const out = redactPreview(env);
    expect(out).toContain('OPENAI_API_KEY=<redacted:env-secret>');
    expect(out).toContain('DATABASE_URL=<redacted:env-secret>');
  });
});

describe('server.guardrails - redactSensitiveData function', () => {
  it('redacts strings with sensitive patterns', () => {
    const input = 'My API key is sk_test_1234567890abcd and email is test@example.com';
    const out = redactSensitiveData(input);
    expect(out).toContain('<redacted:stripe-test-key>');
    expect(out).toContain('<redacted:email>');
    expect(out).not.toContain('sk_test_1234567890abcd');
    expect(out).not.toContain('test@example.com');
  });

  it('recursively redacts objects with sensitive values', () => {
    const input = {
      user: 'alice',
      email: 'alice@example.com',
      api_key: 'sk_test_1234567890abcd',
      config: {
        token: 'ghp_abcdefghijklmnopqrstuvwxyz',
        database_url: 'postgres://user:pass@localhost/db'
      }
    };

    const out = redactSensitiveData(input);
    expect(out.user).toBe('alice');
    expect(out.email).toContain('<redacted:email>');
    expect(out.api_key).toBe('<redacted>'); // key name triggers redaction
    expect(out.config.token).toBe('<redacted>'); // key name triggers redaction
    expect(out.config.database_url).toContain('<redacted:db-creds>');
  });

  it('redacts sensitive keys by name', () => {
    const input = {
      username: 'alice',
      password: 'mysecret123',
      secret_key: 'topsecret',
      api_token: 'abc123def456',
      public_info: 'this is fine'
    };

    const out = redactSensitiveData(input);
    expect(out.username).toBe('alice');
    expect(out.password).toBe('<redacted>');
    expect(out.secret_key).toBe('<redacted>');
    expect(out.api_token).toBe('<redacted>');
    expect(out.public_info).toBe('this is fine');
  });

  it('recursively redacts nested arrays', () => {
    const input = {
      users: [
        { name: 'alice', email: 'alice@example.com' },
        { name: 'bob', email: 'bob@example.com' }
      ],
      tokens: ['sk_test_abc1234567890', 'ghp_def456789012345678901234567890']
    };

    const out = redactSensitiveData(input);
    expect(out.users[0].name).toBe('alice');
    expect(out.users[0].email).toContain('<redacted:email>');
    expect(out.users[1].email).toContain('<redacted:email>');
    expect(out.tokens[0]).toContain('<redacted:stripe-test-key>');
    expect(out.tokens[1]).toContain('<redacted:github-pat>');
  });

  it('handles deeply nested structures', () => {
    const input = {
      level1: {
        level2: {
          level3: {
            level4: {
              password: 'secret123',
              email: 'deep@example.com'
            }
          }
        }
      }
    };

    const out = redactSensitiveData(input);
    expect(out.level1.level2.level3.level4.password).toBe('<redacted>');
    expect(out.level1.level2.level3.level4.email).toContain('<redacted:email>');
  });

  it('preserves non-sensitive data', () => {
    const input = {
      name: 'Alice',
      age: 30,
      active: true,
      tags: ['developer', 'engineer'],
      metadata: {
        created: '2024-01-01',
        version: '1.0.0'
      }
    };

    const out = redactSensitiveData(input);
    expect(out).toEqual(input); // Should be unchanged
  });

  it('handles null and undefined values', () => {
    const input = {
      value1: null,
      value2: undefined,
      value3: 'normal',
      nested: {
        value4: null,
        password: 'secret'
      }
    };

    const out = redactSensitiveData(input);
    expect(out.value1).toBeNull();
    expect(out.value2).toBeUndefined();
    expect(out.value3).toBe('normal');
    expect(out.nested.value4).toBeNull();
    expect(out.nested.password).toBe('<redacted>');
  });

  it('handles primitive values', () => {
    expect(redactSensitiveData(null)).toBeNull();
    expect(redactSensitiveData(undefined)).toBeUndefined();
    expect(redactSensitiveData(123)).toBe(123);
    expect(redactSensitiveData(true)).toBe(true);
  });

  it('applies aggressive mode to redact long strings', () => {
    const longHash = 'a'.repeat(50); // 50 character string
    const input = { hash: longHash, name: 'short' };

    const outNormal = redactSensitiveData(input, { aggressive: false });
    expect(outNormal.hash).toBe(longHash); // Not redacted in normal mode

    const outAggressive = redactSensitiveData(input, { aggressive: true });
    expect(outAggressive.hash).toContain('<redacted:long-string>');
    expect(outAggressive.name).toBe('short'); // Short strings not affected
  });

  it('respects max depth to prevent infinite recursion', () => {
    const circular = { level: 1 };
    circular.self = circular; // Create circular reference

    // This would hang without max depth protection
    // We can't test circular directly due to JSON.stringify issues,
    // but we can test deep nesting
    const deep = { l1: { l2: { l3: { l4: { l5: { l6: { l7: { l8: { l9: { l10: { l11: { password: 'secret' } } } } } } } } } } } };
    const out = redactSensitiveData(deep, { maxDepth: 5 });

    // Should stop at depth 5 - the value at depth 6 should be truncated
    expect(out.l1.l2.l3.l4.l5.l6).toBe('[max-depth-exceeded]');
  });
});

describe('server.guardrails - redactForLogging function', () => {
  it('combines redaction and truncation', () => {
    const input = {
      message: 'User registered',
      email: 'newuser@example.com',
      api_key: 'sk_test_1234567890abcd',
      long_data: 'x'.repeat(5000)
    };

    const out = redactForLogging(input, { maxBytes: 500 });

    // Should be redacted
    expect(out).toContain('<redacted:email>');
    expect(out).toContain('<redacted>'); // api_key

    // Should be truncated
    expect(out).toContain('[TRUNCATED]');
    expect(out.length).toBeLessThan(600); // Should be around 500 + marker
  });

  it('handles errors gracefully', () => {
    const problematic = {};
    Object.defineProperty(problematic, 'bad', {
      get() { throw new Error('Cannot access'); }
    });

    // Should not throw, should return safe string
    const out = redactForLogging(problematic);
    expect(typeof out).toBe('string');
  });
});

describe('server.guardrails - redactObject function', () => {
  it('redacts sensitive keys in objects', () => {
    const input = {
      username: 'alice',
      password: 'secret123',
      email: 'alice@example.com',
      api_key: 'sk_test_abc',
      normal_field: 'normal value'
    };

    const out = redactObject(input);
    expect(out.username).toBe('alice');
    expect(out.password).toBe('<redacted>');
    expect(out.api_key).toBe('<redacted>');
    expect(out.normal_field).toBe('normal value');
    // Note: redactObject doesn't apply pattern matching, only key-based redaction
  });

  it('accepts custom sensitive keys', () => {
    const input = {
      custom_secret: 'value1',
      another_secret: 'value2',
      normal: 'value3'
    };

    const out = redactObject(input, ['custom_secret', 'another_secret']);
    expect(out.custom_secret).toBe('<redacted>');
    expect(out.another_secret).toBe('<redacted>');
    expect(out.normal).toBe('value3');
  });
});

describe('server.guardrails - containsSensitiveData function', () => {
  it('detects sensitive patterns in strings', () => {
    expect(containsSensitiveData('sk_live_1234567890abcd')).toBe(true);
    expect(containsSensitiveData('password=mysecret')).toBe(true);
    expect(containsSensitiveData('AKIAIOSFODNN7EXAMPLE')).toBe(true);
    expect(containsSensitiveData('normal text without secrets')).toBe(false);
  });

  it('detects sensitive patterns in objects', () => {
    expect(containsSensitiveData({ api_key: 'sk_test_1234567890abcd' })).toBe(true);
    expect(containsSensitiveData({ name: 'alice', age: 30 })).toBe(false);
  });
});

describe('server.guardrails - truncation', () => {
  it('truncates long previews with marker', () => {
    const long = 'X'.repeat(9000);
    const out = truncatePreview(long, 64);
    expect(out).toContain('[TRUNCATED]');
    expect(out.length).toBeLessThan(150); // Should be around 64 + marker
  });

  it('preserves short text', () => {
    const short = 'Hello world';
    const out = truncatePreview(short, 100);
    expect(out).toBe(short);
    expect(out).not.toContain('[TRUNCATED]');
  });

  it('handles empty and null values', () => {
    expect(truncatePreview('')).toBe('');
    expect(truncatePreview(null)).toBe('');
    expect(truncatePreview(undefined)).toBe('');
  });
});

describe('server.guardrails - Integration tests', () => {
  it('redacts complex tool arguments', () => {
    const toolArgs = {
      operation: 'deploy',
      config: {
        api_endpoint: 'https://api.example.com',
        auth_token: 'sk_test_1234567890abcd',
        database_url: 'postgresql://admin:secret@db.example.com/prod',
        notifications: {
          email: 'admin@example.com',
          webhook: 'https://hooks.slack.com/services/T00/B00/xxx'
        }
      },
      metadata: {
        user: 'alice',
        timestamp: '2024-01-01T00:00:00Z'
      }
    };

    const out = redactSensitiveData(toolArgs);

    // Should preserve structure
    expect(out.operation).toBe('deploy');
    expect(out.config.api_endpoint).toBe('https://api.example.com');
    expect(out.metadata.user).toBe('alice');

    // Should redact sensitive data
    expect(out.config.auth_token).toBe('<redacted>');
    expect(out.config.database_url).toContain('<redacted:db-creds>');
    expect(out.config.notifications.email).toContain('<redacted:email>');
  });

  it('handles tool results with mixed content', () => {
    const toolResult = {
      success: true,
      message: 'Deployment completed',
      logs: [
        'Starting deployment...',
        'Connected to database: postgresql://user:pass@localhost/db',
        'API key configured: sk_live_abcdefghij',
        'Deployment successful'
      ],
      user_info: {
        email: 'deployer@example.com',
        api_key: 'ghp_1234567890abcdefghij'
      }
    };

    const out = redactSensitiveData(toolResult);

    expect(out.success).toBe(true);
    expect(out.message).toBe('Deployment completed');
    expect(out.logs[0]).toBe('Starting deployment...');
    expect(out.logs[1]).toContain('<redacted:db-creds>');
    expect(out.logs[2]).toContain('<redacted:stripe-live-key>');
    expect(out.user_info.api_key).toBe('<redacted>');
  });
});

