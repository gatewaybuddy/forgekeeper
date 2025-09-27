# syntax=docker/dockerfile:1

FROM node:20-bullseye AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npm run build

FROM node:20-bullseye AS runner
WORKDIR /app
ARG BACKEND_PORT=4000
ENV BACKEND_PORT=${BACKEND_PORT}
ENV NODE_ENV=production
ENV PRISMA_CLIENT_ENGINE_TYPE=binary
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    ca-certificates openssl curl \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
# Generate Prisma Client at runtime image stage (npx fetches CLI transiently)
RUN npx prisma generate
EXPOSE ${BACKEND_PORT}
CMD ["sh", "-c", "export PORT=\"${BACKEND_PORT:-4000}\" && exec npm start"]
