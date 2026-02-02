/**
 * GraphQL Subscription Resolvers
 */
import { PubSub } from 'graphql-subscriptions';
import { getDashboard } from '../../metrics/dashboard.js';
import { logger } from '../../utils/logger.js';

// PubSub instance for subscriptions
export const pubsub = new PubSub();

// Event names
export const WORKSPACE_UPDATED = 'WORKSPACE_UPDATED';
export const METRICS_UPDATED = 'METRICS_UPDATED';
export const CONSCIOUSNESS_STREAM = 'CONSCIOUSNESS_STREAM';

// Set up dashboard event listeners
const dashboard = getDashboard();

dashboard.on('metrics-updated', (data: { sessionId: string; metrics: any }) => {
  // Emit session-specific update
  pubsub.publish(`${METRICS_UPDATED}_${data.sessionId}`, {
    metricsUpdates: data.metrics,
  });

  // Emit to global consciousness stream
  pubsub.publish(CONSCIOUSNESS_STREAM, {
    consciousnessStream: data.metrics,
  });

  logger.debug({ sessionId: data.sessionId }, 'Metrics update published');
});

export const subscriptionResolvers = {
  Subscription: {
    /**
     * Subscribe to workspace updates for a specific session
     */
    workspaceUpdates: {
      subscribe: (_parent: any, args: { sessionId: string }) => {
        logger.info({ sessionId: args.sessionId }, 'Workspace updates subscription started');

        return pubsub.asyncIterator(`${WORKSPACE_UPDATED}_${args.sessionId}`);
      },
    },

    /**
     * Subscribe to metrics updates for a specific session
     */
    metricsUpdates: {
      subscribe: (_parent: any, args: { sessionId: string }) => {
        logger.info({ sessionId: args.sessionId }, 'Metrics updates subscription started');

        return pubsub.asyncIterator(`${METRICS_UPDATED}_${args.sessionId}`);
      },
    },

    /**
     * Subscribe to global consciousness stream (all sessions)
     */
    consciousnessStream: {
      subscribe: () => {
        logger.info('Consciousness stream subscription started');

        return pubsub.asyncIterator(CONSCIOUSNESS_STREAM);
      },
    },
  },
};

/**
 * Publish workspace update
 */
export function publishWorkspaceUpdate(sessionId: string, workspace: any): void {
  pubsub.publish(`${WORKSPACE_UPDATED}_${sessionId}`, {
    workspaceUpdates: workspace,
  });

  logger.debug({ sessionId }, 'Workspace update published');
}
