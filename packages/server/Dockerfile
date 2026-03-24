# Multi-stage build for claude-code-limiter server
# Runs the Express server with SQLite, serves dashboard on same port

# --- Stage 1: Install dependencies ---
FROM node:20-slim AS deps

WORKDIR /app

# Install build tools for better-sqlite3 native compilation
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# --- Stage 2: Production image ---
FROM node:20-slim

# Install curl for healthcheck + minimal runtime deps for better-sqlite3
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy node_modules (with compiled native modules) from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/
COPY bin/ ./bin/

# Create data directory for SQLite volume
RUN mkdir -p /data

# Create non-root user for security
RUN groupadd --system limiter && \
    useradd --system --gid limiter --home /app limiter && \
    chown -R limiter:limiter /app /data

# Environment
ENV NODE_ENV=production
ENV DATA_DIR=/data

EXPOSE 3000

# SQLite database persisted via volume
VOLUME ["/data"]

# Healthcheck: verify the server responds
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Run as non-root
USER limiter

CMD ["node", "bin/server.js"]
