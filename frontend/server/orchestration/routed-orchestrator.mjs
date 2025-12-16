/**
 * Routed Orchestrator
 *
 * Wrapper around standard orchestrator that adds intelligent routing.
 * Routes simple requests to local inference, complex to APIs.
 *
 * Usage:
 *   import { orchestrateWithRouting } from './routed-orchestrator.mjs';
 *   const result = await orchestrateWithRouting({ messages, model, ...options });
 *
 * Environment Variables:
 *   ENABLE_INTELLIGENT_ROUTING=1 - Enable routing (default: 0)
 *   ROUTING_DEFAULT_ROUTE=auto|local|api - Default route (default: auto)
 *   ROUTING_FORCE_API_MODELS=gpt-4,claude - Force API for these models
 *
 * @module server/orchestration/routed-orchestrator
 */

import { orchestrate } from './orchestrator.mjs';
import { routeRequest, recordRoutingDecision } from '../core/inference-router.mjs';
import { createLocalClient } from '../core/local-inference.mjs';
import { recordGlobalRequest, getGlobalTracker } from '../core/inference-cost-tracker.mjs';

/**
 * Get routing configuration
 */
function getRoutingConfig() {
  return {
    enabled: process.env.ENABLE_INTELLIGENT_ROUTING === '1',
    defaultRoute: process.env.ROUTING_DEFAULT_ROUTE || 'auto',
    forceApiModels: (process.env.ROUTING_FORCE_API_MODELS || '').split(',').filter(Boolean),
    localFallbackToApi: process.env.ROUTING_LOCAL_FALLBACK === '1', // Default: false
  };
}

/**
 * Orchestrate with intelligent routing
 *
 * @param {Object} params - Orchestration parameters
 * @param {Array<Object>} params.messages - Conversation messages
 * @param {string} params.model - Model name
 * @param {Object} [params.llmClient] - LLM client
 * @param {Array<Object>} [params.tools] - Tool definitions
 * @param {Object} [params.context] - Context
 * @param {Object} [options] - Additional options
 * @returns {Promise<Object>} Orchestration result
 */
export async function orchestrateWithRouting(params, options = {}) {
  const config = getRoutingConfig();

  // If routing disabled, use standard orchestrator
  if (!config.enabled) {
    return await orchestrate(params, options);
  }

  // Check if model is forced to API
  const modelName = params.model?.toLowerCase() || '';
  const forceApi = config.forceApiModels.some(m => modelName.includes(m.toLowerCase()));

  if (forceApi) {
    console.log(`[RoutedOrchestrator] Model ${params.model} forced to API`);
    await recordUsage('api', params.model, params.messages, { forced: true });
    return await orchestrate(params, options);
  }

  // Route the request
  const { route, decision } = await routeRequest(params.messages, {
    llmClient: params.llmClient,
    defaultRoute: config.defaultRoute,
    enableRouting: true,
  });

  // Record routing decision
  await recordRoutingDecision(decision);

  // Execute based on route
  if (route === 'local') {
    return await executeLocal(params, decision, options);
  } else {
    return await executeApi(params, decision, options);
  }
}

/**
 * Execute using local inference
 *
 * @param {Object} params - Parameters
 * @param {Object} decision - Routing decision
 * @param {Object} options - Options
 * @returns {Promise<Object>} Result
 */
async function executeLocal(params, decision, options) {
  const startTime = Date.now();
  const localClient = createLocalClient();

  try {
    console.log(`[RoutedOrchestrator] Routing to LOCAL (complexity: ${decision.complexity}, confidence: ${(decision.confidence * 100).toFixed(1)}%)`);

    // Check if local inference is available
    const available = await localClient.isAvailable();
    if (!available) {
      console.warn('[RoutedOrchestrator] Local inference not available, falling back to API');
      return await executeApi(params, decision, options);
    }

    // Execute locally
    const response = await localClient.chat({
      messages: params.messages,
      tools: params.tools,
      tool_choice: params.tool_choice,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
    });

    // Record usage
    await recordUsage('local', 'llama-local', params.messages, {
      complexity: decision.complexity,
      confidence: decision.confidence,
      success: true,
      elapsedMs: Date.now() - startTime,
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    });

    // Format response to match orchestrator format
    return {
      assistantMessage: {
        role: 'assistant',
        content: response.content,
        tool_calls: response.tool_calls,
      },
      debug: {
        route: 'local',
        complexity: decision.complexity,
        confidence: decision.confidence,
        elapsedMs: Date.now() - startTime,
      },
    };
  } catch (err) {
    console.error('[RoutedOrchestrator] Local execution failed:', err.message);

    // Record failure
    await recordUsage('local', 'llama-local', params.messages, {
      complexity: decision.complexity,
      confidence: decision.confidence,
      success: false,
      elapsedMs: Date.now() - startTime,
    });

    // Fallback to API if enabled
    const config = getRoutingConfig();
    if (config.localFallbackToApi) {
      console.log('[RoutedOrchestrator] Falling back to API');
      return await executeApi(params, decision, options);
    }

    throw err;
  }
}

/**
 * Execute using API
 *
 * @param {Object} params - Parameters
 * @param {Object} decision - Routing decision
 * @param {Object} options - Options
 * @returns {Promise<Object>} Result
 */
async function executeApi(params, decision, options) {
  const startTime = Date.now();

  console.log(`[RoutedOrchestrator] Routing to API (complexity: ${decision.complexity || 'unknown'})`);

  try {
    // Use standard orchestrator for API calls
    const result = await orchestrate(params, options);

    // Record usage
    await recordUsage('api', params.model, params.messages, {
      complexity: decision.complexity,
      confidence: decision.confidence,
      success: true,
      elapsedMs: Date.now() - startTime,
      inputTokens: result.debug?.usage?.prompt_tokens,
      outputTokens: result.debug?.usage?.completion_tokens,
    });

    // Add routing debug info
    if (result.debug) {
      result.debug.route = 'api';
      result.debug.complexity = decision.complexity;
      result.debug.routingConfidence = decision.confidence;
    }

    return result;
  } catch (err) {
    // Record failure
    await recordUsage('api', params.model, params.messages, {
      complexity: decision.complexity,
      confidence: decision.confidence,
      success: false,
      elapsedMs: Date.now() - startTime,
    });

    throw err;
  }
}

/**
 * Record usage for cost tracking
 *
 * @param {string} route - Route taken
 * @param {string} provider - Provider/model name
 * @param {Array} messages - Messages
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<void>}
 */
async function recordUsage(route, provider, messages, metadata) {
  await recordGlobalRequest({
    route,
    provider,
    complexity: metadata.complexity,
    confidence: metadata.confidence,
    success: metadata.success,
    elapsedMs: metadata.elapsedMs,
    inputTokens: metadata.inputTokens,
    outputTokens: metadata.outputTokens,
  });
}

/**
 * Get routing statistics
 *
 * @param {Object} [options] - Options
 * @returns {Promise<Object>} Statistics
 */
export async function getRoutingStatistics(options) {
  const tracker = getGlobalTracker();
  const stats = await tracker.getStats(options);
  const sessionStats = tracker.getSessionStats();

  return {
    session: sessionStats,
    historical: stats,
  };
}

/**
 * Test routing with a sample request
 *
 * @param {string} message - Test message
 * @returns {Promise<Object>} Test result
 */
export async function testRouting(message) {
  const messages = [{ role: 'user', content: message }];

  const { route, decision } = await routeRequest(messages, {
    enableRouting: true,
    defaultRoute: 'auto',
  });

  return {
    message,
    route,
    decision,
  };
}
