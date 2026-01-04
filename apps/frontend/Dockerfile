# Build stage
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY turbo.json ./

# Copy packages (frontend may depend on shared types)
COPY packages/ ./packages/
COPY apps/frontend/ ./apps/frontend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build packages first
RUN pnpm --filter @loggerr/core build || true

# Set build-time environment variables
ARG NEXT_PUBLIC_API_URL=http://localhost:4001/api
ARG NEXT_PUBLIC_WS_URL=ws://localhost:4001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

# Build frontend
WORKDIR /app/apps/frontend
RUN pnpm run build

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/apps/frontend/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
