# Build stage
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN if [ -f package-lock.json ]; then npm ci; elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; elif [ -f pnpm-lock.yaml ]; then npm install -g pnpm && pnpm i --frozen-lockfile; else npm i; fi

COPY . .
# Build-time config for API base and model
ARG VITE_VLLM_API_BASE
ARG VITE_VLLM_MODEL
ENV VITE_VLLM_API_BASE=${VITE_VLLM_API_BASE}
ENV VITE_VLLM_MODEL=${VITE_VLLM_MODEL}

RUN npm run build

# Runtime stage
FROM node:20-alpine
WORKDIR /app

# Copy runtime server and install only production deps
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm i --omit=dev; fi

COPY --from=build /app/dist ./dist
# Copy server runtime files (tool orchestrator + registry + modular tools)
COPY --from=build /app/server.mjs ./server.mjs
COPY --from=build /app/server.orchestrator.mjs ./server.orchestrator.mjs
COPY --from=build /app/server.tools.mjs ./server.tools.mjs
COPY --from=build /app/tools ./tools

ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.mjs"]
