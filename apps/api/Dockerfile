# syntax=docker/dockerfile:1
#
# ApteeZ API / Worker / Migrate image. Build context is the repository root:
#   docker build -f apps/api/Dockerfile -t apteez-api .
#
# Targets:
#   runner  (default) — production API + worker runtime (`node dist/main`
#             or `node dist/worker`). No dev dependencies, no secrets.
#   migrate — one-shot `prisma migrate deploy` job (has the Prisma CLI).
#
# Runtime configuration is injected exclusively via environment variables
# (DATABASE_URL, REDIS_URL, …). No `.env` file is ever copied in.

ARG NODE_VERSION=20

# ─── Base ────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Prisma engines need OpenSSL + CA certs on slim images.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# ─── Dependencies (frozen lockfile, full install for the build) ──────────
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/validation/package.json packages/validation/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

# ─── Build ───────────────────────────────────────────────────────────────
FROM deps AS builder
COPY apps/api apps/api
COPY packages packages
COPY turbo.json ./
# Prisma client generation needs no database connection. Workspace libs are
# built in dependency order (validation imports types) before the API.
RUN pnpm --filter @apteez/database db:generate \
  && pnpm --filter @apteez/types build \
  && pnpm --filter @apteez/config build \
  && pnpm --filter @apteez/validation build \
  && pnpm --filter @apteez/database build \
  && pnpm --filter @apteez/api build

# ─── Migrate (one-shot job image) ────────────────────────────────────────
FROM builder AS migrate
USER node
CMD ["node_modules/.bin/prisma", "migrate", "deploy", "--schema", "packages/database/prisma/schema.prisma"]

# ─── Deploy (minimal production tree) ────────────────────────────────────
FROM builder AS deployer
RUN pnpm --filter @apteez/api deploy /deploy --prod

# ─── Runner ──────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runner
ENV NODE_ENV=production
# Release identity for /health (operators can see which build is running).
# Injected by CI (--build-arg GIT_SHA=$GITHUB_SHA); 'unknown' when skipped.
ARG GIT_SHA=unknown
ARG RELEASE_TAG=""
ENV GIT_SHA=${GIT_SHA}
ENV RELEASE_TAG=${RELEASE_TAG}
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 appuser \
  && useradd --system --uid 1001 --gid appuser --create-home appuser
WORKDIR /app
COPY --from=deployer --chown=appuser:appuser /deploy ./
USER appuser
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || '3001') + '/api/v1/health/live').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
# Default: HTTP API. The worker service overrides with `node dist/worker`.
CMD ["node", "dist/main"]
