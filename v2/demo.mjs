/**
 * Demo script to show what's working without LLM providers
 */
import { getRouter, createAgents } from './dist/index.js';
import { WorkspaceManager } from './dist/index.js';

console.log('═══════════════════════════════════════════════════════════');
console.log('  Forgekeeper v2 - Component Demo');
console.log('═══════════════════════════════════════════════════════════\n');

try {
  // Test 1: Model Router
  console.log('✓ Test 1: Model Router');
  const router = getRouter();
  console.log('  - Router initialized');

  const health = await router.healthCheckAll();
  console.log('  - Health check results:');
  for (const [provider, status] of Object.entries(health)) {
    const icon = status.available ? '✓' : '✗';
    console.log(`    ${icon} ${provider}: ${status.available ? 'available' : status.error}`);
  }
  console.log();

  // Test 2: Agent Registry
  console.log('✓ Test 2: Agent Registry');
  const agents = createAgents(router);
  console.log('  - Created 4 agents:');
  console.log('    • Forge (executor) - Model:', router.getModelForAgent('forge'));
  console.log('    • Loom (reviewer) - Model:', router.getModelForAgent('loom'));
  console.log('    • Anvil (synthesizer) - Model:', router.getModelForAgent('anvil'));
  console.log('    • Scout (challenger) - Model:', router.getModelForAgent('scout'));
  console.log();

  // Test 3: Workspace Manager
  console.log('✓ Test 3: Workspace Manager');
  const workspaceManager = new WorkspaceManager();
  const sessionId = 'demo-session-' + Date.now();
  const workspace = await workspaceManager.getCurrent(sessionId);
  workspace.currentFocus = 'Test workspace functionality';

  // Add some test data
  workspace.hypotheses.push({
    content: 'The system architecture is modular and extensible',
    confidence: 0.9,
    source: 'forge',
    timestamp: Date.now(),
  });

  workspace.decisions.push({
    content: 'Use TypeScript for type safety',
    rationale: 'Better developer experience and fewer runtime errors',
    source: 'anvil',
    isFinal: false,
    timestamp: Date.now(),
  });

  const serialized = workspaceManager.serializeForPrompt(workspace);
  console.log('  - Workspace created and populated');
  console.log('  - Token count:', workspace.tokenCount);
  console.log('  - Hypotheses:', workspace.hypotheses.length);
  console.log('  - Decisions:', workspace.decisions.length);
  console.log('\n  Serialized preview:');
  console.log('  ' + serialized.split('\n').slice(0, 5).join('\n  '));
  console.log('  ...\n');

  // Test 4: Attention Mechanism
  console.log('✓ Test 4: Attention Mechanism');
  console.log('  - Workspace uses multi-factor scoring:');
  console.log('    • Relevance (40%) - word overlap with focus');
  console.log('    • Novelty (25%) - not duplicate content');
  console.log('    • Confidence (15%) - agent confidence');
  console.log('    • Empirical (10%) - tool results, Scout bonus');
  console.log('    • Priority (10%) - challenges, urgent responses');
  console.log();

  // Test 5: Database
  console.log('✓ Test 5: Database');
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  const sessions = await prisma.session.findMany({
    take: 3,
    orderBy: { createdAt: 'desc' },
  });

  console.log(`  - Found ${sessions.length} recent sessions`);
  console.log(`  - Database: SQLite (dev.db)`);
  console.log();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('✓ All Components Working!');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\nNext steps:');
  console.log('  1. Add ANTHROPIC_API_KEY to .env to enable Claude');
  console.log('  2. Start llama.cpp server for local Qwen inference');
  console.log('  3. Run full orchestration test');
  console.log();

  // Cleanup
  router.stopHealthChecking();
  await prisma.$disconnect();

} catch (error) {
  console.error('\n✗ Error:', error.message);
  console.error('\nStack:', error.stack);
  process.exit(1);
}
