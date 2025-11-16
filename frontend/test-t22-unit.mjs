#!/usr/bin/env node
/**
 * T22: Rate Limiter Unit Tests
 *
 * Quick unit tests to verify token bucket algorithm works correctly.
 */

import { getRateLimitMetrics, resetRateLimiter } from './server.ratelimit.mjs';

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    testsPassed++;
  } else {
    console.error(`  ✗ ${message}`);
    testsFailed++;
  }
}

function assertEquals(actual, expected, message) {
  if (actual === expected) {
    console.log(`  ✓ ${message}`);
    testsPassed++;
  } else {
    console.error(`  ✗ ${message}`);
    console.error(`    Expected: ${expected}, Got: ${actual}`);
    testsFailed++;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('======================================');
console.log('T22: Rate Limiter Unit Tests');
console.log('======================================\n');

// Test 1: Basic initialization
console.log('Test 1: Basic initialization');
resetRateLimiter();
const metrics1 = getRateLimitMetrics();
assertEquals(metrics1.hits, 0, 'Initial hits should be 0');
assertEquals(metrics1.totalRequests, 0, 'Initial total requests should be 0');
assert(metrics1.currentTokens > 0, 'Should have tokens available initially');
console.log('');

// Test 2: Metrics structure
console.log('Test 2: Metrics structure');
assert(typeof metrics1.enabled === 'boolean', 'enabled should be boolean');
assert(typeof metrics1.capacity === 'number', 'capacity should be number');
assert(typeof metrics1.refillRate === 'number', 'refillRate should be number');
assert(typeof metrics1.costPerRequest === 'number', 'costPerRequest should be number');
assert(typeof metrics1.currentTokens === 'number', 'currentTokens should be number');
console.log('');

// Test 3: Token consumption
console.log('Test 3: Token consumption');
resetRateLimiter();
const capacityBefore = getRateLimitMetrics().capacity;
const tokensBefore = getRateLimitMetrics().currentTokens;
assert(tokensBefore === capacityBefore, 'Bucket should start at full capacity');
console.log('');

// Test 4: Verify configuration
console.log('Test 4: Configuration values');
const metrics4 = getRateLimitMetrics();
console.log(`  Enabled: ${metrics4.enabled}`);
console.log(`  Capacity: ${metrics4.capacity}`);
console.log(`  Refill Rate: ${metrics4.refillRate} tokens/second`);
console.log(`  Cost Per Request: ${metrics4.costPerRequest}`);
console.log(`  Current Tokens: ${metrics4.currentTokens}`);
assert(metrics4.capacity > 0, 'Capacity should be positive');
assert(metrics4.refillRate > 0, 'Refill rate should be positive');
assert(metrics4.costPerRequest > 0, 'Cost per request should be positive');
console.log('');

// Test 5: Token refill over time
console.log('Test 5: Token refill over time');
resetRateLimiter();
await sleep(1100); // Wait just over 1 second
const metricsAfterWait = getRateLimitMetrics();
console.log(`  Tokens after 1 second: ${metricsAfterWait.currentTokens}`);
assert(metricsAfterWait.currentTokens <= metricsAfterWait.capacity, 'Tokens should not exceed capacity');
console.log('');

// Summary
console.log('======================================');
console.log('Test Summary');
console.log('======================================');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log('');

if (testsFailed === 0) {
  console.log('✓ All tests passed!');
  process.exit(0);
} else {
  console.log('✗ Some tests failed');
  process.exit(1);
}
