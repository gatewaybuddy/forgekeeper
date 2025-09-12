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

During development, Vite proxies `/graphql` to `http://localhost:4000`, so no extra config is required when running the backend locally. The app is served at `http://localhost:5173/`.

If you prefer an explicit URL, you may create `frontend/.env.local` and set:

```
VITE_GRAPHQL_URL=http://localhost:4000/graphql
```

## Develop

```bash
npm run dev --prefix frontend
```

Open the printed local URL. The app requires the GraphQL service and the Python agent to be running to generate responses.

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

## UX Notes (Planned Enhancements)
- Slash commands: typing `/` opens a small command palette under the input. Each command shows a description and, when applicable, the current value.
- Multiline input: Ctrl+Enter inserts a newline; Enter sends the message.
- Context counter: a running token count appears below the input showing current and remaining tokens for the configured model. Toggle with `/context`.
