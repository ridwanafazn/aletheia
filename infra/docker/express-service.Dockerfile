# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
ARG SERVICE_NAME
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  --mount=type=cache,id=pnpm-cache,target=/root/.cache/pnpm \
  pnpm install --frozen-lockfile --config.trustLockfile=true
RUN pnpm --filter @aletheia/shared-contracts build \
  && pnpm --filter @aletheia/database build \
  && pnpm --filter @aletheia/payments build \
  && pnpm --filter @aletheia/observability build \
  && pnpm --filter @aletheia/${SERVICE_NAME} build \
  && pnpm install --prod --frozen-lockfile --config.trustLockfile=true

FROM base AS runner
ARG SERVICE_NAME
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=256
ENV SERVICE_NAME=${SERVICE_NAME}
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared-contracts ./packages/shared-contracts
COPY --from=build /app/packages/database ./packages/database
COPY --from=build /app/packages/payments ./packages/payments
COPY --from=build /app/packages/observability ./packages/observability
COPY --from=build /app/services/${SERVICE_NAME} ./services/${SERVICE_NAME}
USER node
EXPOSE 4001
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-4001}/healthz >/dev/null || exit 1
CMD ["sh", "-c", "exec node --import ./services/${SERVICE_NAME}/dist/instrumentation.js services/${SERVICE_NAME}/dist/index.js"]
