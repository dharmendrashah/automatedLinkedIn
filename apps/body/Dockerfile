FROM node:25-alpine AS build
RUN npm install -g pnpm@12.10.1
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
ARG VITE_API_URL
ARG VITE_AUTHENTIK_URL
ARG VITE_AUTHENTIK_CLIENT_ID
ARG VITE_AUTHENTIK_APP_SLUG
ARG VITE_AUTHENTIK_ENROLLMENT_SLUG
RUN pnpm --filter @automatedLinkedIn/body... build
# Build info served at GET /health. Written in the build stage so the file is part of the
# immutable image. The values are passed as build arguments by CI.
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
RUN printf '{"status":"ok","service":"body","commit":"%s","builtAt":"%s"}\n' "$GIT_SHA" "$BUILD_TIME" > apps/body/dist/health.json

FROM nginx:alpine
COPY apps/body/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/body/dist /usr/share/nginx/html
EXPOSE 80
