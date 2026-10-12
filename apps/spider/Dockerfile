FROM node:25-alpine AS build
RUN npm install -g pnpm@12.10.1
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
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
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @automatedLinkedIn/spider... build
RUN pnpm --filter @automatedLinkedIn/spider deploy --prod --ignore-scripts /out
RUN find apps/spider/dist \( -name '*.test.*' -o -name '*.d.ts' -o -name '*.tsbuildinfo' -o -name 'vitest.setup.*' \) -delete

# The worker drives Camoufox, a Firefox build. The exact `camoufox` version in apps/spider/package.json pairs with one
# browser build, which is downloaded here so a task never waits for it. The libraries are Firefox's runtime needs.
FROM node:25-bookworm-slim AS worker
ENV NODE_ENV=production
RUN apt-get update \
   && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation libasound2 libatk1.0-0 libcairo-gobject2 libcairo2 libdbus-1-3 \
      libdbus-glib-1-2 libfontconfig1 libfreetype6 libgdk-pixbuf-2.0-0 libglib2.0-0 libgtk-3-0 libharfbuzz0b \
      libpango-1.0-0 libpangocairo-1.0-0 libpangoft2-1.0-0 libx11-6 libx11-xcb1 libxcb-shm0 libxcb1 \
      libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxt6 libxtst6 \
   && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=worker-build /out/package.json ./
COPY --from=worker-build /out/node_modules ./node_modules
COPY --from=worker-build /repo/apps/spider/dist ./dist
USER node
RUN node node_modules/camoufox/dist/__main__.js fetch
# Playwright's own build of ffmpeg, which encodes the video of a recording (a few MB). It lands in the node user's
# ~/.cache/ms-playwright, where playwright-core looks for it at run time.
RUN node node_modules/playwright-core/cli.js install ffmpeg
CMD ["node", "dist/src/worker.js"]
