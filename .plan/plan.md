# Structured logging and correlation IDs across the apps

- Status: rejected (2026-11-13, not done; owner asked to focus only on campaign-detail-insights). Was: in progress
- Created: 2026-11-08
- Locked by user: yes, 2026-11-08
- Design: [.plan/egm/logging_design_draft.md](egm/logging_design_draft.md) (locked 2026-11-08; review rounds 1 to 13 in `.plan/egm/`)

## Goal

When a LinkedIn task fails, the logs show why (the exit-address lookup of the proxy, as the likely cause). One correlation ID links a browser action, the brain request, the RabbitMQ message and the spider run. Every app writes events through one shared logger (`packages/logger`).

## Requirements

Confirmed (2026-11-08):

- Goals G1 to G7 of the locked design.
- Shared module `packages/logger` (Decision 1, Option A). On the servers it wraps pino.
- Correlation ID carried in the `x-correlation-id` header and RabbitMQ message headers (Decision 2, Option A). The ID is stored on the dispatch row (nullable column, additive migration).
- Body errors stay in the browser console; no body error endpoint (Decision 3, Option B).
- Volume review trigger: 1,000 events per run; it does not stop a run.
- Overhead thresholds: 1% of a run's duration (step 4, median); 1 ms median over 100 calls (step 5). Defaults, confirmed.
- Retention: the project's existing Cloud Logging retention.
- Accepted residual risks: third-party stdout writes; no per-user cap on valid requests; a JSON-style password in free text is not masked; library error text may carry page text up to 500 characters; no write timeout on stdout; no total cap on `CORRELATION_ID_REPLACED` warnings across sources.
- Monthly cost: the estimate method (2 MB per run times runs per month on staging) is accepted; no numeric monthly ceiling.

Open questions (must be empty before locking): none.

## Scope and non-goals

- In scope: `packages/logger` (new); brain, spider and body logging changes; the `x-correlation-id` header and CORS `allowedHeaders` in brain; the nullable `correlationId` column on the dispatch row (additive migration); the spider's `result.json` gains `correlationId`; tests; `MEMORY.md` update.
- Out of scope: dashboards, alerts, paging, OpenTelemetry or W3C Trace Context, any paid service, a body error endpoint, a per-user cap, changes to `logs.json` or `timeline.json`, any change to business behaviour.

## Approach

- [x] 0. Body: create the correlation ID per user action (`crypto.randomUUID()`, fallback `crypto.getRandomValues()` formatted as a UUID) and send `x-correlation-id` on every tRPC request. Test: header on each call; a test without `randomUUID` gets a valid ID.
- [ ] 1. Inventory: write `.plan/egm/logging_inventory.md` listing every `console` call and `catch` block in brain, the spider and the body (file, line, whether it hides an error), and every consumer of console output (Cloud Logging queries, dashboards).
- [ ] 2. `packages/logger`: event writer, context store (AsyncLocalStorage), codes (every key of `RUNNER_VERDICTS` plus `PROXY_LOOKUP_FAILED`, `WORKER_CRASHED`, `PUBLISH_FAILED`, `BODY_ERROR`, `CORRELATION_ID_REPLACED`, `EVENTS_DROPPED`), `maskText` moved here, key-based masking at every nesting level, severity map (10/20 DEBUG, 30 INFO, 40 WARNING, 50 ERROR, 60 CRITICAL, other DEFAULT), overflow rule, never-throw writer with drop counter, browser-safe entry for the body. Check: unit tests for field names/types, severity values, both output modes, masking (password, cookie, proxy URL with credentials, `totp_secret`, `cookie` arrays, `apiKey`), overflow order, drop counter, `EVENTS_DROPPED` summary, and a codes-vs-`RUNNER_VERDICTS` sync test. Body build fails if the browser entry imports `node:` modules or `packages/contracts`. Record body bundle size before and after.
- [ ] 3. Propagation: brain tRPC middleware keeps an incoming ID that is 8 to 64 letters, digits and hyphens, otherwise makes one and logs `CORRELATION_ID_REPLACED` (rate-limited per source; `request.ip`, trust proxy one hop); add `x-correlation-id` to brain's CORS `allowedHeaders` in `apps/brain/src/middlewares/index.ts`; copy the ID into RabbitMQ message headers and the spider API call; dispatch row gets a nullable `correlationId` column (additive migration) so a dispatch retry keeps the ID; the spider writes `correlationId` into `result.json` (additive). Check: brain integration test for the migration and dispatch retry; a preflight from the body origin accepts the header; brain result schemas ignore the extra field (no `.strict()`), one test per reader found in step 1.
- [ ] 4. Spider worker, runner and API: convert all failure paths to the module with codes; `PROXY_FAILED` logs `cause` `PROXY_LOOKUP_FAILED` with the error name, message and stack; a forced write failure still sends the fixed answer; record the overhead on the failure path and on a successful run before and after (fail: median increase above 1% of run duration). Check: `PROXY_FAILED` unit test; a staging task with a test proxy entry that does not resolve writes the G7 event; the spider's Cloud Run job log shows parsed `severity` and `message` in a test line.
- [ ] 5. Brain entry points: tRPC procedures, scheduled jobs, worker consumers, RabbitMQ publish and consume paths. Check: integration test shows one `correlationId` in the brain log, the RabbitMQ message header and the spider events; overhead on tRPC calls (fail: median increase above 1 ms over 100 calls).
- [ ] 6. Body: convert `console` calls from the step 1 table to the module (console objects with the same fields); keep body errors in the browser console with the correlation ID of the failing request. Check: a forced body error is written to the console with the request's ID; the spider's browser requests carry no `x-correlation-id`.
- [x] 7. Review: the design was reviewed in 13 rounds (`.plan/egm/logging_review_round1.md` to `round7.md`; rounds 8 to 13 not saved as files). Done.
- [x] 8. Docs: update `MEMORY.md` with decisions, gotchas and the accepted risks; no new documentation files.

Deploy order and rollback (from the design): step 2 first (brain and spider build, no behaviour change except spider stdout format); step 3 with its migration first, then brain and spider; step 4 spider; step 5 brain; step 0 and 6 body last. Rollback: body before brain.

## Edge cases and risks

- Invalid or oversized incoming ID: replaced by a new ID; warning rate limited per source (no total cap, accepted).
- Forged IDs cannot authorise anything; they only mislabel logs.
- Blocked stdout write holds a request: no timeout, accepted; tail latency not measured.
- Third-party stdout lines are not JSON; Cloud Logging keeps them as plain text (accepted).
- Secrets: key-based masking at every nesting level; `maskText` for free text; a JSON-style password in free text is not masked (accepted). `session` also masks `sessionId`; substring matching over-masks `author`, `sessionStorage` (accepted).
- Retry and redelivery: the same ID, `attempt` incremented. The dispatch row stores the ID (step 3 migration).
- Migration: additive and nullable only; the column stays on rollback; never reset a database with data (AGENTS).
- CORS: an older brain rejects the body's preflight, so roll back the body before brain.
- Dev vs production: only `NODE_ENV=development` writes the short form on the servers; the spider image sets `NODE_ENV=production`.
- Docker and CI: no Dockerfile change expected (images build the workspace graph and run `pnpm deploy --prod`); `@automatedLinkedIn/logger` must be a `dependencies` entry of brain and spider, not devDependencies. The new package needs `build:lib` and `ts:check`, and turbo picks it up.
- Concurrency: AsyncLocalStorage must carry the ID across timers and callbacks; one test per entry point.
- Cost: the 2 MB-per-run estimate is a worst case (every event at the 2 KB cap); a dry run replaces it before rollout.
- Consumers of stdout (Cloud Logging queries, dashboards) are checked before deploy 1 (step 1 inventory).
- Retention: existing project retention; this change sets none.

## Verification

- From the repo root: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` (definition of done, all apps and packages).
- Brain integration (local Postgres): `env -u DATABASE_URL pnpm --filter @automatedLinkedIn/brain exec vitest run --no-file-parallelism <path>` for the migration and dispatch tests.
- Body: vitest for the header and the ID fallback.
- Spider: unit tests for `PROXY_FAILED` / `PROXY_LOOKUP_FAILED`, the write-failure answer, and the stdout JSON check.
- Not runnable here (staging): a real task with a non-resolving test proxy entry (G7); the Cloud Run job log line; the dry-run event count and overhead on staging. These are reported as not run unless executed.

## Outcome

Status: in progress (2026-11-08). Code is done for all steps except the items listed below. The staging checks and the staging overhead runs were not run, so the plan stays open.

Shipped:

- Step 0 (done): the body sends `x-correlation-id` on every tRPC request (`apps/body/src/trpc/correlationId.ts`, `TrpcProvider.tsx`), with a fallback for insecure contexts. Deviation: one ID per HTTP request, not per user action.
- Step 2 (done): `packages/logger` with 21 unit tests: the event shape, codes, `maskText` (moved from the spider), key-based masking, Cloud Logging severity, the 2 KB overflow rule, a never-throw writer with the `EVENTS_DROPPED` report, the ID gate (one `CORRELATION_ID_REPLACED` warning per source per minute, no raw value logged), `AsyncLocalStorage` context, and a browser entry. Added: the codes-vs-`RUNNER_VERDICTS` test, the body bundle size (3,986,583 bytes before, 3,989,299 after the request-error link), and the browser-entry check (`packages/logger/src/browser.unit.test.ts`): no `node:` import and no contracts import, through any file it imports.
- Step 3 (brain part, partial): CORS `allowedHeaders` includes `x-correlation-id`; the correlation middleware runs each request inside its validated ID; `TaskDispatch.correlationId` (nullable, migration `20261108120000_task_dispatch_correlation_id`) is stored at task creation and published as the message header on every publish, retries included. Done later: the spider's RabbitMQ consumer reads the header (`messaging/consumer.ts`), and `result.json` carries `correlation_id` (snake_case, in `taskResultSchema`). Done: a brain integration test that a dispatch retry publishes the stored ID ('should publish a retry with the correlation ID it was saved with', `taskDispatch.integration.test.ts`). Not done: a preflight test from the body origin, and the one-ID test across brain log, RabbitMQ header and spider events. Deploy order: brain first (its strict result schema now accepts `correlation_id`), then spider; rollback: spider first, then brain.
- Step 4 (partial): the spider's `PROXY_FAILED` failure logs one event with `code` `PROXY_FAILED`, `cause` `PROXY_LOOKUP_FAILED`, and the original error name, message and stack (`ProxyLookupError` in `apps/spider/src/scraping/errors.ts`, `runner.ts`). Done: the write-failure test ('should still answer PROXY_FAILED when the log cannot be written', `runner.unit.test.ts`); every spider failure path outside the devtools logs through the logger (`recording/recorder.ts`, `sessions/profiles.ts`). Not done: the staging check (G7 event, Cloud Run stdout line). The devtools CLI output stays on `console` (decision in `.plan/egm/logging_inventory.md`).
- Step 1 (partial): `.plan/egm/logging_inventory.md` lists the console calls by file and the console consumers checked (none in `deploy/`, `infra/` or `docs`). Not done: the per-catch classification (hides an error or not).
- Step 5 (partial): brain's RabbitMQ listeners (`core/messageBroker.ts`) and the task dispatch worker lines (`database/taskDispatch.service.ts`) log through the shared `core/log.ts`. All brain console calls outside the live tests now go through `core/log`; `vitest.setup.ts` mocks it for every brain test, and the console spies are gone. Overhead: a local logger benchmark only (100 calls: median 0.005 ms per successful request event, 0.015 ms per failed event with an error). The tRPC overhead on staging is not measured.
- Step 6 (partial): `reportError` (`apps/body/src/lib/app-error.ts`) logs `BODY_ERROR` through `@automatedLinkedIn/logger/browser` (test in `app-error.unit.test.ts`). Request failures carry the ID: `apps/body/src/trpc/requestErrors.ts` gives every operation of a batch the ID that the request was sent with, and logs a failed request as `BODY_ERROR` with it (`requestErrors.unit.test.ts`). Deviation kept: a render error (`reportError`) has no ID, because the error boundary has no request context.

Checks run (2026-11-08):

- Repo gate from the root: `pnpm lint`, `pnpm ts:check`, `pnpm test:unit:run` and `pnpm build` all exit 0.
- Latest (2026-11-08): logger 21 tests, spider 103 files and 1423 tests, brain 173 files and 1844 tests, body 131 files and 1153 tests. Brain integration (local Postgres): 99 files and 559 tests pass. Repo gate from the root (lint, ts:check, unit, build): exit 0, no lint warnings.
- The earlier working-hours failures (`BrowseBudgetError`) are fixed: the four task-flow integration files (`taskDispatch`, `task.service`, `eventDispatch`, `linkedInLogin`) switch `BROWSE_BUDGET` off in `vi.hoisted`, since their subject is the outbox and event flow, not the budget, which has its own tests. Other integration files still run the budget and pass at the time of this run.
- Not run: the staging checks (G7 event, Cloud Run stdout line, dry-run event counts), the overhead on staging, and the e2e tests.

Deviations and decisions:

- The plan file is `.plan/plan.md`, as requested (the convention is a kebab-case name).
- Accepted risks, as recorded in the design: no stdout write timeout and no total cap on warnings; both were accepted by the owner.
- Severity is set by pino's level formatter; the event's own `severity` is removed before the write.

Follow-ups (also in `MEMORY.md`): the catch-block classification (step 1), the render-error request ID (step 6), the body preflight test and the one-ID test across brain, RabbitMQ and spider (step 3 and 5); run the staging checks and the staging overhead measurement, which cannot be run here.

