# Stage 1: Install all deps + build dashboard
FROM node:20-slim AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json ./
COPY packages/cli/package.json ./packages/cli/
COPY packages/server/package.json ./packages/server/
COPY packages/dashboard/package.json ./packages/dashboard/

RUN npm install

# Copy source and build dashboard
COPY packages/dashboard/ ./packages/dashboard/
RUN npm run build --workspace=packages/dashboard

# Copy server source (needed to verify structure, not for build)
COPY packages/server/ ./packages/server/

# Stage 2: Production image
FROM node:20-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Workspace root
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Server package
COPY --from=builder /app/packages/server/package.json ./packages/server/package.json
COPY --from=builder /app/packages/server/src ./packages/server/src
COPY --from=builder /app/packages/server/bin ./packages/server/bin

# Built dashboard (server serves this at /dashboard)
COPY --from=builder /app/packages/dashboard/dist ./packages/dashboard/dist

RUN mkdir -p /data

ENV NODE_ENV=production
ENV DATA_DIR=/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "packages/server/bin/server.js"]
