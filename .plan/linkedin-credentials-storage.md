# LinkedIn credentials storage (CRUD)

- Status: done
- Created: 2026-10-11
- Locked by user: yes, 2026-10-11

## Goal

Let a signed-in user store the LinkedIn login they want the tool to act as: email, password, TOTP secret, and/or a cached session (cookies), with full CRUD through the brain tRPC API. Secrets are encrypted at rest and never returned over the API. This is storage only; the actual LinkedIn login/automation is a later task.

## Requirements

Confirmed:

- Acts on the authenticated user's own LinkedIn account (in scope per the project rules).
- CRUD lives in brain: Prisma model + a `src/database` service + tRPC resolvers under `userProcedure`, tests first.
- Password, TOTP secret and session cookies are encrypted at rest with AES-256-GCM. `list`/`get` return metadata only (email + which secrets are set + timestamps). A separate explicit `reveal` mutation returns the decrypted secrets for one account the caller owns (mutation, so the secret is never put in the react-query cache).

Locked answers:

- Q1 Many accounts per user, unique per `(userId, email)`.
- Q2 Env `LINKEDIN_CRED_ENC_KEY` (base64 32-byte), AES-256-GCM, `devDefault` for dev/test, required in production. KMS later.
- Q3 Email required; password (+ optional TOTP) and/or session blob; at least one secret required.
- Q4 Brain only now; body settings UI is a follow-up.
- Q5 Owner may retrieve their own secrets, but only through the dedicated `reveal` mutation; `list`/`get` never include secrets.

## Scope and non-goals

- In scope: `LinkedInAccount` model (additive migration), `CryptoService` (`src/core`), `LinkedInAccountService` (`src/database`), tRPC resolvers (create/list/get/update/delete), env var, `.env.example`/`.env.test-example` updates, unit tests, `apps/body` tsconfig alias if a new bare import folder is added.
- Out of scope: real LinkedIn login, cookie capture, scraping, scheduling; body UI (unless Q4 says otherwise); key rotation tooling (schema keeps a `keyVersion` so it is possible later).

## Approach

- [ ] Add `LinkedInAccount` to `schema.prisma` (encrypted blob columns + `keyVersion`, relation to `User`, `@@unique([userId, email])`), additive migration.
- [ ] `CryptoService` in `src/core`: `encrypt(plaintext)`/`decrypt()` with AES-256-GCM, random IV, auth tag, key from env; unit-tested (round-trip, tamper rejection).
- [ ] `LinkedInAccountService` in `src/database`: create/list/get/update/delete; encrypts a `{ password?, totpSecret?, session? }` bundle; a server-only `getSecrets()` for the future automation layer; unit-tested with Prisma mocked.
- [ ] Resolvers under `trpc/api/resolvers/linkedInAccount/` as a nested router (create/list/get/reveal/update/delete), registered in `router.ts`, zod input validation, scoped to `ctx.user.id`; `reveal` is the only one returning secrets; unit-tested.
- [ ] Env: add `LINKEDIN_CRED_ENC_KEY` (envalid), update `.env.example`, `.env.test-example`, document generation command.

## Edge cases and risks

- Secrets: AES-256-GCM only; never log plaintext or ciphertext; API responses expose presence booleans, not values. Key never committed; production has no default (fails fast if unset). Dev/test default is clearly insecure.
- Wrong/rotated key or tampered ciphertext: `decrypt()` throws; service surfaces a clear error, no partial data. `keyVersion` stored for future rotation.
- Duplicate `(userId, email)`: unique constraint → map `P2002` to a `CONFLICT`.
- Authorization: every resolver scopes by `ctx.user.id`; a user can never read or mutate another user's row (no cross-tenant access via `id`).
- Empty/invalid input: zod rejects; require at least one secret; cap field lengths.
- Migration is additive (new table only); no change to existing rows. `User` gets a back-relation field (no column change).
- New top-level `src` folder would need `.prettierrc` importOrder + body tsconfig mapping; avoid by using existing `core`/`database`.
- CI unit tests: `devDefault` key keeps them green without secrets; `.env.test` not required in CI.
- Rollback: drop the new table / revert migration; no other data touched.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`
- `DATABASE_URL=... pnpm --filter @automatedLinkedIn/brain db:migrate:dev --name add_linkedin_account`

## Outcome

Shipped (brain only, as locked). `LinkedInAccount` model (many per user, unique `(userId, email)`) with an additive migration `20261011171000_add_linkedin_account`. `CryptoService` in `src/core` (AES-256-GCM, random IV, auth tag) keyed by env `LINKEDIN_CRED_ENC_KEY` (base64 32-byte, boot-validated, `devDefault` for dev/test, required in production). `LinkedInAccountService` in `src/database` seals a `{ password?, totpSecret?, session? }` bundle and keeps `hasPassword/hasTotp/hasSession` flags so metadata reads never decrypt. tRPC `linkedInAccount` router (create/list/get/reveal/update/delete) behind an `ownerProcedure` that scopes every call to `ctx.user.id`. `list`/`get` return metadata only; `reveal` is a mutation that returns the decrypted secrets to the owner. Unit tests cover the crypto round-trip and tamper rejection, the service (encryption, ownership scoping, patch/merge, conflicts), and the resolvers (auth, validation, conflict/404 mapping). `.env.example`, `.env.test-example` and both deploy `secrets.example.env` document the key; `apps/body/tsconfig.app.json` gained the `core` alias so `AppRouter` still type-checks.

Deviations:
- Q5: the owner can retrieve secrets, but only via the dedicated `reveal` mutation (not in `list`/`get`), to keep the blast radius small.
- The migration was hand-written to match Prisma's output because no database/Docker was reachable; it is committed but not yet applied. Verify with `db:migrate:status`/`db:migrate:dev` once Postgres is up.

Follow-ups (also in `MEMORY.md`): apply the migration; set a real key per environment and move it to a KMS (rotation tooling is absent; `keyVersion` is reserved); build the body settings UI; implement the actual LinkedIn login/session capture that consumes these secrets.

Verification: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` all pass (brain 15 suites / 113 tests, body 4 suites).
