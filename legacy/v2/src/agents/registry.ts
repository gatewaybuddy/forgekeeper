/**
 * Agent registry and factory
 * Creates and manages agent instances
 */
import { BaseAgent } from './base.js';
import { ForgeAgent } from './forge.js';
import { LoomAgent } from './loom.js';
import { AnvilAgent } from './anvil.js';
import { ScoutAgent } from './scout.js';
import { ModelRouter } from '../inference/router.js';
import { logger } from '../utils/logger.js';

export interface AgentRegistry {
  forge: ForgeAgent;
  loom: LoomAgent;
  anvil: AnvilAgent;
  scout: ScoutAgent;
}

/**
 * Create all agents with appropriate providers
 */
export function createAgents(router: ModelRouter): AgentRegistry {
  logger.info('Creating agent registry');

  const forge = new ForgeAgent(
    router.getProviderForAgent('forge'),
    router.getModelForAgent('forge')
  );

  const loom = new LoomAgent(
    router.getProviderForAgent('loom'),
    router.getModelForAgent('loom')
  );

  const anvil = new AnvilAgent(
    router.getProviderForAgent('anvil'),
    router.getModelForAgent('anvil'),
    router.shouldUseExtendedThinking('anvil'),
    10000 // thinking tokens
  );

  const scout = new ScoutAgent(
    router.getProviderForAgent('scout'),
    router.getModelForAgent('scout')
  );

  logger.info(
    {
      forge: { model: router.getModelForAgent('forge') },
      loom: { model: router.getModelForAgent('loom') },
      anvil: {
        model: router.getModelForAgent('anvil'),
        extendedThinking: router.shouldUseExtendedThinking('anvil'),
      },
      scout: { model: router.getModelForAgent('scout') },
    },
    'Agent registry created'
  );

  return { forge, loom, anvil, scout };
}

/**
 * Get agent by name
 */
export function getAgent(registry: AgentRegistry, name: string): BaseAgent | null {
  switch (name) {
    case 'forge':
      return registry.forge;
    case 'loom':
      return registry.loom;
    case 'anvil':
      return registry.anvil;
    case 'scout':
      return registry.scout;
    default:
      return null;
  }
}

/**
 * Get all agents as array
 */
export function getAllAgents(registry: AgentRegistry): BaseAgent[] {
  return [registry.forge, registry.loom, registry.anvil, registry.scout];
}

/**
 * Get agent status
 */
export async function getAgentStatus(registry: AgentRegistry) {
  const [forgeStatus, loomStatus, anvilStatus, scoutStatus] = await Promise.all([
    registry.forge.getStatus(),
    registry.loom.getStatus(),
    registry.anvil.getStatus(),
    registry.scout.getStatus(),
  ]);

  return {
    forge: forgeStatus,
    loom: loomStatus,
    anvil: anvilStatus,
    scout: scoutStatus,
  };
}
