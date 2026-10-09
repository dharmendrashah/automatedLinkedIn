FROM node:25-alpine AS build
RUN npm install -g pnpm@12.10.1
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @automatedLinkedIn/brain... build

FROM build AS migrate
WORKDIR /repo/apps/brain
CMD ["pnpm", "db:migrate:deploy"]

FROM build AS prune
RUN pnpm --filter @automatedLinkedIn/brain deploy --prod --ignore-scripts /out
RUN find apps/brain/dist \( -name '*.test.*' -o -name '*.d.ts' -o -name '*.tsbuildinfo' -o -name 'vitest.setup.*' \) -delete

FROM node:25-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prune /out/package.json ./
COPY --from=prune /out/node_modules ./node_modules
COPY --from=prune /repo/apps/brain/dist ./dist
USER node
EXPOSE 3001
CMD ["node", "dist/src/server.js"]
