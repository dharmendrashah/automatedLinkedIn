# Run integration tests in CI

- Status: done
- Created: 2026-10-11
- Locked by user: yes, 2026-10-11 (request settles scope)

## Goal

`ci.yml` also runs the brain integration tests against a real PostgreSQL, so a broken migration or database query fails a pull request instead of showing up later.

## Requirements

Confirmed:

- Add a PostgreSQL service (`postgres:18-alpine`, same major as local and compose) to the `check` job, with a health check.
- Apply the real migrations with `prisma migrate deploy` on the empty database, then run the integration tests. This proves the whole migration chain applies from scratch.
- Run both through `pnpm --filter @automatedLinkedIn/brain ...`, not through Turborepo: Turborepo 2 strict env mode would hide `DATABASE_URL` from the task unless `turbo.json` declares it, and no `turbo.json` change is needed.
- The job stays reusable (`workflow_call`) so `release.yml` also runs them.
- E2E tests stay out of CI (they need a running server).

Open questions: none.

## Edge cases and risks

- The database credentials are throwaway values for a service container that only lives for the job; they are not secrets.
- `LINKEDIN_CRED_ENC_KEY` has a dev default that applies when `NODE_ENV` is not `production`, so the job sets `NODE_ENV=test` and needs no secret.
- Integration tests must create and clean up their own rows (they do), and the database is fresh per run, so there is no cross-run state.
- The `.env.test` file does not exist in CI; `vitest.setup.ts` loads it with dotenv, which is a no-op when the file is missing, and the job-level environment variables are used.
- A slow Postgres start is covered by the service health check (`pg_isready`, retries) before steps run.
- The package filter uses the package name `@automatedLinkedIn/brain`; if it were renamed the step would fail loudly (no silent skip).
- Rollback: remove the service and the two steps.

## Verification

- Run the same steps locally against a fresh throwaway database: create it, `db:migrate:deploy`, `test:integration:run`, drop it.
- Check the workflow YAML parses.
- First pull request run on GitHub shows the new steps green.

## Outcome

Shipped. `ci.yml` job `check` now has a `postgres:18-alpine` service with a `pg_isready` health check, then (after unit tests) `prisma migrate deploy` and `test:integration:run` for brain, both through `pnpm --filter` with `DATABASE_URL` (and `NODE_ENV=test` for the tests) set only on those two steps. No `turbo.json` change. Verified locally by replaying the same steps on a fresh throwaway database: all 4 migrations applied from empty and the 3 integration files (18 tests) passed; the YAML parses. The first run on GitHub is the remaining check.

Deviation: none. E2E tests are still not run in CI.
