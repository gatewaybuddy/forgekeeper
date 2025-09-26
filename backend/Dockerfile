# syntax=docker/dockerfile:1

FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ARG BACKEND_PORT=4000
ENV BACKEND_PORT=${BACKEND_PORT}
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
EXPOSE ${BACKEND_PORT}
CMD ["sh", "-c", "export PORT=\"${BACKEND_PORT:-4000}\" && exec npm start"]
