/**
 * Forgekeeper v2 - Main Entry Point
 * Hybrid Multi-Model Consciousness Architecture with GraphQL Gateway
 */
import { logger } from './utils/logger.js';
import { config } from './utils/config.js';
import { startServer } from './gateway/server.js';
import { initializeTools } from './tools/index.js';

async function main() {
  logger.info('Starting Forgekeeper v2...');
  logger.info({ config }, 'Configuration loaded');

  try {
    // Initialize tools
    initializeTools();

    // Start GraphQL server
    await startServer();

    logger.info('Forgekeeper v2 ready');
    logger.info(`💬 Chat Interface: http://localhost:${config.port}/`);
    logger.info(`GraphQL Playground: http://localhost:${config.port}/graphql`);
    logger.info(`WebSocket endpoint: ws://localhost:${config.port}/graphql`);
  } catch (error) {
    logger.error({ error }, 'Fatal error');
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error({ error }, 'Unhandled error');
    process.exit(1);
  });
}

export { main };

// Export all modules for library usage
export * from './inference/router.js';
export * from './agents/registry.js';
export * from './workspace/manager.js';
export * from './orchestrator/workflow.js';
export * from './metrics/consciousness.js';
export * from './metrics/scout-effectiveness.js';
export * from './metrics/dashboard.js';
export * from './gateway/server.js';
export * from './tools/index.js';
export { prisma } from './utils/prisma.js';
