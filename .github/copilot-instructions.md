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

## Engineering principles (always)

- Follow SOLID, YAGNI and KISS in all code. Build only what the task needs, and pick the simplest design that works.
- Reuse before writing. Before adding code, search the codebase for an existing helper, type, component, or config that does the job, and extend it instead of duplicating it. Do not bloat the codebase; delete code you replace.
- Keep code small and readable. Short functions and files with one job, clear names, no clever tricks, so a person can read and understand each piece quickly.
- Be strict in the language. TypeScript: no `any`, no `@ts-ignore` or `@ts-expect-error` without a one-line reason, no non-null `!` assertions, no unchecked casts; type inputs and outputs explicitly at boundaries, narrow `unknown`, and use `strict` compiler options. YAML (Compose, Kubernetes, CI): quote ambiguous scalars, set explicit types, versions, and image tags (no `latest`), and keep keys minimal and consistent.
- Verify end to end. A task is not done until the code has run for real: the checks in the definition of done pass, and the feature works through its real path (for example the tRPC call, the page, or the container), not only in unit tests. State what you ran and what you could not run.

## Stack

- Node `v25.9.0` (`.nvmrc`), pnpm `12.10.1`, Turborepo 2, TypeScript 7, Vitest 5, ESLint 10 (flat config), Prettier 3.
- `apps/brain`: Express 5 + tRPC 11 + Prisma 7 + PostgreSQL 18. CommonJS output (`module: commonjs`).
- `apps/body`: React + Vite 8 frontend. Linted with `oxlint` (not ESLint).
- `packages/config`: shared `HttpService` URLs, built with `tsup` to `dist/` (CJS).
- `packages/ui`: shared React components.
- `packages/eslint-config`: shared flat ESLint config (`eslint.js`).
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

After finishing every task, run lint, tests and build locally for all apps and packages in the monorepo (these root commands cover them all through Turborepo), not only the ones you touched. Fix every error and every warning they report, including ones that look unrelated to your change, and re-run until all are clean. If something cannot be fixed or run, say so.

Turborepo behaviour differs between versions: read the docs bundled in the installed `turbo` package before changing `turbo.json` (see `AGENTS.md`).

## Brain architecture (`apps/brain/src`)

- Entry: `server.ts`. Import order is load-bearing: `dotenv/config`, then `./aliases`, then everything that uses bare imports.
- `aliases.ts` uses `module-alias` at runtime. Every top-level folder in the compiled `src` becomes a bare import (`import { x } from 'trpc'`, `'core'`, `'env'`, `'database'`, `'generated/prisma/client'`). Workspace dependencies named `@automatedLinkedIn/*` are aliased to their `dist/index.js`. `tsconfig.json` maps the same with `paths: { "*": ["./src/*"] }`.
- When you add a new top-level folder under `src`, also add it to `importOrder` in `.prettierrc`, after `^(.*)aliases$`. Otherwise the import sorter hoists it above `./aliases` and the server crashes with "Cannot find module".
- Services and config are static classes (`Environment.config()`, `HttpServer.create()`, `Middlewares.config(app)`, `PrismaService`, `UserService`). Follow that pattern.
- Background work lives in the brain worker, a second entry of the same image (`src/worker/main.ts`, `pnpm --filter @automatedLinkedIn/brain dev:worker`). A queue is a `defineConsumer` file plus a line in `worker/consumers/registry.ts`; a scheduled job is a `defineJob` file plus a line in `worker/jobs/registry.ts`; a task that must change brain data when it finishes is an entry in `database/taskHooks.ts` (`onResult` runs in the finishing transaction). Only `worker/` may import `worker/` (lint rule); it uses `database` and `core`.
- Every scheduled job is watched by the admin-only cron monitor (`/jobs`, router `jobs`, `.plan/cron-monitor.md`). A new `defineJob` must set `title` and `purpose` (one plain sentence each); `JobRunner` then records every run, idle ones too, in `JobRun` for 30 days with no extra code. A job that handles per-user or per-account work returns `{ summary?, counts?, items? }` with one `items` entry per account it asked for or left (`userId`, `accountId`, `action`, `ASKED` or `SKIPPED`, a fixed-sentence `reason`, the started `sessionId`), so the page can say for how many accounts it ran; ids and fixed sentences only, never message text or secrets. Return nothing when idle and put a `summary` (a log line) only when something was asked for, because staging's idle checker counts log lines as activity. Add a label for a new `action` in `apps/body/src/components/jobs/describe.ts` (`ACTIONS`). The monitor is read only (no run-now, pause or alerts) and the admin is the one user whose verified email equals `ADMIN_EMAIL`.
- A task is never published from `TaskService.request` directly: it saves the session and a `TaskDispatch` row in one transaction (the task's `onRequest` gets the `tx`), then `TaskDispatchService.dispatch` publishes, and the worker job `task-dispatch` retries. Build a command only with `buildTaskCommand`.
- Express 5: no bare `'*'` routes. Use `'/{*splat}'`.
- tRPC: `trpc/trpc.ts` defines `router` and procedures. `trpc/api/router.ts` exports `AppRouter`. Resolvers live in `trpc/api/resolvers/<name>/<name>.ts` with their tests next to them.
- `apps/body` consumes `AppRouter` as a type by importing brain source directly (`apps/body/src/trpc/trpc.ts`). `apps/body/tsconfig.app.json` maps `trpc`, `trpc/*`, `auth`, `database`, `env` and `generated/*` to brain so brain's bare imports resolve. A new bare alias used by the router chain needs the same mapping.

## Spider tasks and the sign-in page (`apps/spider`)

- Every new or changed spider task follows the `spider-task-writer` skill (`.github/skills/spider-task-writer/SKILL.md`). Copy its checklist (`assets/checklist.md`) into the task's plan under Approach and do not mark the plan `done` until every box is ticked or marked not applicable with a reason. The skill also says how to read a failed run (`result.json`, `logs.json`, `timeline.json`, `files/`, a contact sheet of `video.webm`).
- Every account task keeps one lifecycle (details in the skill): load the account's session, device and browser profile, land on `/feed/`, sign in once with the two-step key if the landing is `/`, `/login` or another sign-in page, land on `/feed/` again, wait 5 s and scroll (after a sign-in only), run the task, keep the final picture and page, save the session and profile, and record steps, network, logs, screenshots, video, input and result. The runner owns it; a task does not repeat it. Only `browser-detection` (no account) and `linkedin-login` (signs in itself) are outside the sign-in part of it.
- Verify every selector and page shape against the real page (a devtools snapshot or a kept run page) before writing it, and note the account and date. LinkedIn serves different layouts to different accounts, so keep fixtures for each layout seen. Anything not verified is listed as unverified in the plan and in `MEMORY.md`, and the task keeps the page it could not read (`attach` with `compactHtml`).
- An irreversible step (typing a post, Post, Send) asks `markAttempt()` just before it, happens at most once, and ends in `UNKNOWN`, never a retry, when the outcome is unclear.
- Every LinkedIn page a task lands on (a first visit, a click that navigates, a back, a retry) must be checked for the sign-in page before the task reads or clicks anything: `isSignedOutPage(url)` or `createSession(...).signedIn(url)` from `linkedin/session.ts` (login, `/uas/login`, authwall and checkpoint pages). The task then answers its `SIGNED_OUT` verdict; it never fills or clicks a login form (only `linkedin-login` and the runner's own sign-in do). A task may ask the runner for one sign-in in the middle of its run (`signInAgain` in the task context, which `linkedin-browse` uses): the account signs in again, the feed opens, and the task goes on; a second sign-out, or a sign-in that does not work, is `SIGNED_OUT`.
- A task that uses an account must declare a `SIGNED_OUT` verdict. `tasks/registry.unit.test.ts` fails for a new task that does not. Add a unit test for the task that lands on `/uas/login` and expects `SIGNED_OUT`.
- Every account task starts from the feed: the runner opens `/feed/` before `task.run` (`tasks/ensureSignedIn.ts`, wired by `RunnerDeps.reauth` in the worker and the devtools). A sign-in page there, or a feed that does not open and a `/login` that stays a login page, makes it sign in again once with the stored password and two-step key; a failed sign-in answers `SIGNED_OUT` and the task never runs, and a good one keeps the session and the profile for the next run. A task whose own first address answers 404 must not end in `ERROR` (the post task goes on from the feed).
- Selectors given to the hands (`hands.clickSelector`, `clickNth`) are plain CSS: they run through `querySelectorAll`, so Playwright-only syntax (`:visible`, `>>`) throws and ends the task in ERROR. The driver's `pageHtml()`, `clickSelector` and `clickNth` reach open shadow roots (LinkedIn draws the post composer in one); keep new reads and clicks on those paths. Unit tests mock the hands, so check a new selector against real markup or the e2e test.
- Devtools (`dev:record`): `reachFeed` (`devtools/signIn.ts`) opens the feed and, on a sign-in page, signs the account in again by itself with the stored password and two-step key (a staging account only; a local profile is open in the browser) and carries on. `replaySteps` stops at a step that lands on a sign-in page.

## Environment

- Copy `apps/brain/.env.example` to `apps/brain/.env`. Tests load `apps/brain/.env.test` (see `.env.test-example`). Never commit `.env*` files except the examples.
- Variables are validated with `envalid` in `src/env/env.ts`: `DATABASE_URL` (required), `PORT` (default 3001), `NODE_ENV`, `AUTHENTIK_ISSUER`, `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_INTERNAL_URL` (set when brain reaches authentik on another host than the browser, as in Docker) and `CORS_ORIGINS`.
- Local database: `docker compose up -d postgres`, then `postgresql://postgres:postgres@localhost:5432/automatedlinkedin`.

## Database (Prisma 7.10, stable; the npm `latest` CLI tag is an 8.0 RC, do not upgrade to it)

- Schema: `apps/brain/prisma/schema.prisma`. Config: `apps/brain/prisma.config.ts` (the connection URL lives there, not in the schema).
- Generated client: `apps/brain/src/generated/prisma` (gitignored, regenerated by `postinstall`, `moduleFormat = "cjs"`). Import it as `generated/prisma/client`. Connect through `PrismaService.client` (adapter `@prisma/adapter-pg`); never instantiate `PrismaClient` elsewhere.
- Create a migration: `DATABASE_URL=... pnpm --filter @automatedLinkedIn/brain db:migrate:dev --name <what_changed>`, then commit `prisma/migrations/*`.
- Migrations must be additive. Never run `prisma migrate reset`, `db push --force-reset`, or drop schemas on a database with data unless the user explicitly asks.
- Add data access to a service in `src/database` (one class per aggregate) and test it.

## Testing

- Co-locate tests next to the source and write the test first.
- Write the fewest tests that prove the behaviour: the happy path, the real edge and failure cases, and the contract. No duplicate cases, no tests of framework or trivial code, no assertions on implementation details.
- Suffixes decide which runner picks a file up: `*.unit.test.ts` (no I/O, mock `env`, Prisma and adapters), `*.integration.test.ts` (real Postgres), `*.e2e.test.ts` (running server).
- Brain integration tests (`vitest.integration.config.mts`) give every test file its own database, cloned from a template migrated once per run (`testDatabase.ts`); `DATABASE_URL` only names the server and the name prefix. A test that makes a row "due" for a job must date it in the past (for example `nextAttemptAt: new Date(Date.now() - 1000)`): rows are dated by this process and jobs read the database clock, which can lag by a few ms.
- `apps/brain/vitest.config.mts` is `.mts` on purpose: Vitest's config loader is ESM and brain is CJS. It extends the root `vitest.config.ts`, which resolves tsconfig `paths` natively (`resolve.tsconfigPaths: true`; the `vite-tsconfig-paths` plugin was removed on 2026-10-17).
- Mock `module-alias` with `vi.mock('module-alias', ...)` and a named `addAliases` import; spying on a namespace import fails under ESM.

## Code style

- Prettier: 3-space indent, no semicolons, single quotes, `printWidth` 120, `arrowParens: avoid`, `trailingComma: es5`. Run `pnpm lint:fix` rather than formatting by hand.
- ESLint rules to expect: `consistent-type-imports` (inline `type`), `prefer-destructuring`, `prefer-template`, and `object-curly-newline` (objects with two or more keys must be multi-line; single-key objects must stay on one line).
- Prefer small, focused changes. Share behaviour, not shape; do not add abstractions for one caller. Comments only when the code cannot say it, one short line.
- `apps/body` pages and tables are full width: the page root is `grid w-full gap-4 px-4 lg:px-6`, with no `max-w-*` and no `mx-auto`. Keep this for every new page and table.

## TypeScript 7 gotchas

- `baseUrl` and `moduleResolution: node10` are removed. Use `paths` and the defaults for the chosen `module`.
- `@types/*` are not auto-loaded. Node projects extend `packages/tsconfig/node.json`, which sets `types: ["node"]`.
- `typescript-eslint` does not support TS 7 yet, so `packages/eslint-config` pins `typescript@^6`. Leave that pin in place.
- A default import of `module-alias` is not typed; use `import { addAliases } from 'module-alias'`.

## Docker

- Context is always the repo root: `docker build -f apps/brain/Dockerfile .` and `docker build -f apps/body/Dockerfile .`.
- Brain stages: `build`, `migrate` (runs `prisma migrate deploy`), `prune` (`pnpm deploy --prod --ignore-scripts`), final (compiled `dist` plus production dependencies only, runs as `node`, port 3001). Body: Vite build served by `nginx`.
- Anything imported at runtime by brain must be in `dependencies`, not `devDependencies`, because the image installs production dependencies only. `packages/config` ships only `dist` (`"files": ["dist"]`).
- `docker compose up -d --build` starts `postgres`, runs `migrate`, then starts `brain` (3001) and `body` (3000), plus authentik (`authentik-server` on 9000 and `authentik-worker` that loads `infra/authentik/blueprints`). authentik shares the `postgres` service; its database is created on first init by `infra/postgres/init`. Compose variables live in the root `.env` (see `.env.example`). `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` override the defaults.

## CI and publishing

- `.github/workflows/ci.yml`: job `check` only (install, lint, `ts:check`, unit tests, integration tests, build); it publishes nothing. The workflow is reusable (`workflow_call`) and is called by `staging.yml` and `release.yml`.
- `.github/workflows/staging.yml`: on pushes to `main`, job `check` then job `publish` builds and pushes the staging images (`-brain`, `-brain-migrate`, `-body`, `-spider`, `-spider-worker`; tags `staging` and `sha-<commit>`, body built with the staging `VITE_*` values), and job `deploy` applies them to the cluster. Only the apps a push changed are built and deployed (`deploy/scripts/changed-apps.sh`, tested by `changed-apps.test.sh`); the others keep the tag live on the cluster, and shared or unknown paths or a run by hand deploy everything. A new app or top-level path needs a line in that script.
- `.github/workflows/release.yml`: when a GitHub release is published it re-runs `ci.yml`, then builds and pushes the same two images tagged with the release version (`X.Y.Z`, `X.Y`, `X`, and the exact tag; `latest` only for stable releases, never pre-releases). `linux/amd64` only.
- Integration and e2e tests are not run in CI.

## Custom agents (`.github/agents`)

| Agent | Use it for |
| --- | --- |
| Backend Engineer | `apps/brain`: Express, tRPC, aliases, env |
| Database Engineer | Prisma 7, PostgreSQL, migrations, `src/database` services |
| Frontend Engineer | `apps/body`, `packages/ui`, the tRPC client |
| Toolchain Engineer | pnpm, Turborepo, TypeScript, lint, tests, Docker, CI |
| Platform Engineer | Kubernetes-only deployment, platform agnostic (AWS and GCP knowledge) |
| User - GTM Engineer, User - Agency Owner, User - Founder, User - Sales Rep, User - Platform Admin | Read-only reviewers that judge plans, flows and screens from a real user's seat (persona agents, not engineers); they never name the data supplier |

## Skills (`.github/skills`)

| Skill | Use it for |
| --- | --- |
| `spider-task-writer` | Writing, changing, reviewing or debugging a spider task: procedure, hard rules, reading a failed run, and the checklist to copy into the task's plan |

## Git and safety

- Conventional commits (`feat`, `fix`, `ci`, `chore`, `docs`, `test`). Never put a literal `!` in a commit message (zsh history expansion).
- Do not push, force-push, or change remotes unless asked. Never print or store the git remote URL or any token.
- This tool automates LinkedIn for the signed-in user: it mirrors how they already use LinkedIn, just in a more planned and deliberate way, and it always follows LinkedIn's rules even when automating. Building automation features is in scope: acting on the authenticated user's own account, within LinkedIn's published rate limits, honoring opt-outs and `robots` rules, and respecting privacy and anti-spam law. Do build features whose purpose is mass scraping of other users' data, evading anti-bot or security controls, or sending unsolicited bulk messages. When in doubt, implement the feature and note the compliance consideration rather than refusing. Follow the project's `CODE_OF_CONDUCT.md`.
- Do not create documentation files unless asked. The only exceptions are plans in `.plan/` and `MEMORY.md`.
