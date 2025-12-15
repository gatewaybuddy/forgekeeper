/**
 * Enhanced Integration Patch for server.mjs
 *
 * This file exports middleware and routes to integrate into the main server.
 * Import and use these in server.mjs:
 *
 * import { setupEnhancedFeatures } from './server/core/enhanced-integration.mjs';
 * setupEnhancedFeatures(app);
 */

// Lazy imports to avoid errors if files don't exist
let codeReviewRouter = null;
let orchestrateWithToolsEnhanced = null;

/**
 * Check if enhanced orchestrator should be used
 */
function shouldUseEnhancedOrchestrator() {
  return process.env.FRONTEND_ENABLE_ENHANCED_ORCHESTRATOR === '1';
}

/**
 * Setup all enhanced features (Phase 1-3)
 */
export async function setupEnhancedFeatures(app) {
  console.log('[Enhanced Integration] Setting up Phase 1-3 features...');

  // Phase 2: Code Review Service (async)
  await setupCodeReview(app);

  // Phase 1 & 3: Enhanced orchestrator is automatically used when enabled
  setupEnhancedOrchestrator(app);

  // Add diagnostics endpoints
  setupDiagnosticsEndpoints(app);

  console.log('[Enhanced Integration] ✓ All phases initialized');
}

/**
 * Setup Code Review (Phase 2)
 */
async function setupCodeReview(app) {
  const reviewEnabled = process.env.FRONTEND_ENABLE_REVIEW === '1';

  if (!reviewEnabled) {
    console.log('[Code Review] Disabled (set FRONTEND_ENABLE_REVIEW=1 to enable)');
    return;
  }

  try {
    // Dynamically import code review module
    const reviewModule = await import('./server.code-review.mjs');
    codeReviewRouter = reviewModule.codeReviewRouter;

    // Initialize LLM client for review service
    const apiBase = process.env.FRONTEND_VLLM_API_BASE || 'http://localhost:8001/v1';

    app.locals.llmClient = {
      async chat(params) {
        const url = apiBase.replace(/\/$/, '') + '/chat/completions';
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });

        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          throw new Error(`LLM request failed: HTTP ${resp.status}: ${txt}`);
        }

        return await resp.json();
      },
    };

    // Mount code review router
    app.use(codeReviewRouter);

    console.log('[Code Review] ✓ Endpoints mounted:');
    console.log('  - POST /api/code-review');
    console.log('  - POST /api/code-review/file');
    console.log('  - POST /api/code-review/diff');
    console.log('  - GET /api/code-review/criteria');
  } catch (error) {
    console.log('[Code Review] ⚠ Failed to load:', error.message);
    console.log('[Code Review] Continuing without code review features');
  }
}

/**
 * Setup Enhanced Orchestrator (Phase 1 & 3)
 */
function setupEnhancedOrchestrator(app) {
  const shouldUse = shouldUseEnhancedOrchestrator();

  if (!shouldUse) {
    console.log('[Enhanced Orchestrator] Using legacy orchestrator');
    return;
  }

  console.log('[Enhanced Orchestrator] ✓ Enabled');
  console.log('  - Output Truncation:', process.env.TOOLS_MAX_OUTPUT_BYTES || '10240', 'bytes');
  console.log('  - Truncation Strategy:', process.env.TOOLS_TRUNCATION_STRATEGY || 'head-tail');
  console.log('  - History Compaction:', process.env.FRONTEND_ENABLE_AUTO_COMPACT === '1' ? 'enabled' : 'disabled');
  if (process.env.FRONTEND_ENABLE_AUTO_COMPACT === '1') {
    console.log('  - Compaction Threshold:', process.env.FRONTEND_MAX_HISTORY_TOKENS || '20000', 'tokens');
  }
}

/**
 * Setup Diagnostics Endpoints
 */
function setupDiagnosticsEndpoints(app) {
  /**
   * GET /api/enhanced/stats
   *
   * Get statistics about enhanced features
   */
  app.get('/api/enhanced/stats', (req, res) => {
    const stats = {
      phase1: {
        enabled: shouldUseEnhancedOrchestrator(),
        truncation: {
          maxBytes: parseInt(process.env.TOOLS_MAX_OUTPUT_BYTES) || 10240,
          maxLines: parseInt(process.env.TOOLS_MAX_OUTPUT_LINES) || 256,
          strategy: process.env.TOOLS_TRUNCATION_STRATEGY || 'head-tail',
        },
        events: {
          enabled: true,
          types: 20, // Number of event types
        },
      },
      phase2: {
        enabled: process.env.FRONTEND_ENABLE_REVIEW === '1',
        model: process.env.FRONTEND_REVIEW_MODEL || process.env.FRONTEND_VLLM_MODEL || 'core',
      },
      phase3: {
        enabled: process.env.FRONTEND_ENABLE_AUTO_COMPACT === '1',
        threshold: parseInt(process.env.FRONTEND_MAX_HISTORY_TOKENS) || 20000,
        recentKeep: parseInt(process.env.FRONTEND_RECENT_MESSAGES_KEEP) || 10,
      },
    };

    res.json(stats);
  });

  /**
   * GET /api/enhanced/health
   *
   * Health check for enhanced features
   */
  app.get('/api/enhanced/health', async (req, res) => {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      features: {
        orchestrator: 'ok',
        codeReview: process.env.FRONTEND_ENABLE_REVIEW === '1' ? 'ok' : 'disabled',
        compaction: process.env.FRONTEND_ENABLE_AUTO_COMPACT === '1' ? 'ok' : 'disabled',
      },
    };

    // Test code review if enabled
    if (process.env.FRONTEND_ENABLE_REVIEW === '1') {
      try {
        const reviewService = app.locals.codeReviewService;
        if (!reviewService) {
          health.features.codeReview = 'not_initialized';
        }
      } catch (error) {
        health.features.codeReview = 'error';
        health.status = 'degraded';
      }
    }

    res.json(health);
  });

  console.log('[Diagnostics] ✓ Endpoints mounted:');
  console.log('  - GET /api/enhanced/stats');
  console.log('  - GET /api/enhanced/health');
}

/**
 * Export enhanced orchestrator for use in main server
 */
export async function getEnhancedOrchestrator() {
  // Lazy load the enhanced orchestrator
  if (!orchestrateWithToolsEnhanced) {
    try {
      const module = await import('./server.orchestrator.enhanced.mjs');
      orchestrateWithToolsEnhanced = module.orchestrateWithToolsEnhanced;
    } catch (error) {
      console.error('[Enhanced Orchestrator] Failed to load:', error);
      return null;
    }
  }
  return orchestrateWithToolsEnhanced;
}
