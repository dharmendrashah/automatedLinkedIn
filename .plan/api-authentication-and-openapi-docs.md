# API authentication (user API keys) and module-wise OpenAPI/Swagger docs

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-22
- Locked by user: yes, 2026-11-22 (answers below, plus: the OpenAPI generator ships as its own workspace package, not
  brain-only code)

## Goal

1. A signed-in user can create, list and revoke their own API keys from the Profile page, and call the full tRPC API
   as themselves using a key instead of an authentik session token.
2. Every current tRPC procedure is documented as OpenAPI 3.1, grouped by resolver folder ("module"), served publicly
   from brain; a future procedure needs no manual doc step, because the spec is built from the live router every time
   it is requested.

## Requirements

Confirmed (existing code read first, then locked with the user):

- Today's auth: `Authorization: Bearer <authentik access token>`, verified in `apps/brain/src/auth` (`AuthService`,
  `jose` against authentik's JWKS), feeding `userProcedure` / `ownerProcedure` / `adminProcedure` in `trpc/trpc.ts`.
  This stays the primary path; API keys are a second way to reach the same procedures as the same user.
- A different, narrower key already exists: `Workflow.apiTokenHash` for the single-workflow
  `POST /api/workflows/:id/run` REST trigger (`WorkflowTriggerService`, SHA-256 hash, shown once, `timingSafeEqual`
  compare). Not touched by this work; the new keys are account-level, not workflow-scoped. The new `ApiKeyService`
  reuses the same hashing/compare pattern for consistency.
- Resolvers live in ~32 folders under `apps/brain/src/trpc/api/resolvers/*`; `packages/trpc-openapi`'s tag for a
  procedure is the first dot-segment of its path (`workflow.rotateToken` → tag `workflow`), i.e. one tag per folder.
- `@trpc/openapi` (the official generator) needs TypeScript `<7.0` (old `11.28.2-alpha`) or `>=7.1.0-beta` (every
  version since `11.28.3-alpha`); this repo pins stable `7.0.2`, which satisfies neither range. Building an
  in-repo generator avoids upgrading the whole monorepo's compiler to a beta release for this.
- zod `4.6.7` (already pinned repo-wide) has a native `z.toJSONSchema()` — no extra JSON-Schema dependency needed.
- tRPC v11's `router._def.procedures` is a flat `{ "dot.path": procedureDef }` map; each procedure def carries
  `type` (`query` | `mutation`; no subscriptions exist in this router) and `inputs` (an array of the raw Zod schemas
  passed to `.input()`, unmerged — most procedures call `.input()` once; a chain of several is merged by shape when
  every schema is a `ZodObject`, otherwise the last one is used with a note).
- Locked decisions (from the user):
  - **API key model**: multiple named keys per user (GitHub-PAT style), each independently revocable. "Regenerate"
    is create-a-new-key + revoke-the-old-one, not a single combined action.
  - **Expiry**: manual revoke always available, plus an optional expiry date chosen at creation (Never / 30 / 90 /
    365 days).
  - **Access scope**: a valid key authenticates as the user with the same permissions as their logged-in session
    (no read-only/scoped keys in this version).
  - **OpenAPI approach**: build our own generator rather than adopt the official alpha package or upgrade TypeScript.
  - **Docs access**: the generated Swagger/OpenAPI page is public, no login needed.
  - **Packaging**: the generator is a new workspace package (`packages/trpc-openapi`,
    `@automatedLinkedIn/trpc-openapi`), a pure `router -> OpenAPI document` function with no brain-specific coupling,
    so another app with its own tRPC router could use it the same way; brain is only its first caller.

Open questions: none.

## Scope and non-goals

- In scope:
  - Prisma: new `ApiKey` model (additive migration).
  - Brain: `ApiKeyService` (create/list/revoke/authenticate), `apiKey` tRPC resolver (list/create/revoke), dual-mode
    auth in `trpc/api/context.ts` (authentik JWT or `alk_`-prefixed API key, both populating the same `ctx.user`),
    `userProcedure` updated to accept either, `me` resolver adjusted so an API-key session does not try to call
    authentik's userinfo endpoint.
  - New package `packages/trpc-openapi`: `generateOpenApiDocument(router, options)`, unit tested, built like
    `packages/config`/`packages/contracts`.
  - Brain wiring: `GET /api/openapi.json` (generated spec, the one raw `/api/workflows/:id/run` REST path merged in
    by hand) and `GET /api/docs` (a static HTML page loading Swagger UI from a CDN bundle against that JSON, no new
    npm dependency for the ~5 MB `swagger-ui-dist` package).
  - Body: an "API keys" card on the Profile page (create with name + optional expiry, list with status, revoke with
    confirm, new key shown once with copy); `CopyButton`/`Code` extracted from `components/workflows/api-request.tsx`
    to a shared location so both features use the same "shown once, copy it now" pieces.
  - `.github/copilot-instructions.md`: a short note that tRPC procedures are documented automatically and a new
    non-tRPC REST route (like `/api/workflows/:id/run`) must be added by hand to the merged spec.
  - `MEMORY.md`.
- Out of scope: scoped/read-only keys, rate-limiting API-key calls differently from session calls, replacing or
  touching the existing per-workflow `Workflow.apiTokenHash` trigger, output-schema introspection (matching the
  official package's own documented limitation — only request shapes are generated), a generated typed client SDK,
  Kubernetes/deploy changes (the existing `*)` catch-all in `changed-apps.sh` already redeploys everything for a new
  `packages/*` path).

## Approach

- [x] 1. Prisma: add `ApiKey` model (`id`, `userId` FK cascade, `name`, `keyHash`, `keyPrefix`, `createdAt`,
  `expiresAt` nullable, `revokedAt` nullable, `lastUsedAt` nullable; `@@unique([userId, name])`,
  `@@index([userId])`, `@@index([keyPrefix])`), migrate (`db:migrate:dev --name add_api_keys`).
- [x] 2. `ApiKeyService` in `apps/brain/src/database` (tests first): `create(userId, name, expiresInDays)` — random
  32-byte `base64url` token prefixed `alk_`, SHA-256 hash stored, prefix (first 11 chars) stored in the clear for
  lookup and display, raw key returned once; `list(userId)`; `revoke(userId, id)` (ownership-scoped, idempotent);
  `authenticate(rawKey)` — look up by prefix, `timingSafeEqual` compare the hash, reject if revoked or expired,
  best-effort `lastUsedAt` touch; cap of 20 live keys per user (`CONFLICT`-style rejection past the cap, mirroring
  the label cap's "up to 20" convention). Export from `database/index.ts`.
- [x] 3. `apiKey` tRPC resolver (`ownerProcedure`): `list`, `create` (name 1-60 chars, `expiresInDays` optional one of
  `null | 30 | 90 | 365`), `revoke`. Register in `resolvers/index.ts` and `router.ts`.
- [x] 4. Auth: extend `trpc/api/context.ts` so a Bearer value starting `alk_` is tried against `ApiKeyService`
  instead of `AuthService`/authentik; context carries `apiKeyUser` (the resolved `User` row) alongside the existing
  `auth`/`user`. Update `userProcedure` in `trpc/trpc.ts` to accept either `ctx.auth` (provision as today) or an
  already-resolved `ctx.apiKeyUser` (no provisioning, the row already exists). Adjust `me` so it does not call
  `AuthService.fetchIdentity` when the session came from an API key (return the local user with a minimal identity
  instead). Tests for the new context branches (valid key, revoked, expired, unknown prefix, malformed, and the
  existing JWT path untouched).
- [x] 5. New package `packages/trpc-openapi` (`@automatedLinkedIn/trpc-openapi`), scaffolded like
  `packages/config`/`packages/contracts` (`package.json`, `tsconfig.json` extending `@automatedLinkedIn/tsconfig/
  node.json`, `eslint.config.mjs`, `tsup` build, vitest). Tests first: `generateOpenApiDocument(router, options)`
  against a small sample router — paths (`GET`/`POST` by query/mutation), tags by first path segment, JSON Schema
  from `.input()` via `z.toJSONSchema()`, the merge-by-shape behaviour for chained `.input()` calls, a global bearer
  security scheme, zero-input procedures (no body/no params).
- [x] 6. Brain wiring: add the new package as a dependency (so `aliases.ts` picks it up) and a `tsconfig.json`
  project reference; a small module that calls `generateOpenApiDocument(appRouter, {...})` once and caches it,
  merges in the hand-written `/api/workflows/:id/run` path, and two public Express routes: `GET /api/openapi.json`
  and `GET /api/docs` (static HTML, CDN Swagger UI bundle pointed at the JSON route).
- [x] 7. Body: extract `CopyButton`/`Code` out of `components/workflows/api-request.tsx` into a shared file; add an
  "API keys" card to `pages/Profile.tsx` (list with status derived from `revokedAt`/`expiresAt`, create dialog with
  name + expiry choice, new key shown once with the existing copy/warning styling, revoke with a confirm dialog).
  Tests for any pure status-derivation helper.
- [x] 8. `.github/copilot-instructions.md`: note the auto-documentation and the one manual REST path to keep in
  the merged spec. `MEMORY.md` changelog line.
- [x] 9. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; brain integration tests for `ApiKeyService`
  and the context auth branches against real Postgres; manual check of `/api/openapi.json` and `/api/docs` on a
  running brain, and a real API-key call against a live procedure.

## Edge cases and risks

- **Key shown once**: only the hash and a display prefix are stored; losing the copied key means creating a new one
  and revoking the old, same as the existing per-workflow token.
- **Prefix collision**: the 11-character `alk_` + 7 random chars prefix is used only to narrow the DB lookup, never
  as the sole proof of identity — the full SHA-256 hash is still `timingSafeEqual`-compared before authenticating, so
  a prefix collision (statistically negligible at `base64url` entropy) cannot authenticate the wrong user.
- **Revoked vs expired**: both make `authenticate` reject; the list UI must say which (so a user is not confused
  about why a key stopped working), not just "inactive".
- **Concurrent revoke/use**: `authenticate` reads inside the same request as the procedure call; a key revoked a
  moment earlier simply fails the next call, no special locking needed (same latency class as a token rotation
  racing a running request today).
- **`me` and other identity-reading code with an API-key session**: no authentik token exists to call userinfo with;
  must not throw, must return the local user with a reduced identity instead of crashing every API-key call that
  happens to hit `me`.
- **Provisioning path must not run for API-key sessions**: `userProcedure`'s "create a local user on first use" logic
  is for first-time authentik logins; an API key can only ever belong to an already-existing linked user (it was
  created by one), so that branch must be skipped, not re-triggered.
- **Existing authentik calls must keep working unchanged**: the dual-mode check must not add a hash lookup or extra
  latency to the common authentik path; branch on the `alk_` prefix before doing any work, not after a failed JWT
  verify (which would add a slow failed-JWKS-call path to every API-key request too, if done the other way round).
- **OpenAPI generator correctness over a 30+ resolver, 100+ procedure router**: unit tests should cover more than the
  happy path — zero-input procedures, chained `.input()` calls that are not both `ZodObject` (fall back, do not
  crash), and a path containing the full real `appRouter` at least once as a smoke test (it must not throw end to
  end, even if every field is not asserted).
- **Information disclosure**: the spec is public per the locked decision, and will show every resolver's name and
  input shape (not secrets, not data) to anyone who requests `/api/openapi.json`; acceptable per the user's choice,
  but worth restating here since it is a real trade-off, not an oversight.
- **Docker image size**: Swagger UI is loaded from a CDN in the browser, not bundled into the brain image, so this
  adds no runtime dependency weight to the production image.
- **Rollback**: the `ApiKey` table and the two new routes are additive and can be reverted independently; no existing
  data or behaviour changes if this is reverted.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` (new package included via its own `check`/
  `test:unit:run` scripts, run through Turborepo).
- Brain integration tests (real Postgres) for `ApiKeyService` (create/list/revoke/authenticate, including expired and
  revoked) and for the context's dual-auth branches.
- Manual: create a key from the Profile page, copy it, call a real procedure with
  `Authorization: Bearer <key>` instead of the authentik token and see it succeed as that user; revoke it and see the
  same call now fail; open `/api/openapi.json` and `/api/docs` on a running brain and confirm the spec lists
  procedures grouped by resolver folder.

## Outcome

Shipped exactly as planned, no deviations:

- **Database**: additive `ApiKey` model + migration (`20261122081854_add_api_keys`).
- **`ApiKeyService`** (`apps/brain/src/database/apiKey.service.ts`): create/list/revoke/authenticate, SHA-256 hash +
  `keyPrefix` lookup + `timingSafeEqual` compare, 30/90/365-day optional expiry, 20-live-key cap, duplicate-name
  rejection. 7 integration tests against real Postgres, all passing.
- **`apiKey` tRPC resolver** (`list`/`create`/`revoke`, `ownerProcedure`), registered in the router. 5 unit tests.
- **Dual-mode auth**: `trpc/api/context.ts` branches on the `alk_` prefix before doing any authentik work;
  `userProcedure` accepts either `ctx.auth` or an already-resolved `ctx.apiKeyUser`-style `ctx.user`; `me` builds a
  synthetic identity (`identityOfUser`) for an API-key session instead of calling authentik's userinfo. Covered by
  unit tests for `context.ts`, `trpc.ts` and `me.ts`, plus an end-to-end manual check: created a real key, called
  `me` and `apiKey.list` over HTTP with it as the only credential (no authentik token), got correct data back; then
  revoked it and the same call answered 401.
- **`packages/trpc-openapi`**: `generateOpenApiDocument(router, options)`, scaffolded like `packages/config`/
  `packages/contracts`. 7 unit tests (GET/POST by query/mutation, tag grouping, `.input()` merging and its fallback,
  `extraPaths`, the shared bearer security scheme, an empty router). Verified live against the real `appRouter`:
  `GET /api/openapi.json` returns 35 tags and 261 paths, including the hand-merged `/api/workflows/{id}/run` and
  every `apiKey.*` procedure; `GET /api/docs` renders the Swagger UI page.
- **Body**: `CopyButton`/`Code` moved to `components/copy-code.tsx` (4 importers updated); new `components/api-keys/`
  (`ApiKeysCard`, `statusOf` + 5 unit tests) added to `pages/Profile.tsx`.
- **Docs**: `.github/copilot-instructions.md` and `AGENTS.md` updated (dual-mode auth, automatic OpenAPI docs, the
  one manual REST path, the new package in the Stack list); `MEMORY.md` changelog line.

Verification run: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` all green across every package
(brain 2048 unit tests, body 1278, trpc-openapi 7, plus the unaffected contracts/spider/logger suites); brain
`test:integration:run` green (663 tests, real Postgres). No code review of the UI in an actual browser was done
(only `ts:check`/`lint`/unit tests plus the HTTP-level manual check above) — worth a quick look before relying on it
for anything customer-facing.

## Follow-up 2026-11-22: generate the spec at build time instead of on first request

Requested by the user after the first version shipped: "generate a new swagger json at the build time and save it
and get it from the backend", instead of the original design (built once, lazily, on the first request to
`/api/openapi.json`).

- `apps/brain/src/trpc/openApiOptions.ts`: the title/version/basePath/`extraPaths` pulled out of `openApiDocs.ts` so
  the build-time script and the runtime fallback below can never disagree on what the document looks like.
- `apps/brain/src/generateOpenApi.ts`: a new entry point (bootstraps `dotenv/config` + `./aliases` like `server.ts`),
  builds the document from the live `appRouter` and writes it to `dist/openapi.json` — inside the already-compiled
  output, so it ships into `prune`/the final Docker stage with both existing `COPY --from=prune .../dist ./dist`
  lines and no Dockerfile change.
- `apps/brain/package.json`'s `build` script now runs it after `tsc -b`:
  `DATABASE_URL="${DATABASE_URL:-postgresql://build:build@localhost:5432/build}" NODE_ENV="${NODE_ENV:-development}"
  tsx src/generateOpenApi.ts`. Building the router touches `env.ts`'s validation for real (unlike plain `tsc -b`,
  which never executes app code), and neither var is set in CI's `pnpm build` step or the Docker `build` stage (no
  `.env` there); the dummy `DATABASE_URL` only has to look like a URL (no connection is attempted — `PrismaService`
  connects lazily on first query, never reached just by building the router), and `NODE_ENV` has to be
  non-`production` for envalid's `devDefault`s (`RABBITMQ_URL`, `LINKEDIN_CRED_ENC_KEY`, `IPINFO_TOKEN`, `APP_URL`)
  to apply — confirmed by testing with `.env` moved aside and both vars unset, which failed until `NODE_ENV` was
  forced; an already-set value of either var (a real `.env`, or a future CI override) is left alone.
- `openApiDocs.ts` now reads `dist/openapi.json` once (cached for the process) and serves it as-is; it only falls
  back to building the document live, from the same `openApiOptions()`, when the file is missing — a dev checkout
  that has not run `pnpm build` yet. The two branches are independently unit tested; the previous single `cached`
  test was removed since it no longer reflects the real design.
- `.plan` and `MEMORY.md` entries from the first version already describe `packages/trpc-openapi` as a generic
  generator; this follow-up only changes *when* and *how* brain calls it, not the package itself.

Verified: `rm -rf apps/brain/dist && pnpm build` (root, Turborepo) writes `dist/openapi.json` (261 paths, 35 tags);
repeated with `.env` moved aside and `DATABASE_URL`/`NODE_ENV` unset to confirm it also works with nothing but the
inline fallbacks, matching Docker's `build` stage; the already-running dev server's `/api/openapi.json` response is
byte-identical to the written file. Full gate (`lint`/`ts:check`/`test:unit:run`/`build`) green again afterward.

## Follow-up 2026-11-22 (same day): real per-operation and per-field documentation

Requested in the same PR: "there are so many documentation is missing for each api and input values for each key,
do proper comments and document them in swagger doc." Before this, every operation showed only its path as an id,
and no input field had a description — the comments already written above each procedure were not read at all.

- Considered the TypeScript Compiler API for a real AST-based extractor first and ruled it out: TS 7.0.2's npm
  package no longer exposes the classic synchronous API (`createSourceFile`, `forEachChild`, ...) from
  `require('typescript')` — only `{version, versionMajorMinor}`. The replacement lives under `typescript/unstable/
  ast` and `typescript/unstable/sync`, both explicitly marked unstable and shaped around a different
  Project/Program/Checker model, too risky to depend on for this.
- `apps/brain/src/trpc/resolverComments.ts` (new) reads the comment an engineer already wrote above each procedure
  and above each resolver's own `router({...})`, line-based rather than a full parse: every resolver file under
  `src/trpc/api/resolvers` is Prettier-formatted the same way (one `router({...})` or one bare procedure export per
  block, procedures at exactly 3-space indentation, no nested `router({` calls), so position alone tells a
  procedure property from an unrelated comment (e.g. one inside a chained `.input(z.object({...}))`) apart.
  Confirmed against the real tree: 123 operation comments and 30 module comments extracted, zero false positives.
  `resolverComments.unit.test.ts` covers router- and procedure-level comments, multi-line joining, a bare procedure
  export, two routers in one file, the zod-field exclusion, the no-comment case and the test-file exclusion.
- `packages/trpc-openapi/src/generate.ts`: `GenerateOptions` gained `operationSummaries` and `moduleDescriptions`
  (both `Record<string, string>`, keyed the same way as `resolverComments()`'s output); an operation's `summary`
  prefers the real comment, a tag's `description` likewise. Deliberately **not** done: per-field documentation is
  not extracted from code comments — reliably tying a field-level comment to the right zod schema across inline
  objects, named local consts and schemas imported from `@automatedLinkedIn/contracts` would need the same
  AST/type-checker access just ruled out above. Instead every input field without a real `.describe()` gets a
  humanized label from its own property name (`expiresInDays` -> "Expires in days"), recursing into nested object
  and array-of-object fields and leaving any existing `.describe()` untouched.
- `apps/brain/src/trpc/openApiOptions.ts` calls `resolverComments()` once and passes `operations`/`modules` straight
  through as `operationSummaries`/`moduleDescriptions`, so both the build-time generator and the dev-only live
  fallback pick up the same enriched descriptions with zero manual wiring per procedure.
- Added a handful of real `.describe()` calls to the newest resolver's (`apiKey`) own zod schemas and a one-line
  module comment above its `router({...})`, as a working example of real field-level documentation when an
  engineer takes the extra line to write one (see `apps/brain/src/trpc/api/resolvers/apiKey/apiKey.ts`).

Known scope limit, by design: operation summaries and tag descriptions reuse real engineer-written comments;
per-field descriptions are a humanized guess from the property name unless the engineer added a real `.describe()`
on that field's own zod schema.

Verified: `packages/trpc-openapi`'s unit tests grew from 7 to 13 (summary override, humanized summary fallback, tag
description, humanized field fallback, a real `.describe()` winning over the fallback, and a nested object field);
brain's full unit suite stayed green (192 files, 2056 tests) after wiring `resolverComments()` in; `pnpm lint`,
`ts:check` clean; `rm -rf apps/brain/dist && pnpm build` regenerated `dist/openapi.json` and was inspected by hand —
`apiKey.create`/`apiKey.revoke`/`apiKey.list` show their real one-line summaries, the `apiKey` tag shows its real
module comment, `apiKey.create`'s two fields show their real `.describe()` text, and unrelated procedures with no
hand-written comment or `.describe()` (e.g. `campaign.list`, `accountProfile.get`'s `accountId`) show the humanized
fallback instead of nothing.

## Follow-up 2026-11-22 (same day): clean up what the resolver comments actually say

The user noticed the live `GET /api/docs` page showing a `.plan/*.md` reference as part of the `apiKey` tag's
description (a screenshot of the Swagger UI with the plan-file text highlighted) and asked to remove every comment
like it across the whole API, and to rewrite these comments going forward so "any developer or coding agent can
read and implement" against them.

- Removed all 27 `.plan/*.md` references found across 20 resolver files (`grep -rn '\.plan/' apps/brain/src/trpc/
  api/resolvers`), not only the ones that happened to reach the generated doc, for source hygiene. Rewrote each
  affected comment (module-level and the handful of procedure-level ones) as a self-contained description of what
  the endpoint is for and how to use it, dropping internal-only jargon alongside the plan links where it appeared in
  the same sentence (phase/wave numbers like "phase 4"/"P8", a feature codename like "FoxProfile adoption"); kept
  genuinely useful behavioral facts (ownership scoping, refusal/error shape, side effects) that were already there.
- `linkedInCompany.ts`'s `import` procedure gained a real comment of its own (the existing description lived on an
  unrelated local `const importInput`, too far from the router property to be picked up by `resolverComments.ts` at
  all) — a second, pre-existing instance of the same "comment exists but isn't actually read" gap the next bullet
  fixes for `dashboard`.
- `dashboard.ts`: its module comment sat above a local `const overview = ...`, one blank line above the
  `export const dashboard = router({ overview })` line itself — `resolverComments.ts` only reads a comment with zero
  blank lines directly above the line it decorates, so this one was silently never extracted (confirmed: the
  `dashboard` tag had no description in `dist/openapi.json` before this fix). Moved the comment to sit directly
  above the `router({...})` call so it is now picked up.
- Wrote the convention into `.github/copilot-instructions.md` (tRPC section): a resolver's module/procedure comments
  and a field's Zod `.describe()` are read verbatim into the public Swagger doc, so they must read as documentation
  for someone calling the API — never an internal engineering note, and never a `.plan` file reference, a
  phase/wave number, or a feature codename. This is the standing rule for every future resolver, not just the ones
  touched here.

Verified: `rm -rf apps/brain/dist && pnpm build` regenerated `dist/openapi.json`; scanned the whole file for the
string `.plan` and found zero matches (down from the `apiKey` tag leak the user reported); spot-checked the
`apiKey`/`browse`/`dashboard`/`jobs`/`takeover`/`campaign`/`people`/`connections`/`unibox` tag descriptions by hand
to confirm each reads as plain API documentation with no internal references. Full gate green: `pnpm lint`,
`pnpm ts:check`, `pnpm test:unit:run` (192 files, 2056 tests, unchanged — comment-only and one minor structural
change in `dashboard.ts`).

## Follow-up 2026-11-22 (third one today): name the credential "API token" in the Swagger UI, not "Bearer"

Status: locked (narrow, unambiguous, zero runtime behavior change — documentation/schema labeling only).

The user clicked "Authorize" on `GET /api/docs` and saw a scheme literally named `bearerAuth`, titled
`bearerAuth (http, Bearer)`, asking for a generic "Bearer" value — reads like any OAuth bearer token is expected, not
specifically the API token a caller actually has (the one created on the Profile page). Request: "it should ask api
token in the swagger json."

Two separate credentials exist in the generated document today, and only one of them is even defined:

- `packages/trpc-openapi/src/generate.ts` hardcodes one scheme, key `bearerAuth`, applied globally
  (`security: [{ bearerAuth: [] }]`) to every tRPC path — this is the one the user hit on `me`.
- `apps/brain/src/trpc/openApiOptions.ts`'s hand-written `WORKFLOW_RUN_PATH` (the one REST route outside the tRPC
  router) references `security: [{ workflowToken: [] }]`, but no `workflowToken` entry exists in
  `securitySchemes` anywhere — a second, independent bug (an OpenAPI document that references an undefined security
  scheme name), found while fixing the first one.

### Approach

- `packages/trpc-openapi/src/generate.ts`: rename the scheme key from `bearerAuth` to `apiToken` (still
  `type: "http", scheme: "bearer"`, so Swagger UI keeps auto-prefixing "Bearer " and a caller still only pastes the
  raw token — no behavior change, no new way to get the double-"Bearer" mistake). Reword its `description` to lead
  with "Your API token" (created on the Profile page) and mention the authentik access token second, as the
  secondary/internal option it is for an external caller. Add a new optional `GenerateOptions.extraSecuritySchemes`
  (merged into `components.securitySchemes`, the same pattern as the existing `extraPaths`), so a caller like brain
  can contribute a security scheme for a hand-written path without the generic package knowing anything
  workflow-specific.
- `apps/brain/src/trpc/openApiOptions.ts`: pass `extraSecuritySchemes: { workflowToken: {...} }`, written the same
  way (`type: "http", scheme: "bearer"`), with its own description explaining it is one workflow's own token (from
  that workflow's API tab), not the account-wide one — fixing the dangling-reference bug alongside the renaming.
- Update `packages/trpc-openapi/src/generate.unit.test.ts` for the renamed scheme and the new option.
- Rebuild `dist/openapi.json` and confirm by hand: the Authorize dialog's heading reads `apiToken (http, Bearer)`
  with the API-token-first description; `/api/workflows/{id}/run`'s own security no longer points at an undefined
  scheme.

Verified: `packages/trpc-openapi` unit tests grew from 14 to 15 (renamed-scheme assertion plus a new
`extraSecuritySchemes` merge test); brain's full unit suite stayed green (192 files, 2056 tests); `pnpm lint`,
`pnpm ts:check` clean repo-wide; `rm -rf apps/brain/dist packages/trpc-openapi/dist && pnpm build` regenerated
`dist/openapi.json` with both schemes present (`apiToken`, `workflowToken`, neither dangling); opened the real
`/api/docs` page in a browser, clicked Authorize, and confirmed the dialog shows `apiToken (http, Bearer)` leading
with "Your API token (create one from Profile → API keys)...", with `workflowToken (http, Bearer)` listed as its own
separate entry right below it.

