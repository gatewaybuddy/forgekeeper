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
# Build-time config for API base and model
ARG VITE_VLLM_API_BASE
ARG VITE_VLLM_MODEL
ENV VITE_VLLM_API_BASE=${VITE_VLLM_API_BASE}
ENV VITE_VLLM_MODEL=${VITE_VLLM_MODEL}

RUN npm run build

# Prepare production node_modules to avoid reinstall in runtime stage
RUN npm prune --omit=dev && mkdir -p /app/prod && cp -R node_modules /app/prod/node_modules

# Runtime stage
FROM node:20-slim
WORKDIR /app

# Install PowerShell (pwsh) for run_powershell tool support
RUN apt-get update \
    && apt-get install -y --no-install-recommends wget gpg ca-certificates \
    && wget -q https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb \
    && dpkg -i packages-microsoft-prod.deb \
    && rm -f packages-microsoft-prod.deb \
    && apt-get update \
    && apt-get install -y --no-install-recommends powershell git bash \
    && rm -rf /var/lib/apt/lists/*

# Copy runtime server and production deps from build stage
COPY package.json ./
COPY --from=build /app/prod/node_modules ./node_modules

COPY --from=build /app/dist ./dist
# Copy server runtime files (tool orchestrator + registry + modular tools)
COPY --from=build /app/server.mjs ./server.mjs
COPY --from=build /app/server.orchestrator.mjs ./server.orchestrator.mjs
COPY --from=build /app/server.harmony.mjs ./server.harmony.mjs
COPY --from=build /app/server.tools.mjs ./server.tools.mjs
COPY --from=build /app/tools ./tools

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.mjs"]
