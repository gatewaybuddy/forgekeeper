import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import typeDefs from './schema.js';
import resolvers from './resolvers.js';
import { PrismaClient } from '@prisma/client';
async function main() {
    const prisma = new PrismaClient();
    const server = new ApolloServer({ typeDefs, resolvers });
    await server.start();
    const app = express();
    app.use('/graphql', cors(), bodyParser.json(), expressMiddleware(server, {
        context: async () => ({ prisma }),
    }));
    app.get('/health', async (_req, res) => {
        const pending = await prisma.outbox.findMany({
            where: { sentAt: null },
            orderBy: { createdAt: 'asc' },
        });
        const oldest = pending[0];
        const lag = oldest ? Date.now() - oldest.createdAt.getTime() : 0;
        const retries = pending.filter((m) => m.retryCount > 0).length;
        const retryRate = pending.length ? retries / pending.length : 0;
        res.json({ lag, retryRate });
    });
    const port = process.env.PORT || 4000;
    app.listen(port, () => {
        console.log(`GraphQL service ready at http://localhost:${port}/graphql`);
    });
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
