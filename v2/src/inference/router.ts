/**
 * Model router for intelligent task-based provider selection
 * Routes between local Qwen and Claude based on task type and availability
 */
import { LLMProvider, Message, CompletionOptions, CompletionResult, ProviderHealth } from './provider.js';
import { LocalQwenProvider } from './local-qwen.js';
import { ClaudeProvider } from './claude.js';
import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';

export type TaskType =
  | 'coding'
  | 'tool_execution'
  | 'planning'
  | 'reasoning'
  | 'review'
  | 'synthesis'
  | 'challenge'
  | 'general';

export interface RouteResult {
  result: CompletionResult;
  provider: string;
  taskType: TaskType;
}

interface ProviderStatus {
  health: ProviderHealth;
  lastCheck: number;
}

export class ModelRouter {
  private localQwen: LocalQwenProvider;
  private claude: ClaudeProvider | null = null;

  private providerStatus: Map<string, ProviderStatus> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.localQwen = new LocalQwenProvider();

    // Claude is optional - only create if API key is available
    try {
      this.claude = new ClaudeProvider();
      logger.info('Claude provider initialized');
    } catch (error) {
      logger.warn('Claude provider not available (API key missing)');
      this.claude = null;
    }

    // Start health check polling
    this.startHealthChecking();
  }

  /**
   * Route a completion request based on task type
   */
  async route(
    taskType: TaskType,
    messages: Message[],
    options?: CompletionOptions
  ): Promise<RouteResult> {
    const provider = this.selectProvider(taskType);
    const providerName = provider.name;

    logger.debug({ taskType, provider: providerName }, 'Routing task to provider');

    try {
      const result = await provider.complete(messages, options);

      return {
        result,
        provider: providerName,
        taskType,
      };
    } catch (error) {
      logger.error({ error, provider: providerName, taskType }, 'Provider completion failed');

      // Fallback to Claude if local fails
      if (providerName === 'local-qwen' && this.claude) {
        logger.info('Falling back to Claude due to local provider failure');
        const fallbackResult = await this.claude.complete(messages, {
          ...options,
          model: config.sonnetModel,
        });

        return {
          result: fallbackResult,
          provider: 'claude-fallback',
          taskType,
        };
      }

      throw error;
    }
  }

  /**
   * Get provider for specific agent
   */
  getProviderForAgent(agentName: string): LLMProvider {
    const localAvailable = this.isProviderAvailable('local-qwen');
    const claudeProvider = this.claude || this.localQwen; // Fallback to local if Claude unavailable

    switch (agentName) {
      case 'forge':
        // Forge: coding/tool execution → prefer local
        return localAvailable ? this.localQwen : claudeProvider;

      case 'loom':
        // Loom: review → Claude Sonnet (balanced quality/cost)
        return claudeProvider;

      case 'anvil':
        // Anvil: synthesis → Claude Opus (deep thinking)
        return claudeProvider;

      case 'scout':
        // Scout: challenge → Claude Sonnet (good judgment)
        return claudeProvider;

      default:
        return localAvailable ? this.localQwen : claudeProvider;
    }
  }

  /**
   * Get model name for agent
   */
  getModelForAgent(agentName: string): string {
    switch (agentName) {
      case 'forge':
        return this.isProviderAvailable('local-qwen')
          ? config.localQwenModel
          : config.sonnetModel;

      case 'loom':
        return config.sonnetModel;

      case 'anvil':
        return config.opusModel;

      case 'scout':
        return config.sonnetModel;

      default:
        return this.isProviderAvailable('local-qwen')
          ? config.localQwenModel
          : config.sonnetModel;
    }
  }

  /**
   * Get extended thinking option for agent
   */
  shouldUseExtendedThinking(agentName: string): boolean {
    // Only Anvil (synthesizer) uses extended thinking
    return agentName === 'anvil' && config.enableExtendedThinking;
  }

  /**
   * Select provider based on task type
   */
  private selectProvider(taskType: TaskType): LLMProvider {
    const localAvailable = this.isProviderAvailable('local-qwen');
    const claudeProvider = this.claude || this.localQwen;

    switch (taskType) {
      case 'coding':
      case 'tool_execution':
        // Fast, free local inference for coding
        return localAvailable && config.preferLocalInference ? this.localQwen : claudeProvider;

      case 'planning':
      case 'reasoning':
      case 'synthesis':
        // Deep thinking with Opus
        return claudeProvider;

      case 'review':
      case 'challenge':
        // Balanced quality/cost with Sonnet
        return claudeProvider;

      case 'general':
      default:
        // Prefer local if available
        return localAvailable && config.preferLocalInference ? this.localQwen : claudeProvider;
    }
  }

  /**
   * Check if provider is available
   */
  private isProviderAvailable(providerName: string): boolean {
    const status = this.providerStatus.get(providerName);

    if (!status) {
      return false; // Unknown status = unavailable
    }

    // Consider status stale after 60 seconds
    const now = Date.now();
    const isStale = now - status.lastCheck > 60_000;

    if (isStale) {
      return false;
    }

    return status.health.available;
  }

  /**
   * Get health status of all providers
   */
  async healthCheckAll(): Promise<Record<string, ProviderHealth>> {
    const checks: Promise<ProviderHealth>[] = [this.localQwen.healthCheck()];

    if (this.claude) {
      checks.push(this.claude.healthCheck());
    }

    const results = await Promise.all(checks);
    const now = Date.now();

    this.providerStatus.set('local-qwen', {
      health: results[0],
      lastCheck: now,
    });

    logger.debug(
      { localQwen: results[0], available: results[0].available },
      'Local Qwen health check'
    );

    const response: Record<string, ProviderHealth> = {
      'local-qwen': results[0],
    };

    if (this.claude && results[1]) {
      this.providerStatus.set('claude', {
        health: results[1],
        lastCheck: now,
      });
      response.claude = results[1];
      logger.debug({ claude: results[1], available: results[1].available }, 'Claude health check');
    }

    return response;
  }

  /**
   * Start periodic health checking
   */
  private startHealthChecking(): void {
    // Initial check (don't await in constructor, but log completion)
    this.healthCheckAll()
      .then(() => {
        logger.info('Initial health check completed');
      })
      .catch((error) => {
        logger.error({ error }, 'Initial health check failed');
      });

    // Poll every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.healthCheckAll().catch((error) => {
        logger.error({ error }, 'Health check failed');
      });
    }, 30_000);
  }

  /**
   * Wait for initial health check to complete
   * Call this before creating agents to ensure providers are available
   */
  async waitForHealthCheck(): Promise<void> {
    // Check if we have health status
    if (this.providerStatus.size > 0) {
      return; // Already checked
    }

    // Wait for first health check
    await this.healthCheckAll();
    logger.info('Health check ready for agent creation');
  }

  /**
   * Stop health checking (cleanup)
   */
  stopHealthChecking(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Get current provider status
   */
  getProviderStatus(): Record<string, ProviderHealth> {
    const result: Record<string, ProviderHealth> = {};

    for (const [name, status] of this.providerStatus.entries()) {
      result[name] = status.health;
    }

    return result;
  }
}

// Singleton instance
let routerInstance: ModelRouter | null = null;

export function getRouter(): ModelRouter {
  if (!routerInstance) {
    routerInstance = new ModelRouter();
  }
  return routerInstance;
}

/**
 * Get router and ensure health check is complete
 * Use this when creating agents to ensure providers are properly initialized
 */
export async function getRouterReady(): Promise<ModelRouter> {
  const router = getRouter();
  await router.waitForHealthCheck();
  return router;
}
