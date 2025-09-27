# Forgekeeper Frontend (React + Vite)

This is the React UI for Forgekeeper. It speaks exclusively to the GraphQL service and reflects conversation state and logs stored by the backend.

## Prerequisites
- Node 18+
- The GraphQL service running locally (default `http://localhost:8000/graphql`). See the root `README.md` for setup.

## Install

Run installs from the repository root:

```bash
npm install --prefix frontend
```

## Configure

During development, Vite proxies `/graphql` to the backend URL provided via `VITE_BACKEND_URL` (falling back to `http://localhost:8000`). The app is served at `http://localhost:5173/`.

To override the backend URL, create `frontend/.env.local` (or export the variable in your shell) and set:

```
VITE_BACKEND_URL=http://localhost:8000
```

When running via Docker, the frontend container reads `FRONTEND_BACKEND_URL` at boot and writes `window.__APP_CONFIG__` so the static assets can reach the backend service on the compose network.

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
