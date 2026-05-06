# Enhanced Dockerfile for Cotiza Studio Web (Revenue Critical)
# Enclii-compliant: ✅ All 5 criteria met (added USER directive)

# ============================================
# STAGE 1: Builder
# ============================================
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json .npmrc ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# BuildKit secret `npmrc` is forwarded by the Enclii reusable build-publish
# workflow as `npmrc=//npm.madfam.io/:_authToken=${NPM_MADFAM_TOKEN}` and
# carries auth for private @madfam-scoped packages. The committed project
# `.npmrc` supplies scope-to-registry mappings; pnpm merges auth from
# /root/.npmrc with those mappings. The secret never lands in an image layer.
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=true \
    pnpm install --frozen-lockfile
RUN pnpm run build --filter=@cotiza/web...
# Ensure public/ exists for runner COPY (may be empty in some projects)
RUN mkdir -p /app/apps/web/public

# ============================================
# STAGE 2: Runner
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user (SECURITY FIX)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Environment variables for Enclii/Revenue Shield
# (Stripe keys removed -- cotiza is a Dhanam billing-API client, not a direct
# Stripe integrator. See internal-devops/ecosystem/monetization-architecture-2026-04-26.md)
ENV NEXTAUTH_URL="" \
    NEXTAUTH_SECRET="" \
    DATABASE_URL="" \
    AUTH_PROVIDER_URL="" \
    AWS_S3_BUCKET=""

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

CMD ["node", "apps/web/server.js"]
