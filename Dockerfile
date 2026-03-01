# ─── Stage 1: Install dependencies ──────────────────────────────────────────
FROM node:22-slim AS deps

RUN corepack enable pnpm

WORKDIR /app

# Copy workspace config and all package.json files first (cache layer)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/athena-engine/package.json packages/athena-engine/
COPY packages/athena-server/package.json packages/athena-server/
COPY packages/client/package.json packages/client/
COPY shared/types/package.json shared/types/

# Install all dependencies (including native: bcrypt, better-sqlite3)
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build all packages ───────────────────────────────────────────
FROM deps AS build

# Copy source code
COPY shared/ shared/
COPY packages/ packages/

# Build all three Nuxt apps
RUN pnpm -r build

# ─── Stage 3: Production runtime ───────────────────────────────────────────
FROM node:22-slim AS runtime

# better-sqlite3 needs these at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built outputs
COPY --from=build /app/packages/athena-engine/.output packages/athena-engine/.output
COPY --from=build /app/packages/athena-server/.output packages/athena-server/.output
COPY --from=build /app/packages/client/.output packages/client/.output

# Default port (overridden per service)
ENV PORT=3000
EXPOSE 3000

# No default CMD — each service sets its own in docker-compose
CMD ["node", "packages/athena-server/.output/server/index.mjs"]
