// Comprehensive test suite for chunked reasoning (T203, T204)
// Tests outline parsing, chunk extraction, configuration, and heuristics

import {
  buildHarmonyOutlinePrompt,
  buildOpenAIOutlinePrompt,
  buildHarmonyChunkPrompt,
  buildOpenAIChunkPrompt,
  parseOutline,
  extractChunkParts,
  getChunkedConfig,
  shouldTriggerChunking,
  estimateTokens,
} from '../config/chunked_prompts.mjs';
import assert from 'assert';

// Color output
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

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    pass(name);
  } catch (err) {
    console.error(err);
    fail(name, err.expected || 'no error', err.message);
  }
}

// ============================================================================
// Outline Parsing
// ============================================================================

section('Outline Parsing');

test('Parses numbered outline format', () => {
  const input = `
1. Introduction to Decorators
2. Basic Syntax and Usage
3. Common Patterns
4. Advanced Techniques
  `;
  const result = parseOutline(input);
  assert.strictEqual(result.length, 4, 'Should parse 4 chunks');
  assert.strictEqual(result[0], 'Introduction to Decorators');
  assert.strictEqual(result[3], 'Advanced Techniques');
});

test('Parses "Chunk N:" format', () => {
  const input = `
Chunk 1: Introduction - Basic concepts
Chunk 2: Implementation - How to use
Chunk 3: Examples - Real-world cases
  `;
  const result = parseOutline(input);
  assert.strictEqual(result.length, 3);
  assert.strictEqual(result[0], 'Introduction');
  assert.strictEqual(result[1], 'Implementation');
});

test('Parses bullet point format', () => {
  const input = `
- Overview and Background
- Technical Deep Dive
- Best Practices
  `;
  const result = parseOutline(input);
  assert.strictEqual(result.length, 3);
  assert.strictEqual(result[0], 'Overview and Background');
});

test('Parses parentheses numbering', () => {
  const input = `
1) Getting Started
2) Core Concepts
3) Advanced Topics
  `;
  const result = parseOutline(input);
  assert.strictEqual(result.length, 3);
  assert.strictEqual(result[0], 'Getting Started');
});

test('Handles mixed formats', () => {
  const input = `
Chunk 1: Introduction
2. Main Content
- Conclusion
  `;
  const result = parseOutline(input);
  assert(result.length >= 2, 'Should parse at least 2 chunks');
});

test('Handles empty input', () => {
  const result = parseOutline('');
  assert.strictEqual(result.length, 0, 'Should return empty array');
});

test('Handles null input', () => {
  const result = parseOutline(null);
  assert.strictEqual(result.length, 0, 'Should return empty array');
});

// ============================================================================
// Chunk Part Extraction
// ============================================================================

section('Chunk Part Extraction');

test('Extracts OpenAI-style reasoning and content', () => {
  const input = `
REASONING: This section should cover the basics
and provide clear examples for beginners.

CONTENT: Python decorators are functions that modify
the behavior of other functions...
  `;
  const result = extractChunkParts(input, false);
  assert(result.reasoning.includes('cover the basics'), 'Should extract reasoning');
  assert(result.content.includes('Python decorators'), 'Should extract content');
});

test('Handles missing REASONING marker', () => {
  const input = `
CONTENT: Just content without reasoning.
  `;
  const result = extractChunkParts(input, false);
  assert.strictEqual(result.reasoning, '', 'Should have empty reasoning');
  assert(result.content.includes('Just content'), 'Should extract content');
});

test('Handles missing CONTENT marker', () => {
  const input = `
REASONING: Only reasoning here.
  `;
  const result = extractChunkParts(input, false);
  assert(result.reasoning.includes('Only reasoning'), 'Should extract reasoning');
  // Falls back to full text when CONTENT marker is missing
  assert(result.content.length > 0, 'Should fall back to full text');
});

test('Handles Harmony-style with <analysis> and <final> tags', () => {
  const input = `
<analysis>This is my reasoning about the chunk</analysis>
<final>This is the final content for the user</final>
  `;
  const result = extractChunkParts(input, true);
  assert(result.reasoning.includes('reasoning about'), 'Should extract analysis');
  assert(result.content.includes('final content'), 'Should extract final');
});

test('Falls back to full text if no markers found', () => {
  const input = 'Plain text without markers';
  const result = extractChunkParts(input, false);
  assert(result.content.includes('Plain text'), 'Should use full text as content');
});

// ============================================================================
// Configuration
// ============================================================================

section('Configuration');

test('Loads default configuration', () => {
  const config = getChunkedConfig();
  assert.strictEqual(typeof config.enabled, 'boolean');
  assert(config.maxChunks > 0, 'Should have positive maxChunks');
  assert(config.tokensPerChunk > 0, 'Should have positive tokensPerChunk');
  assert(config.autoThreshold > 0, 'Should have positive autoThreshold');
});

test('Configuration has expected structure', () => {
  const config = getChunkedConfig();
  assert('enabled' in config);
  assert('maxChunks' in config);
  assert('tokensPerChunk' in config);
  assert('autoThreshold' in config);
  assert('autoOutline' in config);
  assert('outlineRetries' in config);
  assert('outlineTokens' in config);
  assert('reviewPerChunk' in config);
});

// ============================================================================
// Heuristic Detection
// ============================================================================

section('Heuristic Detection');

test('Triggers on "comprehensive" keyword', () => {
  const context = {
    question: 'Write a comprehensive guide to Python',
    expectedTokens: 1000,
  };
  const config = { ...getChunkedConfig(), enabled: true }; // Ensure enabled for test
  const result = shouldTriggerChunking(context, config);
  assert(result, 'Should trigger on "comprehensive"');
});

test('Triggers on "detailed explanation" keyword', () => {
  const context = {
    question: 'Provide a detailed explanation of async/await',
    expectedTokens: 1000,
  };
  const config = { ...getChunkedConfig(), enabled: true };
  const result = shouldTriggerChunking(context, config);
  assert(result, 'Should trigger on "detailed explanation"');
});

test('Triggers on "step by step" keyword', () => {
  const context = {
    question: 'Explain step by step how to set up Docker',
    expectedTokens: 1000,
  };
  const config = { ...getChunkedConfig(), enabled: true };
  const result = shouldTriggerChunking(context, config);
  assert(result, 'Should trigger on "step by step"');
});

test('Triggers on high token threshold', () => {
  const context = {
    question: 'Explain something',
    expectedTokens: 5000, // Above default threshold of 2048
  };
  const config = { ...getChunkedConfig(), enabled: true };
  const result = shouldTriggerChunking(context, config);
  assert(result, 'Should trigger on high expected tokens');
});

test('Does not trigger on short simple question', () => {
  const context = {
    question: 'What is Python?',
    expectedTokens: 500,
  };
  const config = getChunkedConfig();
  const result = shouldTriggerChunking(context, config);
  assert(!result, 'Should not trigger on simple question');
});

test('Does not trigger when disabled', () => {
  const context = {
    question: 'Write a comprehensive guide',
    expectedTokens: 5000,
  };
  const config = { ...getChunkedConfig(), enabled: false };
  const result = shouldTriggerChunking(context, config);
  assert(!result, 'Should not trigger when disabled');
});

// ============================================================================
// Token Estimation
// ============================================================================

section('Token Estimation');

test('Estimates tokens correctly for simple text', () => {
  const text = 'Hello world'; // ~3 tokens
  const estimate = estimateTokens(text);
  assert(estimate >= 2 && estimate <= 5, `Should estimate 2-5 tokens, got ${estimate}`);
});

test('Estimates tokens for longer text', () => {
  const text = 'a'.repeat(1000); // ~250 tokens
  const estimate = estimateTokens(text);
  assert(estimate >= 200 && estimate <= 300, `Should estimate 200-300 tokens, got ${estimate}`);
});

test('Returns 0 for empty string', () => {
  const estimate = estimateTokens('');
  assert.strictEqual(estimate, 0, 'Should return 0 for empty string');
});

test('Returns 0 for null', () => {
  const estimate = estimateTokens(null);
  assert.strictEqual(estimate, 0, 'Should return 0 for null');
});

// ============================================================================
// Prompt Building
// ============================================================================

section('Prompt Building');

test('Builds Harmony outline prompt', () => {
  const prompt = buildHarmonyOutlinePrompt('Explain Python decorators', 5);
  assert(Array.isArray(prompt), 'Should return array');
  assert(prompt.length > 0, 'Should have at least one message');
  assert(prompt[0].role === 'system' || prompt[0].role === 'user', 'Should have proper role');
  assert(prompt.some(m => m.content.includes('Python decorators')), 'Should include question');
});

test('Builds OpenAI outline prompt', () => {
  const prompt = buildOpenAIOutlinePrompt('Explain async/await', 4);
  assert(Array.isArray(prompt), 'Should return array');
  assert(prompt.some(m => m.content.includes('async/await')), 'Should include question');
});

test('Builds Harmony chunk prompt with context', () => {
  const prompt = buildHarmonyChunkPrompt(
    'Explain decorators',
    'Introduction',
    0,
    3,
    'Previously we covered...',
    ['Introduction', 'Syntax', 'Examples']
  );
  assert(Array.isArray(prompt), 'Should return array');
  assert(prompt.some(m => m.content.includes('Introduction')), 'Should include chunk label');
  assert(prompt.some(m => m.content.includes('Previously')), 'Should include accumulated context');
});

test('Builds OpenAI chunk prompt', () => {
  const prompt = buildOpenAIChunkPrompt(
    'Explain decorators',
    'Syntax',
    1,
    3,
    '',
    ['Introduction', 'Syntax', 'Examples']
  );
  assert(Array.isArray(prompt), 'Should return array');
  assert(prompt.some(m => m.content.includes('Syntax')), 'Should include chunk label');
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

section('Edge Cases');

test('Handles very long outline', () => {
  const input = Array(20).fill(0).map((_, i) => `${i + 1}. Chunk ${i + 1}`).join('\n');
  const result = parseOutline(input);
  assert(result.length > 10, 'Should parse many chunks');
});

test('Handles outline with special characters', () => {
  const input = `
1. Introduction: Setup & Installation
2. Core: APIs, Classes & Methods
3. Advanced: Error-Handling (Try/Catch)
  `;
  const result = parseOutline(input);
  assert.strictEqual(result.length, 3);
  assert(result[0].includes('Setup'), 'Should preserve special chars');
});

test('Handles multiline chunk descriptions', () => {
  const input = `
Chunk 1: Introduction - This covers
  the basics and setup
Chunk 2: Advanced Topics
  `;
  const result = parseOutline(input);
  assert(result.length >= 1, 'Should parse at least one chunk');
});

test('Token estimation handles Unicode', () => {
  const text = '你好世界'; // Chinese characters
  const estimate = estimateTokens(text);
  assert(estimate > 0, 'Should estimate tokens for Unicode');
});

// ============================================================================
// Real-World Scenarios
// ============================================================================

section('Real-World Scenarios');

test('Parses realistic LLM outline response', () => {
  const input = `
I'll break down this comprehensive guide into the following sections:

Chunk 1: Introduction to Python Decorators - Covering what decorators are and why they're useful
Chunk 2: Basic Syntax and Examples - Simple decorator patterns with code examples
Chunk 3: Common Use Cases - Real-world applications like logging, timing, authentication
Chunk 4: Advanced Patterns - Decorators with arguments, class decorators, and stacking
Chunk 5: Best Practices and Pitfalls - Common mistakes and how to avoid them

Let's begin with the first chunk.
  `;
  const result = parseOutline(input);
  assert(result.length >= 4, `Should parse at least 4 chunks, got ${result.length}`);
  assert(result.some(c => c.includes('Introduction')), 'Should find Introduction');
  assert(result.some(c => c.includes('Advanced')), 'Should find Advanced section');
});

test('Extracts from realistic chunk response', () => {
  const input = `
REASONING: For the introduction, I should start with a clear definition
and explain the problem decorators solve. This helps readers understand
the motivation before diving into syntax.

CONTENT:
# Introduction to Python Decorators

Python decorators are a powerful feature that allows you to modify the behavior
of functions or classes. They provide a clean, readable way to add functionality
to existing code without modifying its structure.

## Why Use Decorators?

Decorators help with:
- Code reusability
- Separation of concerns
- Clean, maintainable syntax
  `;
  const result = extractChunkParts(input, false);
  assert(result.reasoning.includes('clear definition'), 'Should extract reasoning');
  assert(result.content.includes('powerful feature'), 'Should extract content');
  assert(result.content.includes('Code reusability'), 'Should preserve formatting');
});

test('Detects need for chunking on real prompts', () => {
  const prompts = [
    'Write a comprehensive tutorial on Docker container orchestration',
    'Explain in depth how neural networks work with mathematical foundations',
    'Provide a step by step guide to setting up a CI/CD pipeline',
    'Give me a thorough analysis of microservices architecture patterns',
  ];

  const config = { ...getChunkedConfig(), enabled: true };

  for (const question of prompts) {
    const context = { question, expectedTokens: 1500 };
    const result = shouldTriggerChunking(context, config);
    assert(result, `Should trigger chunking for: "${question.substring(0, 40)}..."`);
  }
});

test('Does not trigger chunking on simple questions', () => {
  const prompts = [
    'What is Docker?',
    'How do I install Python?',
    'List the benefits of TypeScript',
    'Define REST API',
  ];

  const config = { ...getChunkedConfig(), enabled: true };

  for (const question of prompts) {
    const context = { question, expectedTokens: 500 };
    const result = shouldTriggerChunking(context, config);
    assert(!result, `Should NOT trigger for: "${question}"`);
  }
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
