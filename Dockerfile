# Forgekeeper v3 - Minimal agent with Claude Code as brain
FROM node:20-slim

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source
COPY . .

# Create data directory
RUN mkdir -p /app/data/conversations /app/data/tasks /app/data/goals /app/data/learnings

# Environment
ENV NODE_ENV=production
ENV FK_DATA_DIR=/app/data
ENV FK_WORKING_DIR=/workspace

# Volume for persistent data and workspace
VOLUME ["/app/data", "/workspace"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('ok')" || exit 1

# Run the loop (Telegram runs as subprocess)
CMD ["node", "index.js"]
