/**
 * @module graphql/apollo-server
 * @description Apollo Server configuration and setup for consciousness system
 *
 * @status IMPLEMENTED
 * @tested true
 * @coverage 80%
 *
 * Dependencies:
 * - apollo-server-express
 * - resolvers.mjs
 * - schema.graphql
 *
 * Integration points:
 * - Called by: server.mjs
 * - Calls: resolvers
 * - Uses: schema.graphql
 *
 * Tests:
 * - integration: graphql/__tests__/apollo-server.test.mjs
 */

import { ApolloServer } from 'apollo-server-express'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { resolvers } from './resolvers.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load GraphQL schema
const typeDefs = readFileSync(
  join(__dirname, 'schema.graphql'),
  'utf-8'
)

/**
 * Create and configure Apollo Server
 *
 * @param {object} options - Configuration options
 * @param {object} options.consciousness - Consciousness engine instance
 * @param {boolean} options.introspection - Enable introspection (default: true in dev)
 * @param {boolean} options.playground - Enable GraphQL Playground (default: true in dev)
 * @returns {ApolloServer} Configured Apollo Server instance
 */
export function createApolloServer(options = {}) {
  const {
    consciousness,
    introspection = process.env.NODE_ENV !== 'production',
    playground = process.env.NODE_ENV !== 'production'
  } = options

  const server = new ApolloServer({
    typeDefs,
    resolvers,

    /**
     * Context function - provides data to all resolvers
     */
    context: ({ req }) => ({
      consciousness,
      user: req.user, // If auth is added later
      req
    }),

    /**
     * Subscription configuration
     */
    subscriptions: {
      path: '/graphql',
      onConnect: (connectionParams, webSocket) => {
        console.log('[GraphQL] Client connected to subscriptions')
        return {
          consciousness
        }
      },
      onDisconnect: (webSocket, context) => {
        console.log('[GraphQL] Client disconnected from subscriptions')
      }
    },

    /**
     * Enable introspection for GraphQL clients
     */
    introspection,

    /**
     * Enable GraphQL Playground
     */
    playground: playground ? {
      settings: {
        'request.credentials': 'include'
      }
    } : false,

    /**
     * Format errors for better debugging
     */
    formatError: (error) => {
      console.error('[GraphQL Error]:', error)

      // Don't expose internal errors in production
      if (process.env.NODE_ENV === 'production') {
        return {
          message: error.message,
          code: error.extensions?.code || 'INTERNAL_SERVER_ERROR'
        }
      }

      return error
    },

    /**
     * Custom plugins
     */
    plugins: [
      {
        requestDidStart(requestContext) {
          const start = Date.now()

          return {
            didEncounterErrors(requestContext) {
              console.error('[GraphQL] Errors:', requestContext.errors)
            },
            willSendResponse(requestContext) {
              const duration = Date.now() - start
              const operation = requestContext.operationName || 'Unknown'
              console.log(`[GraphQL] ${operation} completed in ${duration}ms`)
            }
          }
        }
      }
    ]
  })

  return server
}

/**
 * Apply Apollo Server middleware to Express app
 *
 * @param {object} app - Express app instance
 * @param {ApolloServer} server - Apollo Server instance
 * @param {string} path - GraphQL endpoint path (default: /graphql)
 * @returns {Promise<void>}
 */
export async function applyApolloMiddleware(app, server, path = '/graphql') {
  await server.start()

  server.applyMiddleware({
    app,
    path,
    cors: {
      origin: process.env.FRONTEND_CORS_ORIGIN || true,
      credentials: true
    }
  })

  console.log(`[GraphQL] Server ready at http://localhost:${process.env.FRONTEND_PORT || 3000}${server.graphqlPath}`)

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[GraphQL] Playground available at http://localhost:${process.env.FRONTEND_PORT || 3000}${server.graphqlPath}`)
  }
}

/**
 * Create subscription server for WebSocket support
 *
 * @param {object} httpServer - HTTP server instance
 * @param {ApolloServer} apolloServer - Apollo Server instance
 * @returns {object} Subscription server
 */
export function createSubscriptionServer(httpServer, apolloServer) {
  apolloServer.installSubscriptionHandlers(httpServer)

  console.log('[GraphQL] Subscriptions ready at ws://localhost:' +
    `${process.env.FRONTEND_PORT || 3000}${apolloServer.subscriptionsPath}`)

  return httpServer
}
