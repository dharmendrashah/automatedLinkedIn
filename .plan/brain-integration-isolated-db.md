# Brain integration tests: one database per test file

- Status: done
- Created: 2026-11-01
- Locked by user: yes, 2026-11-01 ("nothing should be at risk at all")

## Goal

Make brain integration tests deterministic: no test file sees another's rows, and "due" checks never depend on clock skew.

## Requirements

Confirmed:

- Fix the root causes, no retries or skipped tests.
- Never touch a database with data: only databases named `<db>_it_<run>_*` are created or dropped.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: `apps/brain` integration test setup, tests that date due rows, docs.
- Out of scope: CI workflow changes (its migrate step is now redundant but harmless), unit and e2e tests.

## Approach

- [x] `testDatabase.ts`: names, admin client on the `postgres` maintenance database, drop a run's databases, drop runs older than 1 h.
- [x] `vitest.integration.global.ts`: create and migrate a template once per run, provide the run name, drop the run's databases on teardown.
- [x] `vitest.integration.setup.mts`: per test file, clone the template (retry while the template is busy) and point `DATABASE_URL` at it.
- [x] `vitest.integration.config.mts` and the `test:integration` script; 60 s test and hook timeouts.
- [x] Date due rows 1 s in the past (messageImport, accountProfile, taskDispatch tests).
- [x] Docs: copilot-instructions Testing section, `MEMORY.md`.

## Edge cases and risks

- Killed run leaves databases: the next run drops runs older than 1 h.
- Two runs at once: each run has its own prefix (start second plus random suffix).
- Unsafe names: database names must match `^[a-z0-9_]+$` before any SQL uses them.
- Concurrent clones of one template: retried up to 10 times.
- App clock ahead of the database clock (about 1.5 ms locally): due rows dated in the past.
- Top-level await is not allowed under brain's CommonJS tsconfig: the setup file is `.mts` and outside `tsconfig.json`.
- CI: the Postgres user must be able to create databases (the CI service user is the superuser `postgres`).

## Verification

- 8 sequential local runs of `pnpm --filter @automatedLinkedIn/brain test:integration:run`: 50 files, 320 tests passed each time; 0 leftover test databases.
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` pass.

## Outcome

Shipped as planned. Follow-up if teardown time matters (about 1 min for 51 drops): drop each file's database in its own `afterAll`, and clone with `STRATEGY FILE_COPY`.
