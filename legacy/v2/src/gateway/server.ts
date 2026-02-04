/**
 * Apollo GraphQL Server
 * HTTP + WebSocket support for subscriptions
 */
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { typeDefs } from './schema.js';
import { resolvers } from './resolvers/index.js';
import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';

export interface ServerContext {
  // Can add user authentication, etc. here
}

export async function createApolloServer() {
  // Create Express app
  const app = express();

  // Create HTTP server
  const httpServer = createServer(app);

  // Create executable schema
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // Create WebSocket server for subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

  // Set up WebSocket handler
  const serverCleanup = useServer(
    {
      schema,
      onConnect: (_ctx) => {
        logger.info('WebSocket client connected');
        return true;
      },
      onDisconnect: () => {
        logger.info('WebSocket client disconnected');
      },
    },
    wsServer
  );

  // Create Apollo Server
  const apolloServer = new ApolloServer<ServerContext>({
    schema,
    plugins: [
      // Proper shutdown for HTTP server
      ApolloServerPluginDrainHttpServer({ httpServer }),
      // Proper shutdown for WebSocket server
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  // Start Apollo Server
  await apolloServer.start();

  logger.info('Apollo Server started');

  // Serve static files from public directory
  const publicPath = path.join(process.cwd(), 'public');
  app.use(express.static(publicPath));
  logger.info(`Serving static files from ${publicPath}`);

  // Apply middleware
  app.use(
    '/graphql',
    cors<cors.CorsRequest>({
      origin: '*', // Configure appropriately for production
      credentials: true,
    }),
    express.json(),
    expressMiddleware(apolloServer, {
      context: async () => ({}),
    })
  );

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return { app, httpServer, apolloServer };
}

export async function startServer() {
  const { httpServer } = await createApolloServer();

  const port = config.port;

  // Start HTTP server
  httpServer.listen(port, () => {
    logger.info(`🚀 Server ready at http://localhost:${port}/graphql`);
    logger.info(`🔌 WebSocket ready at ws://localhost:${port}/graphql`);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down gracefully...');
    httpServer.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Shutting down gracefully...');
    httpServer.close();
    process.exit(0);
  });

  return httpServer;
}
