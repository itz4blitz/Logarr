# Build stage
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY turbo.json tsconfig.json ./

# Copy all packages and apps
COPY packages/ ./packages/
COPY apps/backend/ ./apps/backend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build packages first, then backend
RUN pnpm --filter "@logarr/*" build
RUN pnpm --filter @logarr/backend build

# Production stage
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

ENV NODE_ENV=production

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY turbo.json ./

# Copy built packages - core
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/core/dist ./packages/core/dist

# Copy built packages - providers
COPY --from=builder /app/packages/provider-arr/package.json ./packages/provider-arr/
COPY --from=builder /app/packages/provider-arr/dist ./packages/provider-arr/dist
COPY --from=builder /app/packages/provider-jellyfin/package.json ./packages/provider-jellyfin/
COPY --from=builder /app/packages/provider-jellyfin/dist ./packages/provider-jellyfin/dist
COPY --from=builder /app/packages/provider-sonarr/package.json ./packages/provider-sonarr/
COPY --from=builder /app/packages/provider-sonarr/dist ./packages/provider-sonarr/dist
COPY --from=builder /app/packages/provider-radarr/package.json ./packages/provider-radarr/
COPY --from=builder /app/packages/provider-radarr/dist ./packages/provider-radarr/dist
COPY --from=builder /app/packages/provider-prowlarr/package.json ./packages/provider-prowlarr/
COPY --from=builder /app/packages/provider-prowlarr/dist ./packages/provider-prowlarr/dist
COPY --from=builder /app/packages/provider-plex/package.json ./packages/provider-plex/
COPY --from=builder /app/packages/provider-plex/dist ./packages/provider-plex/dist

# Copy backend
COPY --from=builder /app/apps/backend/package.json ./apps/backend/
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/drizzle ./apps/backend/drizzle
COPY --from=builder /app/apps/backend/drizzle.config.ts ./apps/backend/
COPY --from=builder /app/apps/backend/src/database ./apps/backend/src/database

# Install production dependencies + drizzle-kit for migrations
RUN pnpm install --frozen-lockfile --prod
RUN pnpm add -w drizzle-kit

# Expose port
EXPOSE 4000

# Start the application with migrations
WORKDIR /app/apps/backend
CMD ["sh", "-c", "pnpm drizzle-kit push && node dist/main.js"]
