# Forgekeeper Frontend (React + Vite)

This is the React UI for Forgekeeper. It speaks exclusively to the GraphQL service and reflects conversation state and logs stored by the backend.

## Prerequisites
- Node 18+
- The GraphQL service running locally (default `http://localhost:4000/graphql`). See the root `README.md` for setup.

## Install

Run installs from the repository root:

```bash
npm install --prefix frontend
```

## Configure

The frontend uses `VITE_GRAPHQL_URL` to find the API. When not set, it defaults to `http://localhost:4000/graphql`.

Create `frontend/.env.local` if you need a custom URL:

```
VITE_GRAPHQL_URL=http://localhost:4000/graphql
```

## Develop

```bash
npm run dev --prefix frontend
```

Open the printed local URL. The app requires the GraphQL service and the Python agent to be running if you want to generate responses.

## Build

```bash
npm run build --prefix frontend
```

## Lint

```bash
npm run lint --prefix frontend
```

## Notes
- The UI is intentionally minimal and focuses on conversations, task activity, and logs.
- For first-time users, prefer the guided installer described in the root `README.md` to bring up the full stack (GraphQL, Python agent, frontend).
