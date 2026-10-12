FROM node:25-alpine AS build
RUN npm install -g pnpm@12.10.1
WORKDIR /repo
# Packages download in their own layer, which only changes with the lockfile; a source change reuses it.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm --filter @automatedLinkedIn/spider... build

FROM build AS prune
RUN pnpm --filter @automatedLinkedIn/spider deploy --prod --ignore-scripts /out
RUN find apps/spider/dist \( -name '*.test.*' -o -name '*.d.ts' -o -name '*.tsbuildinfo' -o -name 'vitest.setup.*' \) -delete

# The API only queues tasks, so it needs no browser.
FROM node:25-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prune /out/package.json ./
COPY --from=prune /out/node_modules ./node_modules
COPY --from=prune /repo/apps/spider/dist ./dist
# Build info reported by GET /health. CI passes these; local builds report "unknown".
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
ENV GIT_SHA=${GIT_SHA} BUILD_TIME=${BUILD_TIME}
USER node
EXPOSE 3002
CMD ["node", "dist/src/server.js"]

# The worker runs on glibc (Firefox needs it) while the stages above are musl, and some dependencies of camoufox ship
# native code per libc. So its dependencies are installed and pruned here on the same base it runs on.
FROM node:25-bookworm-slim AS worker-build
RUN npm install -g pnpm@12.10.1
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm --filter @automatedLinkedIn/spider... build
RUN pnpm --filter @automatedLinkedIn/spider deploy --prod --ignore-scripts /out
RUN find apps/spider/dist \( -name '*.test.*' -o -name '*.d.ts' -o -name '*.tsbuildinfo' -o -name 'vitest.setup.*' \) -delete

# The worker drives Camoufox, a Firefox build. The exact `camoufox` version in apps/spider/package.json pairs with one
# browser build, which is downloaded here so a task never waits for it. This stage only sees that package.json, so a
# source change reuses the download (about eight minutes) instead of repeating it.
FROM node:25-bookworm-slim AS browsers
WORKDIR /browsers
COPY apps/spider/package.json /tmp/spider-package.json
RUN npm init -y > /dev/null \
   && npm install --no-audit --no-fund --ignore-scripts \
      camoufox@"$(node -p "require('/tmp/spider-package.json').dependencies.camoufox")" \
      playwright-core@"$(node -p "require('/tmp/spider-package.json').dependencies['playwright-core']")"
USER node
RUN node node_modules/camoufox/dist/__main__.js fetch
# Playwright's own build of ffmpeg, which encodes the video of a recording (a few MB). It lands in the node user's
# ~/.cache/ms-playwright, where playwright-core looks for it at run time.
RUN node node_modules/playwright-core/cli.js install ffmpeg

# The libraries are Firefox's runtime needs; xvfb is the virtual display Camoufox runs on instead of plain headless.
FROM node:25-bookworm-slim AS worker
ENV NODE_ENV=production SPIDER_HEADLESS=virtual
RUN apt-get update \
   && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation libasound2 libatk1.0-0 libcairo-gobject2 libcairo2 libdbus-1-3 \
      libdbus-glib-1-2 libfontconfig1 libfreetype6 libgdk-pixbuf-2.0-0 libglib2.0-0 libgtk-3-0 libharfbuzz0b \
      libpango-1.0-0 libpangocairo-1.0-0 libpangoft2-1.0-0 libx11-6 libx11-xcb1 libxcb-shm0 libxcb1 \
      libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxt6 libxtst6 xvfb \
   && rm -rf /var/lib/apt/lists/*
COPY --from=browsers --chown=node:node /home/node/.cache /home/node/.cache
WORKDIR /app
COPY --from=worker-build /out/package.json ./
COPY --from=worker-build /out/node_modules ./node_modules
COPY --from=worker-build /repo/apps/spider/dist ./dist
USER node
CMD ["node", "dist/src/worker.js"]
