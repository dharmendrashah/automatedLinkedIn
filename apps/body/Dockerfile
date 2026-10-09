FROM node:25-alpine AS build
RUN npm install -g pnpm@12.10.1
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @automatedLinkedIn/body... build

FROM nginx:alpine
COPY --from=build /repo/apps/body/dist /usr/share/nginx/html
EXPOSE 80
