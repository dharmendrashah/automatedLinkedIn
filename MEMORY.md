# Project memory

Living notes for people and AI agents working on automatedLinkedIn. Read this before starting a task. When a task is done, update it (see "How to maintain this file"). Keep it short, factual, and current.

## How to maintain this file

- Add a decision, gotcha, or open item only if it would save the next person time. Do not log routine changes; git history does that.
- Edit or delete entries that are no longer true. Do not leave stale facts.
- One line per entry where possible; put the date on decisions and the changelog.
- Never store secrets, tokens, passwords, or the git remote URL here.

## Decisions

- 2026-10-10: Kubernetes manifests live in `deploy/` as Kustomize (`base` + `overlays/staging`). PostgreSQL is **not** deployed: staging uses an existing external server on another cloud. Migrations run as an **init container** on the `brain` Deployment (not a Job), so `replicas` stays 1 with `strategy: Recreate`. Staging targets one zonal GKE Spot node with ingress-nginx on `hostNetwork` and cert-manager, three subdomains (`app.`/`api.`/`auth.`), ~$21/mo. Per-overlay `config.env` and `secrets.env` are git-ignored; CI writes them back from the GitHub secrets `STAGING_CONFIG_ENV` and `STAGING_SECRETS_ENV`, which hold each file verbatim.
- 2026-10-10: Brain exposes `GET /healthz` (liveness, no database) and `GET /readyz` (503 when `PrismaService.isHealthy()` fails) from `src/middlewares/health.ts`, used by the Kubernetes probes.
- 2026-10-10: Accepted risk — the staging `DATABASE_URL` uses **no TLS** to the cross-cloud PostgreSQL server, so credentials and rows cross the public internet in cleartext. Mitigated only by a firewall allowlist. Add `sslmode=require` before production.
- 2026-10-10: Prisma 7.10 (stable) is the ORM. The npm `latest` CLI tag is an 8.0 release candidate; do not upgrade until 8.0 is stable.
- 2026-10-10: PostgreSQL 18 (`postgres:18-alpine`) for local and compose; data volume mounts at `/var/lib/postgresql`.
- 2026-10-10: Deployment target is Kubernetes only and stays platform agnostic. Cloud-specific details live in overlays, not in the app or base manifests.
- 2026-10-10: Each app ships as its own image (`ghcr.io/<owner>/automatedlinkedin-brain` and `-body`). `main` pushes publish `edge` and `sha-<commit>`; `latest` and version tags come only from published GitHub releases (`release.yml`, gated on `ci.yml` through `workflow_call`).
- 2026-10-10: Migrations are additive only. Never reset or drop a database that holds data without being asked.
- 2026-10-10: Shared Prettier config lives at the repo root; ESLint uses the shared flat config in `packages/eslint-config`; `apps/body` uses `oxlint`.
- 2026-10-10: Non-trivial tasks follow a plan-first workflow: a plan in `.plan/`, edge cases reviewed, unconfirmed requirements locked by the user, then execution. Plans are committed.
- 2026-10-10: AI-assisted development is allowed (README and code of conduct) if the change has full test coverage and a plan file under `.plan/`. Not enforced by tooling; reviewers check it.
- 2026-10-10: authentik (pinned `2026.8.3`, no Redis) is the identity provider. It shares the single `postgres:18-alpine` service; its own `authentik` database and role are created on first init by `infra/postgres/init/10-authentik-db.sh`. `body` signs in with OIDC code flow + PKCE as a public client (`oidc-client-ts`, `react-oidc-context`, tokens in sessionStorage). Provider, application and the sign-up flow come from `infra/authentik/blueprints/automatedlinkedin.yaml`, mounted into the worker. Sign-up is open self-registration without email verification. Brain verifies the access token (see next entry).
- 2026-10-10: Brain authenticates API calls with authentik access tokens: `jose` checks RS256 signature, issuer, audience (= client id) and expiry against authentik's JWKS (`src/auth`). `userProcedure` (tRPC) rejects with `UNAUTHORIZED` otherwise; `ctx.auth` is `{ token, sub }` and `ctx.user` is the local `User` linked by `User.authentikId` (= token `sub`). Brain creates the local user just-in-time: on a caller's first request `userProcedure` provisions it (`UserService.provisionAuthentikAccount`: find by `authentikId`, else link a row by email only when authentik reports `email_verified` true, else create one with the authentik email and name, role `USER`). An email already used by an unlinked row is never linked or duplicated (case-insensitive) and fails with `CONFLICT`; an identity without an email gets no row. `me` returns `{ identity, user }`. Everyone is `USER` (no group to role mapping). Without email verification, whoever signs up first with an address owns that row (email squatting).

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
- The compose Postgres holds three databases: `automatedlinkedin` (compose `brain`), `postgres` (default; also migrated so local `pnpm dev` can use `DATABASE_URL=.../postgres`) and `authentik`. A database only gets the app tables after `DATABASE_URL=... pnpm --filter @automatedLinkedIn/brain db:migrate:deploy`; from the host use `localhost:5432`, the `postgres` host name only works inside compose.
- `express-serve-static-core` in brain's `dependencies` is a stub package ("only here to make types work"); it makes `Request` lose its `http` members (`req.headers`, `req.get`). `createContext` types the headers by hand. Fixing it means replacing the stub with `@types/express-serve-static-core`.
- `apps/body` must import brain's `AppRouter` with `import type { ... }`, not `import { type ... }`: with `verbatimModuleSyntax` the latter leaves a side-effect import, so Vite loads brain's server code and fails on its bare imports (`auth`, `trpc`, ...).
- Brain's access-token key set (`AuthService`) is memoised per JWKS URL; a unit test that checks the URL must be the first `authenticate` call in the file.
- authentik flows only accept a relative `next` (absolute URLs fail with "Invalid next URL" when the flow finishes). Sign-up therefore builds the OIDC authorize URL first (`AppUserManager.createSigninUrl` in `apps/body/src/auth/userManager.ts`, which also stores the PKCE state) and passes its path and query as `next`.
- authentik compose secrets (`AUTHENTIK_SECRET_KEY`, `AUTHENTIK_PG_PASS`) have public dev defaults on purpose (a required-variable error would break `docker compose up postgres`). Never reuse them outside local development. Set real values in the root `.env` (see `.env.example`).
- Redirect URIs in the blueprint are hard-coded to `localhost:3000` and `localhost:5173`; a deployed host needs the blueprint and `VITE_AUTHENTIK_*` build args changed.
- Building `deploy/` needs `kubectl kustomize --load-restrictor LoadRestrictionsNone deploy/overlays/staging`: the base reads the authentik blueprint from `infra/`, outside the kustomize root, to avoid a committed copy. It also needs `config.env` and `secrets.env` to exist in the overlay (both git-ignored); copy the `*.example.env` files first or the build fails.
- GCP project `automate-linkedin-511215` enforces `constraints/iam.disableServiceAccountKeyCreation`, so `gcloud iam service-accounts keys create` fails with `FAILED_PRECONDITION`. CI authenticates with Workload Identity Federation instead (no stored key). The provider's `--attribute-condition` pinning `assertion.repository` is the security boundary — without it any GitHub repo could impersonate the service account.
- `deploy/overlays/local` runs the whole stack on minikube against the compose PostgreSQL (`host.minikube.internal`, needs `infra/local-k8s/postgres-expose.yml` because compose binds Postgres to `127.0.0.1`). Verified working: see `deploy/local.md`. Two traps: the cluster and compose share one authentik database, so the compose `authentik-worker` must be stopped or it overwrites the blueprint's redirect URIs; and images must be built before `minikube start`, since Docker Desktop's ~8 GB VM gets OOM-killed building next to a running cluster.
- Kubernetes `runAsNonRoot` needs a numeric `runAsUser`. The brain image declares `USER node`, which kubelet cannot verify, so the Deployment sets `runAsUser: 1000` (the `node` user). Without it the container fails with `CreateContainerConfigError`.
- `deploy/.gitignore` scopes the ignores to `overlays/*/config.env` and `overlays/*/secrets.env`. A bare `config.env` rule would also swallow `deploy/base/config.env`, which holds the shared non-secret defaults and must stay committed.
- The authentik blueprint's redirect URIs and `meta_launch_url` come from `!Env [APP_URL]` (no trailing slash) via `!Format`, defaulting to `http://localhost:3000`. The `localhost:5173` vite entries are still hard-coded. A deployed host sets `APP_URL`; the `VITE_AUTHENTIK_*` build args still have to match, because the SPA bakes them at build time.
- `apps/body` bakes `VITE_*` at build time, so its image is environment specific. `.github/workflows/staging.yml` builds a separate `staging`-tagged image from the repository variables `STAGING_API_URL` and `STAGING_AUTH_URL`; changing a URL means a rebuild, not a config change.
- `infra/postgres/init/*` runs only when the `postgres` data volume is first created, so the `authentik` database is not added to a volume that already exists. On an existing volume create it by hand: `docker compose exec -e PGPASSWORD=postgres postgres psql -U postgres -c "CREATE ROLE authentik LOGIN PASSWORD 'authentik'" -c "CREATE DATABASE authentik OWNER authentik"`, then inside it `ALTER SCHEMA public OWNER TO authentik;`. It also never runs for Kubernetes, where the database is external and must be prepared by hand.
- authentik blueprint: identify the `oauth2provider` by `client_id` (unique), not `name`. If a provider with that client_id already exists (e.g. the UI's "Provider for <app>" default), a `name` identifier makes the importer try to insert and fail with a client_id unique error, which aborts the whole blueprint (status `error`, no flow created, flow URL shows "Not Found").
- authentik blueprint: when updating the default `default-authentication-identification` stage to add an `enrollment_flow`, also set `user_fields` (e.g. `[username, email]`), or it fails validation "When no user fields are selected, at least one source must be selected".
- Blueprint apply errors are silent in the UI. Diagnose with `docker compose exec authentik-worker ak apply_blueprint custom/automatedlinkedin.yaml`; check `select name, status from authentik_blueprints_blueprintinstance`.
- authentik enrollment: the user-write stage must set `user_type: internal`, or sign-ups are created as `external` and get "Permission denied — Interface can only be accessed by internal users" on `/if/user/` (the "Manage account" link). Fix an existing external user with `update authentik_core_user set type='internal' where ...`.

## Open items

- `Middlewares.serveWeb` in brain serves a `web/dist` folder that does not exist in the image; probably dead code now that `body` is its own image.
- The authentik stack boots and the `automatedLinkedIn` blueprint applies successfully; the `automatedlinkedin-enrollment` flow serves (verified via the executor API). Still verify login, profile and logout end to end in a browser, including that sign-up lands back in the app signed in, and logout returns to the app (`redirect_uri_type: logout`).
- Access tokens last 5 minutes (authentik default) and the SPA does not refresh them yet; after expiry API calls get `UNAUTHORIZED` until the user logs in again. Consider `offline_access` or silent renew.
- Add email verification (SMTP) before real users: JIT creation trusts the authentik email, so an unverified address can be claimed by whoever signs up first, and a legitimate owner then gets `CONFLICT`.
- `Middlewares.serveWeb` in brain serves a `web/dist` folder that does not exist in the image; probably dead code now that `body` is its own image.
- The database layer (`PrismaService`, `UserService`) is not exposed through tRPC yet; `getRole` still returns a static value.
- Integration and e2e tests do not run in CI.
- The first run of the `publish` and release workflows has not been checked on GitHub. GHCR packages are private by default.
- No **GKE** cluster has run `deploy/` yet. The stack is verified end to end on minikube (`deploy/local.md`): all four pods Ready, migrations applied by the init container, `/readyz` reports `database: up`, and the ingress routes all three hosts. Still unverified in the cloud: cert-manager issuance, the `hostNetwork` ingress, Spot tolerations and the `deploy` job's GKE authentication.
- The staging `deploy` job needs the secrets `STAGING_CONFIG_ENV`, `STAGING_SECRETS_ENV` and the variables `GCP_PROJECT_ID`, `GKE_CLUSTER`, `GKE_LOCATION`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`; none are set yet. GCP auth is keyless (Workload Identity Federation) because the org enforces `constraints/iam.disableServiceAccountKeyCreation`; setup steps are in `deploy/gcp-setup.md`.
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
- 2026-10-10: Brain verifies authentik access tokens, adds the `me` tRPC query and `User.authentikId` (additive migration), CORS for the SPA, and `apps/body` calls the API with the bearer token and shows the backend account on the profile page.
- 2026-10-10: Brain now creates the local user just-in-time on a caller's first request (link by verified email, else create; `CONFLICT` on an email owned by an unlinked row).
- 2026-10-10: Added `deploy/` (Kustomize base + staging overlay) for a minimal single-node GKE staging cluster with an external PostgreSQL, brain `/healthz` and `/readyz`, an `APP_URL`-driven authentik blueprint, and `staging.yml` to build the staging images.
