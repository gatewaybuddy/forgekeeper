/**
 * @module server.consciousness
 * @description Consciousness system integration for Express server
 *
 * @status IMPLEMENTED
 * @integration Sprint 7
 *
 * Purpose:
 * - Initialize and manage consciousness system
 * - Wire GraphQL API into Express
 * - Provide health monitoring
 * - Enable graceful shutdown
 */

import { createServer } from 'http'
import { createConsciousnessOrchestrator } from '../../core/consciousness/consciousness-orchestrator.mjs'
import { createApolloServer, applyApolloMiddleware, createSubscriptionServer } from '../../graphql/apollo-server.mjs'

/**
 * Global consciousness instance
 */
let consciousnessInstance = null
let apolloServerInstance = null

/**
 * Initialize consciousness system
 *
 * @param {object} app - Express app
 * @param {object} options - Configuration
 * @param {boolean} options.autoStart - Auto-start consciousness (default: true)
 * @param {number} options.cycleInterval - Cycle interval in ms (default: 30000)
 * @param {number} options.dailyBudget - Daily API token budget (default: 1000000)
 * @returns {Promise<object>} Consciousness instance and Apollo server
 */
export async function initializeConsciousness(app, options = {}) {
  const {
    autoStart = process.env.CONSCIOUSNESS_AUTO_START !== '0',
    cycleInterval = parseInt(process.env.CONSCIOUSNESS_CYCLE_INTERVAL) || 30000,
    dailyBudget = parseInt(process.env.CONSCIOUSNESS_DAILY_API_BUDGET) || 1000000
  } = options

  try {
    console.log('[Consciousness] Initializing...')

    // Create consciousness orchestrator
    consciousnessInstance = await createConsciousnessOrchestrator({
      cycleInterval,
      dailyBudget,
      // Provider configuration
      deepProvider: process.env.CONSCIOUSNESS_DEEP_PROVIDER || 'anthropic',
      deepApiKey: process.env.CONSCIOUSNESS_DEEP_API_KEY,
      deepModel: process.env.CONSCIOUSNESS_DEEP_MODEL || 'claude-sonnet-4-5',
      // Paths
      stateDir: process.env.CONSCIOUSNESS_STATE_DIR || '.forgekeeper/consciousness',
      contextLogDir: process.env.FGK_CONTEXTLOG_DIR || '.forgekeeper/context_log'
    })

    console.log('[Consciousness] Orchestrator created')

    // Create Apollo GraphQL server
    apolloServerInstance = createApolloServer({
      consciousness: consciousnessInstance
    })

    // Apply Apollo middleware to Express
    await applyApolloMiddleware(app, apolloServerInstance, '/graphql')

    console.log('[Consciousness] GraphQL server ready')

    // Auto-start if enabled
    if (autoStart) {
      await consciousnessInstance.start()
      console.log('[Consciousness] Auto-started autonomous thinking')
    } else {
      console.log('[Consciousness] Ready (not auto-started - use /api/consciousness/start)')
    }

    // Add REST endpoints for control
    addConsciousnessEndpoints(app, consciousnessInstance)

    return {
      consciousness: consciousnessInstance,
      apolloServer: apolloServerInstance
    }
  } catch (error) {
    console.error('[Consciousness] Initialization failed:', error)
    throw error
  }
}

/**
 * Setup WebSocket subscriptions
 *
 * @param {object} httpServer - HTTP server instance
 * @returns {object} HTTP server with subscriptions
 */
export function setupConsciousnessSubscriptions(httpServer) {
  if (!apolloServerInstance) {
    console.warn('[Consciousness] Apollo server not initialized, skipping subscriptions')
    return httpServer
  }

  return createSubscriptionServer(httpServer, apolloServerInstance)
}

/**
 * Add REST endpoints for consciousness control
 *
 * @param {object} app - Express app
 * @param {object} consciousness - Consciousness instance
 */
function addConsciousnessEndpoints(app, consciousness) {
  // Health check
  app.get('/api/consciousness/health', async (req, res) => {
    try {
      const state = await consciousness.getState()
      const stats = await consciousness.getStats()

      const health = {
        status: state.state === 'stopped' ? 'stopped' : 'running',
        state: state.state,
        currentCycle: state.currentCycle,
        uptime: stats.consciousness.uptimeMs,
        successRate: stats.consciousness.successRate,
        lastCycleSuccess: stats.consciousness.lastCycleSuccess,
        problems: []
      }

      // Detect problems
      if (stats.consciousness.successRate < 50) {
        health.problems.push({
          type: 'high_error_rate',
          severity: 'critical',
          message: `Success rate: ${stats.consciousness.successRate.toFixed(1)}%`
        })
      }

      if (stats.budget.remainingTokens < stats.budget.dailyLimit * 0.1) {
        health.problems.push({
          type: 'low_budget',
          severity: 'warning',
          message: `Only ${stats.budget.remainingTokens} tokens remaining`
        })
      }

      const httpStatus = health.problems.some(p => p.severity === 'critical') ? 503 : 200

      res.status(httpStatus).json(health)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Start consciousness
  app.post('/api/consciousness/start', async (req, res) => {
    try {
      await consciousness.start()
      res.json({ success: true, message: 'Consciousness started' })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Stop consciousness
  app.post('/api/consciousness/stop', async (req, res) => {
    try {
      const reason = req.body?.reason || 'Manual stop via API'
      await consciousness.stop()
      res.json({ success: true, message: 'Consciousness stopped', reason })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Get current state
  app.get('/api/consciousness/state', async (req, res) => {
    try {
      const state = await consciousness.getState()
      res.json(state)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Get statistics
  app.get('/api/consciousness/stats', async (req, res) => {
    try {
      const stats = await consciousness.getStats()
      res.json(stats)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Trigger dream manually
  app.post('/api/consciousness/dream', async (req, res) => {
    try {
      const result = await consciousness.getComponent('dreamEngine').runDream(
        consciousness.getComponent('consciousnessEngine'),
        'manual'
      )
      res.json({ success: true, result })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  console.log('[Consciousness] REST endpoints registered:')
  console.log('  GET  /api/consciousness/health')
  console.log('  POST /api/consciousness/start')
  console.log('  POST /api/consciousness/stop')
  console.log('  GET  /api/consciousness/state')
  console.log('  GET  /api/consciousness/stats')
  console.log('  POST /api/consciousness/dream')
}

/**
 * Graceful shutdown
 *
 * @returns {Promise<void>}
 */
export async function shutdownConsciousness() {
  if (consciousnessInstance) {
    console.log('[Consciousness] Shutting down gracefully...')
    await consciousnessInstance.stop()
    console.log('[Consciousness] Stopped')
  }

  if (apolloServerInstance) {
    await apolloServerInstance.stop()
    console.log('[GraphQL] Server stopped')
  }
}

/**
 * Get consciousness instance (for external access)
 *
 * @returns {object|null} Consciousness instance
 */
export function getConsciousnessInstance() {
  return consciousnessInstance
}

/**
 * Check if consciousness is enabled
 *
 * @returns {boolean} True if enabled via environment variable
 */
export function isConsciousnessEnabled() {
  return process.env.CONSCIOUSNESS_ENABLED === '1'
}
