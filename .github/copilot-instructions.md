# automatedLinkedIn – Copilot instructions

LinkedIn outreach automation, built as a pnpm + Turborepo monorepo. Keep answers short, lead with the change, and no emojis.

## Project memory (always)

- Before starting any task, read [MEMORY.md](../MEMORY.md) at the repo root. It holds decisions, gotchas, and open items that are not obvious from the code.
- When a task is done, update `MEMORY.md` before you finish: add new decisions, gotchas, or open items, remove or fix entries that are now wrong, and add one changelog line. Skip it only if nothing durable changed.
- Keep entries short and factual. Never write secrets, tokens, or the git remote URL into it.
- This applies to every custom agent too. Do not create other documentation files to record this; use `MEMORY.md`.

## Planning workflow (always, for non-trivial tasks)

Applies to any task that changes behaviour, schema, config, infra, or more than a trivial edit. Questions, typo fixes, and one-line fixes are exempt.

1. At the start, look in `.plan/` for an existing plan for this work and read it.
2. Write a plan to `.plan/<kebab-case-name>.md` from `.plan/_template.md` (status `draft`) before changing any code.
3. Double-check the plan against the code. Fill in "Edge cases and risks": invalid or empty input, failures and retries, concurrency, idempotency, existing data and migrations, security and secrets, dev vs production, Docker and CI impact, rollback.
4. If any requirement is not fully confirmed, list it under "Open questions", ask the user concise questions, and ask them to lock the requirements. Do not execute until the user confirms. If the request already settles everything, say so, mark the plan `locked`, and continue.
5. Execute step by step, ticking the plan as you go. Stay inside the locked scope; if a new requirement appears, update the plan and get it confirmed first.
6. When done, set the status to `done`, fill in "Outcome" (what shipped, deviations, follow-ups), and update `MEMORY.md`.

Plans are committed with the work; they are the record of locked product decisions. Custom agents follow this workflow too.

## Stack

- Node `v25.9.0` (`.nvmrc`), pnpm `12.10.1`, Turborepo 2, TypeScript 7, Vitest 5, ESLint 10 (flat config), Prettier 3.
- `apps/brain`: Express 5 + tRPC 11 + Prisma 7 + PostgreSQL 18. CommonJS output (`module: commonjs`).
- `apps/body`: React + Vite 8 frontend. Linted with `oxlint` (not ESLint).
- `packages/config`: shared `HttpService` URLs, built with `tsup` to `dist/` (CJS).
- `packages/ui`: shared React components.
- `packages/eslint-config`: shared flat ESLint config (`eslint.js`, `react.js`).
- `packages/tsconfig`: `base.json`, `node.json`, `react.json`.

## Commands (run from the repo root)

| Task | Command |
| --- | --- |
| Install (also runs `prisma generate` and `build:lib`) | `pnpm install` |
| Dev servers | `pnpm dev` |
| Lint / autofix | `pnpm lint` / `pnpm lint:fix` |
| Type check | `pnpm ts:check` |
| Unit tests | `pnpm test:unit:run` |
| Integration tests (need Postgres) | `pnpm test:integration:run` |
| E2E tests (need a running brain server) | `pnpm test:e2e:run` |
| Build everything | `pnpm build` |
| Database | `pnpm --filter @automatedLinkedIn/brain db:generate` / `db:migrate:dev` / `db:migrate:deploy` |

Definition of done for any change: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` all pass.

Turborepo behaviour differs between versions: read the docs bundled in the installed `turbo` package before changing `turbo.json` (see `AGENTS.md`).

## Brain architecture (`apps/brain/src`)

- Entry: `server.ts`. Import order is load-bearing: `dotenv/config`, then `./aliases`, then everything that uses bare imports.
- `aliases.ts` uses `module-alias` at runtime. Every top-level folder in the compiled `src` becomes a bare import (`import { x } from 'trpc'`, `'core'`, `'env'`, `'database'`, `'generated/prisma/client'`). Workspace dependencies named `@automatedLinkedIn/*` are aliased to their `dist/index.js`. `tsconfig.json` maps the same with `paths: { "*": ["./src/*"] }`.
- When you add a new top-level folder under `src`, also add it to `importOrder` in `.prettierrc`, after `^(.*)aliases$`. Otherwise the import sorter hoists it above `./aliases` and the server crashes with "Cannot find module".
- Services and config are static classes (`Environment.config()`, `HttpServer.create()`, `Middlewares.config(app)`, `PrismaService`, `UserService`). Follow that pattern.
- Express 5: no bare `'*'` routes. Use `'/{*splat}'`.
- tRPC: `trpc/trpc.ts` defines `router` and procedures. `trpc/api/router.ts` exports `AppRouter`. Resolvers live in `trpc/api/resolvers/<name>/<name>.ts` with their tests next to them.
- `apps/body` consumes `AppRouter` as a type by importing brain source directly (`apps/body/src/trpc/trpc.ts`). `apps/body/tsconfig.app.json` maps `trpc` and `trpc/*` to brain so brain's bare imports resolve. A new bare alias used by the router chain needs the same mapping.

## Environment

- Copy `apps/brain/.env.example` to `apps/brain/.env`. Tests load `apps/brain/.env.test` (see `.env.test-example`). Never commit `.env*` files except the examples.
- Variables are validated with `envalid` in `src/env/env.ts`: `DATABASE_URL` (required), `PORT` (default 3001), `NODE_ENV`.
- Local database: `docker compose up -d postgres`, then `postgresql://postgres:postgres@localhost:5432/automatedlinkedin`.

## Database (Prisma 7.10, stable; the npm `latest` CLI tag is an 8.0 RC, do not upgrade to it)

- Schema: `apps/brain/prisma/schema.prisma`. Config: `apps/brain/prisma.config.ts` (the connection URL lives there, not in the schema).
- Generated client: `apps/brain/src/generated/prisma` (gitignored, regenerated by `postinstall`, `moduleFormat = "cjs"`). Import it as `generated/prisma/client`. Connect through `PrismaService.client` (adapter `@prisma/adapter-pg`); never instantiate `PrismaClient` elsewhere.
- Create a migration: `DATABASE_URL=... pnpm --filter @automatedLinkedIn/brain db:migrate:dev --name <what_changed>`, then commit `prisma/migrations/*`.
- Migrations must be additive. Never run `prisma migrate reset`, `db push --force-reset`, or drop schemas on a database with data unless the user explicitly asks.
- Add data access to a service in `src/database` (one class per aggregate) and test it.

## Testing

- Co-locate tests next to the source and write the test first.
- Suffixes decide which runner picks a file up: `*.unit.test.ts` (no I/O, mock `env`, Prisma and adapters), `*.integration.test.ts` (real Postgres), `*.e2e.test.ts` (running server).
- `apps/brain/vitest.config.mts` is `.mts` on purpose: `vite-tsconfig-paths` is ESM-only and brain is CJS. It extends the root `vitest.config.ts`.
- Mock `module-alias` with `vi.mock('module-alias', ...)` and a named `addAliases` import; spying on a namespace import fails under ESM.

## Code style

- Prettier: 3-space indent, no semicolons, single quotes, `printWidth` 120, `arrowParens: avoid`, `trailingComma: es5`. Run `pnpm lint:fix` rather than formatting by hand.
- ESLint rules to expect: `consistent-type-imports` (inline `type`), `prefer-destructuring`, `prefer-template`, and `object-curly-newline` (objects with two or more keys must be multi-line; single-key objects must stay on one line).
- Prefer small, focused changes. Share behaviour, not shape; do not add abstractions for one caller. Comments only when the code cannot say it, one short line.

## TypeScript 7 gotchas

- `baseUrl` and `moduleResolution: node10` are removed. Use `paths` and the defaults for the chosen `module`.
- `@types/*` are not auto-loaded. Node projects extend `packages/tsconfig/node.json`, which sets `types: ["node"]`.
- `typescript-eslint` does not support TS 7 yet, so `packages/eslint-config` pins `typescript@^6`. Leave that pin in place.
- A default import of `module-alias` is not typed; use `import { addAliases } from 'module-alias'`.

## Docker

- Context is always the repo root: `docker build -f apps/brain/Dockerfile .` and `docker build -f apps/body/Dockerfile .`.
- Brain stages: `build`, `migrate` (runs `prisma migrate deploy`), `prune` (`pnpm deploy --prod --ignore-scripts`), final (compiled `dist` plus production dependencies only, runs as `node`, port 3001). Body: Vite build served by `nginx`.
- Anything imported at runtime by brain must be in `dependencies`, not `devDependencies`, because the image installs production dependencies only. `packages/config` ships only `dist` (`"files": ["dist"]`).
- `docker compose up -d --build` starts `postgres`, runs `migrate`, then starts `brain` (3001) and `body` (3000). `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` override the defaults.

## CI and publishing

- `.github/workflows/ci.yml`: job `check` (install, lint, `ts:check`, unit tests, build). On pushes to `main`, job `publish` then builds and pushes `ghcr.io/<owner>/automatedlinkedin-brain` and `-body` (tags `latest` and `sha-<commit>`) independently.
- Integration and e2e tests are not run in CI.

## Custom agents (`.github/agents`)

| Agent | Use it for |
| --- | --- |
| Backend Engineer | `apps/brain`: Express, tRPC, aliases, env |
| Database Engineer | Prisma 7, PostgreSQL, migrations, `src/database` services |
| Frontend Engineer | `apps/body`, `packages/ui`, the tRPC client |
| Toolchain Engineer | pnpm, Turborepo, TypeScript, lint, tests, Docker, CI |
| Platform Engineer | Kubernetes-only deployment, platform agnostic (AWS and GCP knowledge) |

## Git and safety

- Conventional commits (`feat`, `fix`, `ci`, `chore`, `docs`, `test`). Never put a literal `!` in a commit message (zsh history expansion).
- Do not push, force-push, or change remotes unless asked. Never print or store the git remote URL or any token.
- This tool automates LinkedIn activity. Keep features aligned with LinkedIn's Terms of Service, privacy and anti-spam law, and the project's `CODE_OF_CONDUCT.md`.
- Do not create documentation files unless asked. The only exceptions are plans in `.plan/` and `MEMORY.md`.
