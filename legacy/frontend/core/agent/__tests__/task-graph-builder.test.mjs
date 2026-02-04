/**
 * Unit Tests for TaskGraphBuilder
 *
 * Run with: node frontend/core/agent/__tests__/task-graph-builder.test.mjs
 */

import { createTaskGraphBuilder } from '../task-graph-builder.mjs';

console.log('Running TaskGraphBuilder tests...\n');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
    testsPassed++;
  } else {
    console.error(`✗ ${message}`);
    testsFailed++;
  }
}

function assertRange(actual, min, max, message) {
  if (actual >= min && actual <= max) {
    console.log(`✓ ${message} (value: ${actual})`);
    testsPassed++;
  } else {
    console.error(`✗ ${message}`);
    console.error(`  Expected: ${min} <= ${actual} <= ${max}`);
    testsFailed++;
  }
}

// Mock alternative generator
function createMockAlternativeGenerator(alternativesPerLevel = 3) {
  let callCount = 0;

  return {
    generateAlternatives: async (task, context) => {
      callCount++;

      // Generate mock alternatives
      const alternatives = [];
      for (let i = 0; i < alternativesPerLevel; i++) {
        alternatives.push({
          id: `alt-${callCount}-${i}`,
          name: `Alternative ${callCount}-${i}`,
          description: `Mock alternative ${i} for: ${task}`,
          confidence: 0.9 - (i * 0.1), // Decreasing confidence
          steps: [
            {
              tool: 'run_bash',
              args: { command: 'echo test' },
              description: `Step for alt ${i}`,
              expectedOutcome: 'Success',
            },
          ],
          prerequisites: [],
        });
      }

      return { alternatives };
    },
  };
}

// Test 1: Build single-level graph (depth=1)
console.log('Test 1: Build single-level graph (depth=1)');
await (async () => {
  const generator = createMockAlternativeGenerator(3);
  const builder = createTaskGraphBuilder(generator, { maxDepth: 1, maxBranches: 2 });

  const graph = await builder.buildGraph('Test task', { cwd: '/test' });

  assert(graph.graphId !== undefined, 'Should have graph ID');
  assert(graph.root !== undefined, 'Should have root node');
  assert(graph.paths !== undefined, 'Should have paths');
  assert(graph.stats !== undefined, 'Should have stats');
  assert(graph.stats.maxDepth === 1, 'Should respect maxDepth=1');
  assertRange(graph.paths.length, 1, 3, 'Should have 1-3 paths at depth 1');
})();
console.log('');

// Test 2: Build multi-level graph (depth=2)
console.log('Test 2: Build multi-level graph (depth=2)');
await (async () => {
  const generator = createMockAlternativeGenerator(2);
  const builder = createTaskGraphBuilder(generator, { maxDepth: 2, maxBranches: 2 });

  const graph = await builder.buildGraph('Test task', { cwd: '/test' });

  assert(graph.stats.maxDepth === 2, 'Should respect maxDepth=2');
  assertRange(graph.paths.length, 1, 10, 'Should have multiple paths at depth 2');

  // Check path depth
  const maxPathDepth = Math.max(...graph.paths.map(p => p.depth));
  assertRange(maxPathDepth, 1, 2, 'Max path depth should be 1-2');
})();
console.log('');

// Test 3: Prune low-confidence alternatives
console.log('Test 3: Prune low-confidence alternatives');
await (async () => {
  // Generator that produces one high-confidence and one low-confidence alternative
  const generator = {
    generateAlternatives: async (task, context) => ({
      alternatives: [
        {
          id: 'alt-high',
          name: 'High confidence',
          confidence: 0.9,
          steps: [{ tool: 'run_bash', args: {}, description: 'Step', expectedOutcome: 'Success' }],
        },
        {
          id: 'alt-low',
          name: 'Low confidence',
          confidence: 0.2,  // Below default threshold of 0.3
          steps: [{ tool: 'run_bash', args: {}, description: 'Step', expectedOutcome: 'Success' }],
        },
      ],
    }),
  };

  const builder = createTaskGraphBuilder(generator, { maxDepth: 1 });
  const graph = await builder.buildGraph('Test task', { cwd: '/test' });

  // Should only have paths from high-confidence alternative
  assert(graph.paths.length === 1, 'Should prune low-confidence alternative');
  assert(graph.paths[0].steps[0].id === 'alt-high', 'Should keep high-confidence alternative');
})();
console.log('');

// Test 4: Limit branches per level
console.log('Test 4: Limit branches per level');
await (async () => {
  const generator = createMockAlternativeGenerator(5); // Generate 5 alternatives
  const builder = createTaskGraphBuilder(generator, { maxDepth: 1, maxBranches: 2 }); // Keep only 2

  const graph = await builder.buildGraph('Test task', { cwd: '/test' });

  // Should only have 2 paths (top 2 alternatives)
  assertRange(graph.paths.length, 1, 2, 'Should limit branches to maxBranches');
})();
console.log('');

// Test 5: Extract all complete paths
console.log('Test 5: Extract all complete paths');
await (async () => {
  const generator = createMockAlternativeGenerator(2);
  const builder = createTaskGraphBuilder(generator, { maxDepth: 2, maxBranches: 2 });

  const graph = await builder.buildGraph('Test task', { cwd: '/test' });

  // Each path should have steps
  for (const path of graph.paths) {
    assert(path.id !== undefined, 'Path should have ID');
    assert(path.steps !== undefined, 'Path should have steps');
    assert(path.depth !== undefined, 'Path should have depth');
    assert(path.steps.length > 0, 'Path should have at least one step');
    assert(path.depth === path.steps.length, 'Path depth should equal steps length');
  }
})();
console.log('');

// Test 6: Prune total paths to maxPaths
console.log('Test 6: Prune total paths to maxPaths');
await (async () => {
  const generator = createMockAlternativeGenerator(3);
  const builder = createTaskGraphBuilder(generator, { maxDepth: 2, maxBranches: 3, maxPaths: 5 });

  const graph = await builder.buildGraph('Test task', { cwd: '/test' });

  // Should limit to maxPaths
  assertRange(graph.paths.length, 1, 5, 'Should prune to maxPaths');
  assert(graph.stats.totalPaths >= graph.paths.length, 'Should track unpruned path count');
})();
console.log('');

// Test 7: Graph structure
console.log('Test 7: Graph structure');
await (async () => {
  const generator = createMockAlternativeGenerator(2);
  const builder = createTaskGraphBuilder(generator, { maxDepth: 2, maxBranches: 2 });

  const graph = await builder.buildGraph('Test task', { cwd: '/test' });

  assert(graph.root.id === 'root', 'Root should have id="root"');
  assert(graph.root.depth === 0, 'Root should have depth=0');
  assert(graph.root.task === 'Test task', 'Root should have task');
  assert(graph.root.children !== undefined, 'Root should have children');
  assert(graph.root.alternatives !== undefined, 'Root should have alternatives');
})();
console.log('');

// Test 8: Path confidence ordering
console.log('Test 8: Path confidence ordering');
await (async () => {
  const generator = createMockAlternativeGenerator(3);
  const builder = createTaskGraphBuilder(generator, { maxDepth: 2, maxBranches: 3, maxPaths: 5 });

  const graph = await builder.buildGraph('Test task', { cwd: '/test' });

  // Paths should be sorted by depth (primary) and confidence (secondary)
  if (graph.paths.length > 1) {
    // Check that longer paths come first (or equal length)
    for (let i = 1; i < graph.paths.length; i++) {
      const prev = graph.paths[i - 1];
      const curr = graph.paths[i];
      assert(prev.depth >= curr.depth, 'Paths should be sorted by depth (descending)');
    }
  }
})();
console.log('');

// Test 9: Derive next task (single-step)
console.log('Test 9: Derive next task (single-step)');
await (async () => {
  const generator = {
    generateAlternatives: async (task, context) => ({
      alternatives: [
        {
          id: 'alt-1',
          name: 'Single step',
          confidence: 0.9,
          steps: [
            {
              tool: 'run_bash',
              args: { command: 'echo test' },
              description: 'Run command',
              expectedOutcome: 'Command executed',
            },
          ],
        },
      ],
    }),
  };

  const builder = createTaskGraphBuilder(generator, { maxDepth: 2 });
  const graph = await builder.buildGraph('Test task', { cwd: '/test' });

  // Check that child nodes have derived next tasks
  if (graph.root.children.length > 0) {
    const child = graph.root.children[0];
    assert(child.task !== undefined, 'Child should have next task');
    assert(child.task.includes('Verify') || child.task.includes('Continue'), 'Next task should mention verify/continue');
  }
})();
console.log('');

// Test 10: Handle generator failure gracefully
console.log('Test 10: Handle generator failure gracefully');
await (async () => {
  const brokenGenerator = {
    generateAlternatives: async (task, context) => {
      throw new Error('Generator failed');
    },
  };

  const builder = createTaskGraphBuilder(brokenGenerator, { maxDepth: 1 });
  const graph = await builder.buildGraph('Test task', { cwd: '/test' });

  // Should not crash, should have empty paths
  assert(graph.paths !== undefined, 'Should return graph even if generator fails');
  assert(graph.paths.length === 0, 'Should have no paths if generator fails');
})();
console.log('');

// Test 11: Empty alternatives
console.log('Test 11: Empty alternatives');
await (async () => {
  const emptyGenerator = {
    generateAlternatives: async (task, context) => ({
      alternatives: [],
    }),
  };

  const builder = createTaskGraphBuilder(emptyGenerator, { maxDepth: 1 });
  const graph = await builder.buildGraph('Test task', { cwd: '/test' });

  assert(graph.paths.length === 0, 'Should have no paths if no alternatives generated');
})();
console.log('');

// Test 12: Stats tracking
console.log('Test 12: Stats tracking');
await (async () => {
  const generator = createMockAlternativeGenerator(2);
  const builder = createTaskGraphBuilder(generator, { maxDepth: 2, maxBranches: 2, maxPaths: 3 });

  const graph = await builder.buildGraph('Test task', { cwd: '/test' });

  assert(graph.stats.totalPaths !== undefined, 'Should track total paths');
  assert(graph.stats.prunedPaths !== undefined, 'Should track pruned paths');
  assert(graph.stats.maxDepth !== undefined, 'Should track max depth');
  assert(graph.stats.elapsedMs !== undefined, 'Should track elapsed time');
  assert(graph.stats.elapsedMs >= 0, 'Elapsed time should be non-negative');
})();
console.log('');

// Test 13: Custom pruning threshold
console.log('Test 13: Custom pruning threshold');
await (async () => {
  const generator = {
    generateAlternatives: async (task, context) => ({
      alternatives: [
        { id: 'alt-1', name: 'Alt 1', confidence: 0.8, steps: [{ tool: 'run_bash', args: {}, expectedOutcome: 'Success' }] },
        { id: 'alt-2', name: 'Alt 2', confidence: 0.5, steps: [{ tool: 'run_bash', args: {}, expectedOutcome: 'Success' }] },
        { id: 'alt-3', name: 'Alt 3', confidence: 0.3, steps: [{ tool: 'run_bash', args: {}, expectedOutcome: 'Success' }] },
      ],
    }),
  };

  const builder = createTaskGraphBuilder(generator, {
    maxDepth: 1,
    pruneThreshold: { minConfidence: 0.6 }, // Only keep confidence >= 0.6
  });
  const graph = await builder.buildGraph('Test task', { cwd: '/test' });

  // Should only have 1 path (alt-1 with confidence 0.8)
  assert(graph.paths.length === 1, 'Should prune alternatives below custom threshold');
  assert(graph.paths[0].steps[0].id === 'alt-1', 'Should keep only high-confidence alternative');
})();
console.log('');

// Test 14: Multi-step alternatives
console.log('Test 14: Multi-step alternatives');
await (async () => {
  const generator = {
    generateAlternatives: async (task, context) => ({
      alternatives: [
        {
          id: 'alt-multi',
          name: 'Multi-step',
          confidence: 0.9,
          steps: [
            { tool: 'run_bash', args: {}, description: 'Step 1', expectedOutcome: 'Success 1' },
            { tool: 'run_bash', args: {}, description: 'Step 2', expectedOutcome: 'Success 2' },
          ],
        },
      ],
    }),
  };

  const builder = createTaskGraphBuilder(generator, { maxDepth: 2 });
  const graph = await builder.buildGraph('Test task', { cwd: '/test' });

  // Check that next task mentions "remaining steps"
  if (graph.root.children.length > 0) {
    const child = graph.root.children[0];
    assert(
      child.task.includes('remaining') || child.task.includes('Complete'),
      'Next task should mention remaining steps for multi-step alternative'
    );
  }
})();
console.log('');

// Test 15: Deep graph (depth=3)
console.log('Test 15: Deep graph (depth=3)');
await (async () => {
  const generator = createMockAlternativeGenerator(2);
  const builder = createTaskGraphBuilder(generator, { maxDepth: 3, maxBranches: 2, maxPaths: 10 });

  const graph = await builder.buildGraph('Test task', { cwd: '/test' });

  assert(graph.stats.maxDepth === 3, 'Should respect maxDepth=3');

  // Check that some paths reach depth 3
  const deepPaths = graph.paths.filter(p => p.depth === 3);
  assert(deepPaths.length > 0, 'Should have at least one path at depth 3');
})();
console.log('');

// Summary
console.log('='.repeat(60));
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);
console.log('='.repeat(60));

if (testsFailed > 0) {
  process.exit(1);
}

console.log('\n✓ All TaskGraphBuilder tests passed!\n');
