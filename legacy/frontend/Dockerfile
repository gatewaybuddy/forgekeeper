# Build stage
FROM node:20-slim AS build
WORKDIR /app

ENV npm_config_loglevel=warn \
    npm_config_audit=false \
    npm_config_fund=false \
    npm_config_progress=false \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_maxtimeout=60000 \
    npm_config_fetch_retry_mintimeout=2000 \
    npm_config_legacy_peer_deps=true

COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund || npm i --no-audit --no-fund; \
    elif [ -f yarn.lock ]; then yarn install --frozen-lockfile || yarn install; \
    elif [ -f pnpm-lock.yaml ]; then npm install -g pnpm && (pnpm i --frozen-lockfile || pnpm i); \
    else npm i --no-audit --no-fund; fi

COPY . .
# Note: API base and model are configured at runtime via /config.json
# No build-time env vars needed - React app uses relative URLs

RUN npm run build

# Prepare production node_modules to avoid reinstall in runtime stage
RUN npm prune --omit=dev && mkdir -p /app/prod && cp -R node_modules /app/prod/node_modules

# Runtime stage
FROM node:20-slim
WORKDIR /app

# Install PowerShell (pwsh) for run_powershell tool support
RUN apt-get update \
    && apt-get install -y --no-install-recommends wget gpg ca-certificates curl \
    && wget -q https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb \
    && dpkg -i packages-microsoft-prod.deb \
    && rm -f packages-microsoft-prod.deb \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends powershell git bash gh \
    && rm -rf /var/lib/apt/lists/*

# Copy runtime server and production deps from build stage
COPY package.json ./
COPY --from=build /app/prod/node_modules ./node_modules

COPY --from=build /app/dist ./dist
# Copy server runtime files (tool orchestrator + registry + modular tools)
# Copy all server-side .mjs modules to keep imports in sync
COPY --from=build /app/server*.mjs ./
COPY --from=build /app/tools ./tools
# Copy shared server-side core modules used by server.* imports
COPY --from=build /app/core ./core
# Copy GraphQL modules (for consciousness/apollo server)
COPY --from=build /app/graphql ./graphql
# Copy config directory (M2: review prompts and future configs)
COPY --from=build /app/config ./config
# Copy MCP integration modules
COPY --from=build /app/mcp ./mcp

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.mjs"]
