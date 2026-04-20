FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

RUN pnpm install --frozen-lockfile

WORKDIR /app/apps/api
RUN npx prisma generate

WORKDIR /app
RUN pnpm run build --filter=@cotiza/api...

# Stage the Prisma runtime + generated client into a stable, flat location
# the runner stage can COPY from. Under pnpm workspaces `prisma generate`
# writes `.prisma` inside the content-addressed `.pnpm` store, not under
# apps/api/node_modules, so we pull both the runtime and the generated
# client directly from there via a shell glob (one @prisma+client version
# per lockfile).
RUN mkdir -p /app/deploy/api-prisma && \
    cp -r /app/node_modules/.pnpm/@prisma+client@*/node_modules/@prisma \
          /app/deploy/api-prisma/@prisma && \
    cp -r /app/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma \
          /app/deploy/api-prisma/.prisma

# Production image
FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

# `--ignore-scripts` because root package.json's postinstall calls
# `turbo run db:generate`; turbo is a devDep (skipped under --prod) and
# Prisma generate already ran in the builder stage — the runtime + client
# are layered below from /app/deploy/api-prisma.
#
# After install, pnpm leaves symlinks under apps/api/node_modules/@prisma
# (pointing into .pnpm/@prisma+client@X/…). BuildKit's subsequent `COPY`
# can't overwrite those symlinks with a directory ("cannot copy to
# non-directory"), so rm -rf the symlinks first to make room for the
# real runtime layered in from the builder stage.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts && \
    rm -rf apps/api/node_modules/@prisma apps/api/node_modules/.prisma

# Layer the Prisma runtime + generated client into the production
# node_modules tree at the location NestJS runtime will require() from.
COPY --from=builder /app/deploy/api-prisma/@prisma ./apps/api/node_modules/@prisma
COPY --from=builder /app/deploy/api-prisma/.prisma ./apps/api/node_modules/.prisma

USER nestjs
WORKDIR /app/apps/api

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# nest-cli.json sets `sourceRoot: src`; with the default tsconfig
# (no rootDir flattening) tsc preserves the src/ path in dist/, so the
# compiled entrypoint is `dist/src/main.js`, not `dist/main.js`.
CMD ["node", "dist/src/main.js"]