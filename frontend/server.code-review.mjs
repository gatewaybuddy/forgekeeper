/**
 * Code Review API Endpoints
 *
 * Express routes for code review functionality
 * (Separate from self-review orchestration in server.review.mjs)
 */

import express from 'express';
import { createReviewService } from './core/evaluation/reviewer.mjs';
import { ulid } from 'ulid';

export const codeReviewRouter = express.Router();

/**
 * Initialize review service
 * (Assumes llmClient is passed via app.locals or similar)
 */
function getReviewService(app) {
  if (!app.locals.codeReviewService) {
    app.locals.codeReviewService = createReviewService({
      llmClient: app.locals.llmClient,
      model: process.env.FRONTEND_REVIEW_MODEL || process.env.FRONTEND_VLLM_MODEL || 'core',
    });
  }
  return app.locals.codeReviewService;
}

/**
 * POST /api/code-review
 *
 * Review code changes
 *
 * Body:
 * {
 *   "changes": [{ file_path, diff, language?, content? }],
 *   "criteria": ["security", "correctness", ...],
 *   "conv_id": "conversation-id",
 *   "turn_id": 1
 * }
 *
 * Response:
 * {
 *   "review": { overall_assessment, overall_explanation, findings },
 *   "conv_id": "conversation-id",
 *   "turn_id": 1,
 *   "stats": { total, by_severity, by_category }
 * }
 */
codeReviewRouter.post('/api/code-review', async (req, res) => {
  try {
    const { changes, criteria = [], conv_id, turn_id } = req.body;

    // Validate request
    if (!changes || !Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'changes array is required and must not be empty'
      });
    }

    // Validate each change
    for (const change of changes) {
      if (!change.file_path || !change.diff) {
        return res.status(400).json({
          error: 'Invalid change',
          message: 'Each change must have file_path and diff'
        });
      }
    }

    const convId = conv_id || ulid();
    const turnId = turn_id || 0;

    const context = {
      convId,
      turnId,
    };

    // Get review service
    const reviewService = getReviewService(req.app);

    // Perform review
    const review = await reviewService.reviewChanges(changes, criteria, context);

    // Get statistics
    const stats = reviewService.getStats(review);

    res.json({
      review,
      conv_id: convId,
      turn_id: turnId,
      stats,
    });

  } catch (error) {
    console.error('Code review error:', error);
    res.status(500).json({
      error: 'Review failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/code-review/file
 *
 * Review a single file
 *
 * Body:
 * {
 *   "file_path": "src/app.js",
 *   "content": "file content...",
 *   "criteria": ["security", "correctness"],
 *   "conv_id": "conversation-id",
 *   "turn_id": 1
 * }
 *
 * Response: Same as /api/code-review
 */
codeReviewRouter.post('/api/code-review/file', async (req, res) => {
  try {
    const { file_path, content, criteria = [], conv_id, turn_id } = req.body;

    if (!file_path || !content) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'file_path and content are required'
      });
    }

    const convId = conv_id || ulid();
    const turnId = turn_id || 0;

    const context = {
      convId,
      turnId,
    };

    const reviewService = getReviewService(req.app);

    const review = await reviewService.reviewFile(
      file_path,
      content,
      criteria,
      context
    );

    const stats = reviewService.getStats(review);

    res.json({
      review,
      conv_id: convId,
      turn_id: turnId,
      stats,
    });

  } catch (error) {
    console.error('File review error:', error);
    res.status(500).json({
      error: 'Review failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/code-review/diff
 *
 * Review diff between two versions
 *
 * Body:
 * {
 *   "file_path": "src/app.js",
 *   "old_content": "original content...",
 *   "new_content": "modified content...",
 *   "criteria": ["security", "correctness"],
 *   "conv_id": "conversation-id",
 *   "turn_id": 1
 * }
 *
 * Response: Same as /api/code-review
 */
codeReviewRouter.post('/api/code-review/diff', async (req, res) => {
  try {
    const {
      file_path,
      old_content,
      new_content,
      criteria = [],
      conv_id,
      turn_id
    } = req.body;

    if (!file_path || !old_content || !new_content) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'file_path, old_content, and new_content are required'
      });
    }

    const convId = conv_id || ulid();
    const turnId = turn_id || 0;

    const context = {
      convId,
      turnId,
    };

    const reviewService = getReviewService(req.app);

    const review = await reviewService.reviewDiff(
      file_path,
      old_content,
      new_content,
      criteria,
      context
    );

    const stats = reviewService.getStats(review);

    res.json({
      review,
      conv_id: convId,
      turn_id: turnId,
      stats,
    });

  } catch (error) {
    console.error('Diff review error:', error);
    res.status(500).json({
      error: 'Review failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/code-review/criteria
 *
 * Get available review criteria
 *
 * Response:
 * {
 *   "criteria": [
 *     {
 *       "id": "security",
 *       "name": "Security",
 *       "description": "Check for security vulnerabilities"
 *     },
 *     ...
 *   ]
 * }
 */
codeReviewRouter.get('/api/code-review/criteria', (req, res) => {
  const criteria = [
    {
      id: 'security',
      name: 'Security',
      description: 'Check for security vulnerabilities, input validation, injection risks'
    },
    {
      id: 'correctness',
      name: 'Correctness',
      description: 'Verify logic, error handling, edge cases'
    },
    {
      id: 'performance',
      name: 'Performance',
      description: 'Identify performance issues, resource leaks, inefficiencies'
    },
    {
      id: 'best_practice',
      name: 'Best Practices',
      description: 'Check adherence to language idioms and design patterns'
    },
    {
      id: 'style',
      name: 'Style & Readability',
      description: 'Review code formatting, naming, and maintainability'
    },
  ];

  res.json({ criteria });
});

/**
 * Integration with main app
 *
 * Usage in server.mjs:
 *
 * import { codeReviewRouter } from './server.code-review.mjs';
 * app.use(codeReviewRouter);
 */
