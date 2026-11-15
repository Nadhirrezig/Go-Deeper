# VipGroup studio for the office PC: `docker compose up -d --build` (README, "Run the studio with
# Docker"). A Linux image: sharp and @napi-rs/canvas install their Linux builds here, whatever the
# host's OS, and the converter's worker process runs inside the container as it does today.

FROM node:22-bookworm-slim AS base
# pnpm at the version pinned in package.json ("packageManager"), fetched once at build time.
ENV COREPACK_HOME=/opt/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json ./
RUN corepack enable && corepack install

# Install and build the whole workspace: shared, converter, flipbook, then the studio.
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Runtime: the built workspace, run by the unprivileged `node` user. The studio finds the
# converter's worker through the workspace root (/app), so the layout stays as in the repo.
FROM base AS runtime
ENV NODE_ENV=production \
    STORAGE_DIR=/data
# library.json, flipbooks/ and uploads/ live in a volume mounted here (docker-compose.yml).
RUN mkdir /data && chown node:node /data
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/apps/studio
EXPOSE 3000
# Next directly (not through pnpm), so Docker's stop signal reaches the server.
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
