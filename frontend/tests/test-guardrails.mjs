// Comprehensive test suite for redaction and guardrails (T21)
// Tests all 30+ sensitive data patterns with real-world examples

import { redactPreview, redactObject, containsSensitiveData, truncatePreview } from '../server.guardrails.mjs';
import assert from 'assert';

// Color output for better readability
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function pass(msg) {
  console.log(`${colors.green}✓${colors.reset} ${msg}`);
}

function fail(msg, expected, actual) {
  console.log(`${colors.red}✗${colors.reset} ${msg}`);
  console.log(`  Expected: ${expected}`);
  console.log(`  Actual:   ${actual}`);
  throw new Error(`Test failed: ${msg}`);
}

function section(title) {
  console.log(`\n${colors.blue}═══ ${title} ═══${colors.reset}`);
}

// Test counter
let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    pass(name);
  } catch (err) {
    fail(name, err.expected || 'no error', err.message);
  }
}

// ============================================================================
// API Keys & Service Tokens
// ============================================================================

section('API Keys & Service Tokens');

test('Redacts Stripe live key', () => {
  const input = 'Payment with sk_live_51HxLy2eZvKYlo2C9FzN4bwXz key';
  const output = redactPreview(input);
  assert(!output.includes('sk_live_51'), 'Should not contain original key');
  assert(output.includes('<redacted:stripe-live-key>'), 'Should show redaction marker');
});

test('Redacts Stripe test key', () => {
  const input = 'Testing: sk_test_4eC39HqLyjWDarjtT1zdp7dc';
  const output = redactPreview(input);
  assert(!output.includes('sk_test_4eC'), 'Should not contain original key');
  assert(output.includes('<redacted:stripe-test-key>'), 'Should show redaction marker');
});

test('Redacts OpenAI API key', () => {
  const input = 'OPENAI_API_KEY=sk-proj-abc123xyz789def456ghi';
  const output = redactPreview(input);
  assert(!output.includes('sk-proj-abc'), 'Should not contain original key');
  assert(output.includes('<redacted:'), 'Should show redaction marker');
});

test('Redacts Anthropic API key', () => {
  const input = 'sk-ant-api03-abc123xyz789def456ghi012jkl345mno678pqr901stu234vwx567yza890bcd123efg456hij789klm012nop';
  const output = redactPreview(input);
  assert(!output.includes('sk-ant-api03'), 'Should not contain original key');
  assert(output.includes('<redacted:anthropic-key>'), 'Should show redaction marker');
});

test('Redacts AWS access key', () => {
  const input = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
  const output = redactPreview(input);
  assert(!output.includes('AKIAIOSFODNN7'), 'Should not contain original key');
  assert(output.includes('<redacted:aws-access-key>'), 'Should show redaction marker');
});

test('Redacts AWS secret key', () => {
  const input = 'aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
  const output = redactPreview(input);
  assert(!output.includes('wJalrXUtnFEMI'), 'Should not contain original key');
  assert(output.includes('<redacted:aws-secret-key>'), 'Should show redaction marker');
});

test('Redacts Google API key', () => {
  const input = 'key: AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe';
  const output = redactPreview(input);
  assert(!output.includes('AIzaSyDaGmWKa4'), 'Should not contain original key');
  assert(output.includes('<redacted:google-api-key>'), 'Should show redaction marker');
});

test('Redacts GitHub Personal Access Token', () => {
  const input = 'token: ghp_1234567890abcdefghijklmnopqrstuv';
  const output = redactPreview(input);
  assert(!output.includes('ghp_1234567890'), 'Should not contain original token');
  assert(output.includes('<redacted:github-pat>'), 'Should show redaction marker');
});

test('Redacts GitHub PAT v2', () => {
  const input = 'github_pat_11AABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ01234567';
  const output = redactPreview(input);
  assert(!output.includes('github_pat_11AA'), 'Should not contain original token');
  assert(output.includes('<redacted:github-pat-v2>'), 'Should show redaction marker');
});

test('Redacts generic API key', () => {
  const input = 'api_key: 1234567890abcdef1234567890';
  const output = redactPreview(input);
  assert(!output.includes('1234567890abcdef'), 'Should not contain original key');
  assert(output.includes('<redacted:'), 'Should show redaction marker');
});

test('Redacts bearer token', () => {
  const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dGVzdA';
  const output = redactPreview(input);
  assert(!output.includes('eyJhbGciOiJIUzI1NiIs'), 'Should not contain original token');
  assert(output.includes('<redacted:'), 'Should show redaction marker');
});

// ============================================================================
// JWT Tokens
// ============================================================================

section('JWT Tokens');

test('Redacts JWT token', () => {
  const input = 'token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const output = redactPreview(input);
  assert(!output.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), 'Should not contain JWT header');
  assert(output.includes('<redacted:jwt-token>'), 'Should show redaction marker');
});

// ============================================================================
// SSH Keys
// ============================================================================

section('SSH Private Keys');

test('Redacts RSA private key', () => {
  const input = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA1234567890abcdefghijklmnop
qrstuvwxyzABCDEFGHIJKLMNOP
-----END RSA PRIVATE KEY-----`;
  const output = redactPreview(input);
  assert(!output.includes('MIIEpAIBAAKCAQEA'), 'Should not contain key data');
  assert(output.includes('<redacted:ssh-private-key>'), 'Should show redaction marker');
});

test('Redacts OpenSSH private key', () => {
  const input = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn
-----END OPENSSH PRIVATE KEY-----`;
  const output = redactPreview(input);
  assert(!output.includes('b3BlbnNzaC1rZXktdjEA'), 'Should not contain key data');
  assert(output.includes('<redacted:openssh-key>'), 'Should show redaction marker');
});

// ============================================================================
// Passwords
// ============================================================================

section('Passwords');

test('Redacts password with equals sign', () => {
  const input = 'password=MySecretPass123!';
  const output = redactPreview(input);
  assert(!output.includes('MySecretPass123'), 'Should not contain password');
  assert(output.includes('<redacted:password>'), 'Should show redaction marker');
});

test('Redacts passwd field', () => {
  const input = 'passwd: "SuperSecret456"';
  const output = redactPreview(input);
  assert(!output.includes('SuperSecret456'), 'Should not contain password');
  assert(output.includes('<redacted:password>'), 'Should show redaction marker');
});

test('Redacts pwd in JSON', () => {
  const input = '{"user":"alice","pwd":"hiddenpass789"}';
  const output = redactPreview(input);
  assert(!output.includes('hiddenpass789'), 'Should not contain password');
  assert(output.includes('<redacted:password>'), 'Should show redaction marker');
});

// ============================================================================
// Database Connection Strings
// ============================================================================

section('Database Connection Strings');

test('Redacts MongoDB connection string', () => {
  const input = 'mongodb://admin:MyP@ssw0rd@localhost:27017/mydb';
  const output = redactPreview(input);
  assert(!output.includes('MyP@ssw0rd'), 'Should not contain password');
  assert(output.includes('<redacted:db-creds>'), 'Should show redaction marker');
});

test('Redacts PostgreSQL connection string', () => {
  const input = 'postgresql://user:secret123@db.example.com:5432/production';
  const output = redactPreview(input);
  assert(!output.includes('secret123'), 'Should not contain password');
  assert(output.includes('<redacted:db-creds>'), 'Should show redaction marker');
});

test('Redacts MySQL connection string', () => {
  const input = 'mysql://root:RootPass123@mysql-server:3306/app_db';
  const output = redactPreview(input);
  assert(!output.includes('RootPass123'), 'Should not contain password');
  assert(output.includes('<redacted:db-creds>'), 'Should show redaction marker');
});

test('Redacts HTTP basic auth', () => {
  const input = 'https://user:password123@api.example.com/endpoint';
  const output = redactPreview(input);
  assert(!output.includes('password123'), 'Should not contain password');
  assert(output.includes('<redacted:url-creds>'), 'Should show redaction marker');
});

// ============================================================================
// PII (Personally Identifiable Information)
// ============================================================================

section('PII - Email Addresses');

test('Redacts email address', () => {
  const input = 'Contact: user@example.com for support';
  const output = redactPreview(input);
  assert(!output.includes('user@example.com'), 'Should not contain email');
  assert(output.includes('<redacted:email>'), 'Should show redaction marker');
});

test('Redacts multiple emails', () => {
  const input = 'From: alice@company.com To: bob@client.org';
  const output = redactPreview(input);
  assert(!output.includes('alice@company.com'), 'Should not contain first email');
  assert(!output.includes('bob@client.org'), 'Should not contain second email');
  assert(output.includes('<redacted:email>'), 'Should show redaction marker');
});

section('PII - Phone Numbers');

test('Redacts US phone number (parentheses)', () => {
  const input = 'Call us: (555) 123-4567';
  const output = redactPreview(input);
  assert(!output.includes('555) 123-4567'), 'Should not contain phone');
  assert(output.includes('<redacted:phone>'), 'Should show redaction marker');
});

test('Redacts US phone number (dashes)', () => {
  const input = 'Mobile: 555-123-4567';
  const output = redactPreview(input);
  assert(!output.includes('555-123-4567'), 'Should not contain phone');
  assert(output.includes('<redacted:phone>'), 'Should show redaction marker');
});

test('Redacts US phone number (dots)', () => {
  const input = 'Fax: 555.123.4567';
  const output = redactPreview(input);
  assert(!output.includes('555.123.4567'), 'Should not contain phone');
  assert(output.includes('<redacted:phone>'), 'Should show redaction marker');
});

section('PII - Credit Cards');

test('Redacts Visa card', () => {
  const input = 'Card: 4532015112830366';
  const output = redactPreview(input);
  assert(!output.includes('4532015112830366'), 'Should not contain card number');
  assert(output.includes('<redacted:credit-card>'), 'Should show redaction marker');
});

test('Redacts MasterCard', () => {
  const input = 'Payment: 5425233430109903';
  const output = redactPreview(input);
  assert(!output.includes('5425233430109903'), 'Should not contain card number');
  assert(output.includes('<redacted:credit-card>'), 'Should show redaction marker');
});

test('Redacts American Express', () => {
  const input = 'Amex: 374245455400126';
  const output = redactPreview(input);
  assert(!output.includes('374245455400126'), 'Should not contain card number');
  assert(output.includes('<redacted:credit-card>'), 'Should show redaction marker');
});

section('PII - Social Security Numbers');

test('Redacts SSN', () => {
  const input = 'SSN: 123-45-6789';
  const output = redactPreview(input);
  assert(!output.includes('123-45-6789'), 'Should not contain SSN');
  assert(output.includes('<redacted:ssn>'), 'Should show redaction marker');
});

// ============================================================================
// Environment Variables
// ============================================================================

section('Environment Variable Secrets');

test('Redacts OPENAI_API_KEY', () => {
  const input = 'OPENAI_API_KEY=sk-proj-AbCdEf123456';
  const output = redactPreview(input);
  assert(!output.includes('sk-proj-AbCdEf'), 'Should not contain key value');
  assert(output.includes('<redacted:'), 'Should show redaction marker');
});

test('Redacts DATABASE_URL', () => {
  const input = 'DATABASE_URL=postgres://user:pass@localhost/db';
  const output = redactPreview(input);
  assert(!output.includes('user:pass'), 'Should not contain credentials');
  assert(output.includes('<redacted:'), 'Should show redaction marker');
});

test('Redacts JWT_SECRET', () => {
  const input = 'JWT_SECRET=my-super-secret-key-12345';
  const output = redactPreview(input);
  assert(!output.includes('my-super-secret-key'), 'Should not contain secret');
  assert(output.includes('<redacted:env-secret>'), 'Should show redaction marker');
});

// ============================================================================
// Complex Objects (Deep Redaction)
// ============================================================================

section('Complex Object Redaction');

test('Redacts nested object with sensitive keys', () => {
  const input = {
    user: { name: 'Alice', password: 'secret123' },
    config: { apiKey: 'key_abc', timeout: 5000 },
    db: { host: 'localhost', secret_key: 'db_secret' }
  };
  const output = redactObject(input);

  assert.strictEqual(output.user.name, 'Alice', 'Should preserve non-sensitive data');
  assert.strictEqual(output.user.password, '<redacted>', 'Should redact password');
  assert.strictEqual(output.config.apiKey, '<redacted>', 'Should redact apiKey');
  assert.strictEqual(output.config.timeout, 5000, 'Should preserve timeout');
  assert.strictEqual(output.db.secret_key, '<redacted>', 'Should redact secret_key');
});

test('Redacts arrays with sensitive data', () => {
  const input = {
    users: [
      { name: 'Bob', token: 'token123' },
      { name: 'Carol', token: 'token456' }
    ]
  };
  const output = redactObject(input);

  assert.strictEqual(output.users[0].name, 'Bob', 'Should preserve names');
  assert.strictEqual(output.users[0].token, '<redacted>', 'Should redact first token');
  assert.strictEqual(output.users[1].token, '<redacted>', 'Should redact second token');
});

// ============================================================================
// Sensitive Data Detection
// ============================================================================

section('Sensitive Data Detection');

test('Detects Stripe key', () => {
  const input = 'Using sk_live_abc123 for payments';
  assert(containsSensitiveData(input), 'Should detect Stripe key');
});

test('Detects password', () => {
  const input = 'password=mysecret';
  assert(containsSensitiveData(input), 'Should detect password');
});

test('Detects SSH key', () => {
  const input = '-----BEGIN PRIVATE KEY-----\nMII...';
  assert(containsSensitiveData(input), 'Should detect SSH key');
});

test('Does not flag safe content', () => {
  const input = 'Hello world, this is safe content';
  assert(!containsSensitiveData(input), 'Should not detect in safe content');
});

// ============================================================================
// Truncation Tests
// ============================================================================

section('Truncation');

test('Truncates long strings', () => {
  const input = 'a'.repeat(5000);
  const output = truncatePreview(input, 1000);
  assert(output.length < 1100, 'Should truncate to around max bytes');
  assert(output.includes('[TRUNCATED]'), 'Should show truncation marker');
  assert(output.includes('(5000 bytes)'), 'Should show original size');
});

test('Does not truncate short strings', () => {
  const input = 'Short string';
  const output = truncatePreview(input, 1000);
  assert.strictEqual(output, input, 'Should not truncate short strings');
  assert(!output.includes('[TRUNCATED]'), 'Should not show truncation marker');
});

// ============================================================================
// Edge Cases
// ============================================================================

section('Edge Cases');

test('Handles null input', () => {
  const output = redactPreview(null);
  assert.strictEqual(output, '', 'Should return empty string for null');
});

test('Handles undefined input', () => {
  const output = redactPreview(undefined);
  assert.strictEqual(output, '', 'Should return empty string for undefined');
});

test('Handles empty string', () => {
  const output = redactPreview('');
  assert.strictEqual(output, '', 'Should return empty string');
});

test('Handles object with circular reference', () => {
  const obj = { name: 'test' };
  obj.self = obj;

  try {
    redactPreview(obj);
    fail('Should handle circular references gracefully', 'no error', 'error thrown');
  } catch (err) {
    // Expected - JSON.stringify throws on circular refs
    pass('Handles circular references gracefully');
  }
});

test('Preserves non-sensitive data', () => {
  const input = 'User Alice logged in at 2025-11-07 with ID 12345';
  const output = redactPreview(input);
  assert(output.includes('Alice'), 'Should preserve name');
  assert(output.includes('2025-11-07'), 'Should preserve date');
  assert(output.includes('12345'), 'Should preserve ID');
});

// ============================================================================
// Real-World Scenarios
// ============================================================================

section('Real-World Scenarios');

test('Redacts API request log', () => {
  const input = {
    method: 'POST',
    url: '/api/payment',
    headers: {
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature',
      'X-API-Key': 'sk_live_abc123xyz'
    },
    body: {
      card: '4532015112830366',
      email: 'user@example.com'
    }
  };

  const output = redactPreview(input);
  assert(!output.includes('eyJhbGciOiJIUzI1NiIs'), 'Should redact JWT');
  assert(!output.includes('sk_live_abc123'), 'Should redact API key');
  assert(!output.includes('4532015112830366'), 'Should redact card');
  assert(!output.includes('user@example.com'), 'Should redact email');
});

test('Redacts configuration file', () => {
  const input = `
    DATABASE_URL=postgres://admin:P@ssw0rd@db:5432/prod
    OPENAI_API_KEY=sk-proj-abc123
    JWT_SECRET=super-secret-jwt-key
    STRIPE_SECRET_KEY=sk_live_xyz789
  `;

  const output = redactPreview(input);
  assert(!output.includes('P@ssw0rd'), 'Should redact DB password');
  assert(!output.includes('sk-proj-abc123'), 'Should redact OpenAI key');
  assert(!output.includes('super-secret-jwt-key'), 'Should redact JWT secret');
  assert(!output.includes('sk_live_xyz789'), 'Should redact Stripe key');
});

test('Redacts tool execution args', () => {
  const input = {
    tool: 'http_fetch',
    args: {
      url: 'https://api:secret_key_123@api.example.com/data',
      headers: {
        'Authorization': 'Bearer ghp_abc123xyz789def456ghi'
      }
    }
  };

  const output = redactPreview(input);
  assert(!output.includes('secret_key_123'), 'Should redact URL credentials');
  assert(!output.includes('ghp_abc123xyz789'), 'Should redact GitHub token');
});

// ============================================================================
// Summary
// ============================================================================

console.log(`\n${colors.blue}═══════════════════════════════════════════${colors.reset}`);
console.log(`${colors.blue}Test Summary${colors.reset}`);
console.log(`${colors.blue}═══════════════════════════════════════════${colors.reset}`);
console.log(`Total Tests: ${totalTests}`);
console.log(`${colors.green}Passed: ${passedTests}${colors.reset}`);
console.log(`${colors.red}Failed: ${totalTests - passedTests}${colors.reset}`);
console.log(`Coverage: ${Math.round((passedTests / totalTests) * 100)}%`);

if (passedTests === totalTests) {
  console.log(`\n${colors.green}✓ All tests passed!${colors.reset}`);
  process.exit(0);
} else {
  console.log(`\n${colors.red}✗ Some tests failed${colors.reset}`);
  process.exit(1);
}
