# Project memory

Living notes for people and AI agents working on automatedLinkedIn. Read this before starting a task. When a task is done, update it (see "How to maintain this file"). Keep it short, factual, and current.

## How to maintain this file

- Add a decision, gotcha, or open item only if it would save the next person time. Do not log routine changes; git history does that.
- Edit or delete entries that are no longer true. Do not leave stale facts.
- One line per entry where possible; put the date on decisions and the changelog.
- Never store secrets, tokens, passwords, or the git remote URL here.

## Decisions

- 2026-10-10: Prisma 7.10 (stable) is the ORM. The npm `latest` CLI tag is an 8.0 release candidate; do not upgrade until 8.0 is stable.
- 2026-10-10: PostgreSQL 18 (`postgres:18-alpine`) for local and compose; data volume mounts at `/var/lib/postgresql`.
- 2026-10-10: Deployment target is Kubernetes only and stays platform agnostic. Cloud-specific details live in overlays, not in the app or base manifests.
- 2026-10-10: Each app ships as its own image (`ghcr.io/<owner>/automatedlinkedin-brain` and `-body`). `main` pushes publish `edge` and `sha-<commit>`; `latest` and version tags come only from published GitHub releases (`release.yml`, gated on `ci.yml` through `workflow_call`).
- 2026-10-10: Migrations are additive only. Never reset or drop a database that holds data without being asked.
- 2026-10-10: Shared Prettier config lives at the repo root; ESLint uses the shared flat config in `packages/eslint-config`; `apps/body` uses `oxlint`.
- 2026-10-10: Non-trivial tasks follow a plan-first workflow: a plan in `.plan/`, edge cases reviewed, unconfirmed requirements locked by the user, then execution. Plans are committed.
- 2026-10-10: AI-assisted development is allowed (README and code of conduct) if the change has full test coverage and a plan file under `.plan/`. Not enforced by tooling; reviewers check it.
- 2026-10-10: authentik (pinned `2026.8.3`, no Redis) is the identity provider. It shares the single `postgres:18-alpine` service; its own `authentik` database and role are created on first init by `infra/postgres/init/10-authentik-db.sh`. `body` signs in with OIDC code flow + PKCE as a public client (`oidc-client-ts`, `react-oidc-context`, tokens in sessionStorage). Provider, application and the sign-up flow come from `infra/authentik/blueprints/automatedlinkedin.yaml`, mounted into the worker. Sign-up is open self-registration without email verification. Brain does not verify tokens yet.

## Gotchas

- Brain resolves top-level `src` folders as bare imports through `module-alias`. `./aliases` must load before them. A new top-level folder must be added to `importOrder` in `.prettierrc`, or `lint:fix` hoists its import above `./aliases` and production crashes with "Cannot find module".
- TypeScript 7 removed `baseUrl` and `moduleResolution: node10`, and no longer auto-loads `@types/*`. `typescript-eslint` needs TypeScript 6, pinned only in `packages/eslint-config`.
- A default import of `module-alias` has no types; use `import { addAliases } from 'module-alias'`. In tests mock it with `vi.mock`, not `vi.spyOn`.
- `apps/brain/vitest.config.mts` must stay `.mts` (`vite-tsconfig-paths` is ESM-only, brain is CJS).
- Anything imported at runtime by brain must be in `dependencies`; the image installs production dependencies only. `packages/config` ships only `dist`. `pnpm deploy` needs `--ignore-scripts` because `postinstall` runs `prisma generate`.
- Express 5 rejects the bare `'*'` route; use `'/{*splat}'`.
- `apps/body` type-checks brain source through its `AppRouter` import, so it needs the `trpc` and `trpc/*` path mappings in `tsconfig.app.json`.
- Long Docker commands run in a sync terminal can swallow output. Run them async with output redirected to a `/tmp` log, then read the log.
- zsh: never put a literal `!` in a commit message.
- authentik flows only accept a relative `next` (absolute URLs fail with "Invalid next URL" when the flow finishes). Sign-up therefore builds the OIDC authorize URL first (`AppUserManager.createSigninUrl` in `apps/body/src/auth/userManager.ts`, which also stores the PKCE state) and passes its path and query as `next`.
- authentik compose secrets (`AUTHENTIK_SECRET_KEY`, `AUTHENTIK_PG_PASS`) have public dev defaults on purpose (a required-variable error would break `docker compose up postgres`). Never reuse them outside local development. Set real values in the root `.env` (see `.env.example`).
- Redirect URIs in the blueprint are hard-coded to `localhost:3000` and `localhost:5173`; a deployed host needs the blueprint and `VITE_AUTHENTIK_*` build args changed.
- `infra/postgres/init/*` runs only when the `postgres` data volume is first created, so the `authentik` database is not added to a volume that already exists. On an existing volume create it by hand: `docker compose exec -e PGPASSWORD=postgres postgres psql -U postgres -c "CREATE ROLE authentik LOGIN PASSWORD 'authentik'" -c "CREATE DATABASE authentik OWNER authentik"`, then inside it `ALTER SCHEMA public OWNER TO authentik;`.
- authentik blueprint: identify the `oauth2provider` by `client_id` (unique), not `name`. If a provider with that client_id already exists (e.g. the UI's "Provider for <app>" default), a `name` identifier makes the importer try to insert and fail with a client_id unique error, which aborts the whole blueprint (status `error`, no flow created, flow URL shows "Not Found").
- authentik blueprint: when updating the default `default-authentication-identification` stage to add an `enrollment_flow`, also set `user_fields` (e.g. `[username, email]`), or it fails validation "When no user fields are selected, at least one source must be selected".
- Blueprint apply errors are silent in the UI. Diagnose with `docker compose exec authentik-worker ak apply_blueprint custom/automatedlinkedin.yaml`; check `select name, status from authentik_blueprints_blueprintinstance`.
- authentik enrollment: the user-write stage must set `user_type: internal`, or sign-ups are created as `external` and get "Permission denied — Interface can only be accessed by internal users" on `/if/user/` (the "Manage account" link). Fix an existing external user with `update authentik_core_user set type='internal' where ...`.

## Open items

- `brain` has no health endpoint yet. `PrismaService.isHealthy()` exists to back one; needed before Kubernetes probes.
- `apps/body` nginx now has an SPA fallback (`apps/body/nginx.conf`).
- The authentik stack boots and the `automatedLinkedIn` blueprint applies successfully; the `automatedlinkedin-enrollment` flow serves (verified via the executor API). Still verify login, profile and logout end to end in a browser, including that sign-up lands back in the app signed in, and logout returns to the app (`redirect_uri_type: logout`).
- Brain does not validate access tokens yet, and authentik users are not linked to the Prisma `User` table (use `sub`).
- `Middlewares.serveWeb` in brain serves a `web/dist` folder that does not exist in the image; probably dead code now that `body` is its own image.
- The database layer (`PrismaService`, `UserService`) is not exposed through tRPC yet; `getRole` still returns a static value.
- Integration and e2e tests do not run in CI.
- The first run of the `publish` and release workflows has not been checked on GitHub. GHCR packages are private by default.
- No Kubernetes manifests exist yet (`deploy/` is not created).
- Security: the local git remote URL embeds a personal access token. It should be rotated and the remote reset to a clean URL.

## Changelog

- 2026-10-10: Added MIT license, README, code of conduct, issue templates, and CI.
- 2026-10-10: Migrated ESLint to flat config; fixed TypeScript 7 configs and Vitest setup.
- 2026-10-10: Added Dockerfiles, docker-compose, Prisma 7 database layer with initial migration, and ghcr.io publishing.
- 2026-10-10: Added copilot instructions, `AGENTS.md`, and five custom agents under `.github/agents`.
- 2026-10-10: Added `MEMORY.md` and the plan-first workflow (`.plan/_template.md`); documented the AI-assisted development policy in the README and code of conduct.
- 2026-10-10: Added `SECURITY.md` (private reporting), `SUPPORT.md`, and a pull request template that asks what issue the change solves for the end user.
- 2026-10-10: Added `release.yml` (container images on release) and made `ci.yml` reusable; `main` no longer moves `latest`.
- 2026-10-10: Added authentik to compose with a blueprint, and login, sign-up, logout and profile pages to `apps/body` (react-router, OIDC).
- 2026-10-10: Dropped the separate authentik postgres service; authentik now shares the app `postgres` with its own database created by `infra/postgres/init`.
- 2026-10-10: Fixed the authentik blueprint so sign-up works: identify the provider by `client_id` (adopts a UI-created provider) and set `user_fields` on the default identification stage.
- 2026-10-10: Enrollment now creates `internal` users (`user_type` on the user-write stage) so sign-ups can open authentik's user dashboard.
