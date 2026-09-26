# syntax=docker/dockerfile:1
#
# ApteeZ Web (Next.js production server) image. Build context is the
# repository root:
#   docker build -f apps/web/Dockerfile -t apteez-web .
#
# NEXT_PUBLIC_* values are inlined at build time — pass them as --build-arg.
# Backend secrets must never use the NEXT_PUBLIC_ prefix (see SECURITY.md).
#
# The image ships the regular `next build` output with production
# dependencies only and runs `next start` (standalone tracing was evaluated
# and reverted: it cannot create symlinks on Windows build machines).

ARG NODE_VERSION=20

# ─── Base ────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# ─── Dependencies (frozen lockfile) ──────────────────────────────────────
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
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
ARG NEXT_PUBLIC_SENTRY_DSN=""
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
ENV NEXT_TELEMETRY_DISABLED=1
COPY apps/web apps/web
COPY packages packages
# Workspace libs must be built before Next (web imports their dist output).
RUN pnpm --filter @apteez/types build \
  && pnpm --filter @apteez/config build \
  && pnpm --filter @apteez/validation build \
  && pnpm --filter @apteez/ui build \
  && pnpm --filter @apteez/web build

# ─── Deploy (minimal production tree: .next + config + prod deps) ────────
FROM builder AS deployer
RUN pnpm --filter @apteez/web deploy /deploy --prod

# ─── Runner ──────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN groupadd --system --gid 1001 appuser \
  && useradd --system --uid 1001 --gid appuser --create-home appuser
WORKDIR /app
COPY --from=deployer --chown=appuser:appuser /deploy ./
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
