# syntax=docker/dockerfile:1

# Build context is this `web` folder. The front end has no NEXT_PUBLIC_* variables, so nothing
# is baked in at build time and one image serves both QA and production — the API URL and
# everything else are read from the environment when the container starts.

FROM node:22-alpine AS deps
WORKDIR /app

# Corepack installs the exact pnpm pinned in package.json's packageManager field.
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store \
 && pnpm install --frozen-lockfile


FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Telemetry would reach out to Vercel from the build host on every deploy.
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build


FROM node:22-alpine AS final
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    # The standalone server binds to localhost unless told otherwise, which inside a container
    # means nothing outside it — including Traefik — can reach it.
    HOSTNAME=0.0.0.0

# `node` (uid 1000) ships with the image; the app never needs to write to its own files.
COPY --from=build --chown=node:node /app/public ./public
# The standalone bundle carries its own trimmed node_modules and server.js, so there is no
# install step and no package manager in the runtime image.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

# wget is part of busybox on Alpine, so the healthcheck needs nothing installed.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget --quiet --spider --tries=1 http://127.0.0.1:3000/connexion || exit 1

CMD ["node", "server.js"]
