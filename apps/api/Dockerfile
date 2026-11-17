FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@10.15.1

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json

RUN pnpm install --frozen-lockfile --filter @catv/api...

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY deploy/scripts/api-entrypoint.sh deploy/scripts/api-entrypoint.sh

RUN pnpm --filter @catv/shared build \
  && pnpm --filter @catv/api exec prisma generate \
  && pnpm --filter @catv/api build \
  && chmod +x /app/deploy/scripts/api-entrypoint.sh \
  && chown -R node:node /app

USER node
ENV NODE_ENV=production
EXPOSE 3001
CMD ["/bin/sh", "/app/deploy/scripts/api-entrypoint.sh"]
