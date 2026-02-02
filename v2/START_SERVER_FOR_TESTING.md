# Quick Start: Forgekeeper v2 Server

## Start the GraphQL Server

```bash
cd /mnt/d/Projects/forgekeeper/v2
npm start
```

**Expected Output**:
```
[INFO] Starting Forgekeeper v2...
[INFO] Registering 6 built-in tools...
[INFO] Tools initialized
[INFO] Apollo Server started
🚀 Server ready at http://localhost:4000/graphql
🔌 WebSocket ready at ws://localhost:4000/graphql
[INFO] Forgekeeper v2 ready
```

## Access Points

- **GraphQL Playground**: http://localhost:4000/graphql
- **Health Check**: http://localhost:4000/health
- **WebSocket**: ws://localhost:4000/graphql

## For Claude Chrome Plugin

Once you see "Server ready", you can access:
- http://localhost:4000/graphql

The testing instructions are in:
- `/mnt/d/Projects/forgekeeper/v2/TESTING_INSTRUCTIONS_FOR_CLAUDE_PLUGIN.md`

Write test results to:
- `D:\Projects\downloads\forgekeeper-v2-test-results.md`

## Stop Server

Press `Ctrl+C` in the terminal running the server.
