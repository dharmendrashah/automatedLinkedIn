# Cron monitor: an admin-only page that shows the background jobs running on time and what each run did

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-24
- Locked by user: yes, 2026-10-24 <!-- change to "yes, <date>" only after the user confirms -->

## Goal

One admin-only page where the platform owner (`soni@elitale.com`) sees, for every scheduled job of the brain worker: did it run when it should, did it end well, and what it did, down to "the 2-hourly message read was asked for 7 accounts of 5 users, 6 finished, 1 was skipped because it was not signed in". It only watches; it changes nothing.

## What exists today (checked in code, 2026-10-24)

- "Crons" are the brain worker's jobs (`apps/brain/src/worker/jobs/`, `defineJob` + `JobRunner`, 10 jobs, one line each in `jobs/registry.ts`). `JobRunner` keeps `runs`, `lastStartedAt`, `lastFinishedAt`, `lastOutcome` and `failureStreak` in memory only: a restart loses them, and only the worker's own `/health` shows them (port 3004, not reachable from the web app).
- A job returns `{ summary }` only when it did something, and nothing when it was idle (staging's idle checker counts log lines as activity). So today a quiet tick leaves no trace anywhere, and a job that stopped looks the same as a job with nothing to do.
- The 2-hourly message read is not a 2-hour cron. The job `account-daily` wakes every 10 minutes (`AccountDailyJob.runDue`), and each account has its own `nextMessagesAt` (now + 2 h after a read, `MESSAGES_EVERY_MS`). `runDue` returns only the counters `{ checks, visits, reads }`, not which accounts or users. The reads themselves are `linkedin-messages` task sessions (`SpiderSession`, `trigger = 'automatic'`), and the stored result is a `MessageImport`. Those exist already; what is missing is the link from a job run to the sessions it asked for, and the reason for every account it did not ask.
- Admin: `User.role` has `USER` and `ADMIN`, `adminProcedure` exists (`trpc/trpc.ts`) and `Usage` uses it, but nothing ever sets `ADMIN`, so today nobody is admin.
- `.plan/cron-service.md` (draft, on hold since 2026-10-14) planned a separate cron container before the brain worker existed. The worker now covers that, so this plan does not build a new container, scheduler, `croner`, run-now or pause; it reuses the worker and only adds recording and a view. That older plan is marked superseded (owner, 2026-10-24: the separate service is the brain worker).

## Requirements

Confirmed by the request of 2026-10-24:

- C1 A cron manager page to see that crons work on time and run well.
- C2 Only the admin sees it; the admin is the user with the verified email `soni@elitale.com`.
- C3 Monitoring only: no starting, stopping or editing a job.
- C4 For each run, show what data it ran with and what it did, with the 2-hourly message read as the model case: for how many users (accounts) it ran.

- C5 Read-only, no run-now, pause or alerts (owner, 2026-10-24).
- C6 Admin by `ADMIN_EMAIL` with the existing `ADMIN` role; the Usage owner view opening for that account is accepted.
- C7 30 days of history.
- C8 Every run of every job is recorded, idle ones too, including the 5 second jobs.
- C9 `.plan/cron-service.md` is superseded (no separate cron container, no `croner`).
- C10 No RabbitMQ consumers on the page: spider results are already on `/sessions`, and the catalog consumer (the spider announcing its task list to brain at start) is plumbing nobody needs to watch.

Proposed design choices (derived from the above):

- P1 Record around the existing `JobRunner`, so no job has to be rewritten to be monitored; only jobs that have per-user work (`account-daily`, `proxy-scoring`) add a list of what they handled.
- P2 Admin by one env value `ADMIN_EMAIL` (non-secret, `soni@elitale.com` in the staging config and `.env.example`), not hard-coded in code.

Open questions: none.

## Design

### Recording (brain worker)

New tables (additive migration `add_job_monitor`):

- No separate status table: every run is a row, so "alive and on time" is read from each job's newest `JobRun`.
- `JobDefinition` (one row per job, replaced at every worker start with the jobs it runs): `name`, `title`, `purpose`, `everyMs`, `timeoutMs`. The router cannot import the worker's registry (only `worker/` may), so the worker announces its jobs, like the spider announces its tasks. A job that never ran still shows up, as `UNKNOWN`.
- `JobRun` (one row per run, idle ones too): `id`, `job`, `startedAt`, `finishedAt`, `durationMs`, `outcome` (`WORKED`, `IDLE`, `FAILED`, `TIMED_OUT`), `summary` (the existing sentence), `counts` (small JSON, for example `{ due: 7, asked: 6, skipped: 1 }`), `error` (class and a message cut at 300 characters; no stack, URL credentials and token-like values masked), `instance`, `build`.
- `JobRunItem` (what a run handled): `runId`, `userId?`, `accountId?`, `action` (`messages-read`, `visit`, `sign-in-check`, `proxy-score`, ...), `result` (`ASKED`, `SKIPPED`, `FAILED`), `reason` (a fixed sentence, for example "Not signed in within the last day"), `sessionId?` (the `SpiderSession` it started), `dueAt?`. At most 500 per run, then one "N more not kept" counter in `counts`. Holds no message text, no credentials, no proxy secrets.

How a job reports: `defineJob` gets `title` and `purpose` (one plain sentence each, shown on the page); `run` may return `{ summary, counts?, items? }` (still optional, so existing jobs keep working; no summary means `IDLE`). `JobRunner` takes a `recorder` dependency like it takes `log`; a recorder failure is logged once a minute and never affects the job. The recorder buffers finished runs in memory and writes them in one batch every 5 seconds (and on stop), so the fast jobs do not cost one insert each.

Volume (every run recorded, decided by the owner): workflow-engine and data-reads 17,280 runs a day each, task-dispatch 8,640, message-import 2,880, reply-sweep and workflow-schedule 1,440 each, account-daily and data-wallet 144 each, proxy-scoring 24, retention 4: about 49,000 rows a day, about 1.5 million over 30 days, written in batches (about 0.6 rows a second). Rows are kept small (no text on idle runs, `counts` and `error` null). Items exist only for `account-daily` and `proxy-scoring`, at most 500 per run. Retention: the existing `retention` job deletes `JobRun` (items cascade) older than 30 days (`JOB_RUN_RETENTION_DAYS`). The page never loads raw ticks for a chart: the 24 hour strip and the counts are grouped by the database (`date_bin`), and the run list hides idle runs by default.

`account-daily` and the 2-hourly read: `AccountDailyJob.runDue` is extended to also return the list of accounts it handled and why it skipped the others (it already knows both: due but not signed in, status not ACTIVE, request refused by `TaskRefusedError`, first time only drawn for later today). The job turns that into items per account and `counts` per action. The session it started is stored as `sessionId`, so the page can show the result later by reading the session (verdict, duration, and its `MessageImport` status) instead of copying it. Counters stay as they are for the log line.

### On time or late (pure function, tested)

Per job, from its newest run: `HEALTHY` (finished within `2 x everyMs + 30 s`, last run not failed), `LATE` (no run in that window; a job that hangs shows here too, because the runner skips ticks while one is going), `FAILING` (last run failed or timed out, with the streak count), `UNKNOWN` (no run yet). The worker as a whole is `DOWN` when every job is `LATE`. Nothing needs the worker's `/health` port, so it works for the web app through brain.

Per account, message reads ("2-hourly, on time?"): computed from `LinkedInAccount.nextMessagesAt` and the last two `linkedin-messages` automatic sessions, no new storage: last read at, next due, gap between the last two reads, and `OVERDUE` when `nextMessagesAt` is more than 30 minutes in the past while the account is ACTIVE.

### API (brain)

Router `jobs`, every procedure behind `adminProcedure`, read-only:

- `overview`: worker state, one entry per job (title, purpose, schedule in words from `everyMs`, last tick, next expected, health, last run, failure streak, 24 h counts), from the newest `JobRun` of each job and the registry (jobs with no run show as `UNKNOWN`).
- `runs({ job, outcome?, before?, limit })`: paged, newest first.
- `run({ id })`: the run, its items joined to their user (email, name), account (LinkedIn email) and `SpiderSession` (status, verdict, duration, message import status).
- `messageReads`: the per-account table above, with the user and account named.

Routes get no new bare alias; `database/` holds the services (`JobMonitorService`, `JobRunService`), `worker/` only calls them.

### Admin

- `ADMIN_EMAIL` in `src/env/env.ts` (optional; without it nobody is admin and the page is simply absent).
- A user becomes `ADMIN` only when their email equals it (case-insensitive) and authentik vouched for it (`emailVerified`, or the row is already linked by `authentikId`). Done in two places: `UserService` link and create (new or first sign-in), and a one-time `syncAdmin` at brain start for a row that is already linked, which also demotes any other `ADMIN`. A partial unique index on `role = 'ADMIN'` (in the migration) keeps it to exactly one admin even on a race.
- `me` already returns `role`; the body shows the sidebar entry and route only when `role === 'ADMIN'`; for anyone else `/jobs` renders the same page as an unknown route. The API is the real gate (`FORBIDDEN` for a non-admin on every procedure).
- Side effect to know: `Usage` already shows its owner view (shared wallet, spend per client) to an admin, so `soni@elitale.com` will start to see it too.

### Page `/jobs` ("Cron monitor", `apps/body`)

Full width (`grid w-full gap-4 px-4 lg:px-6`), theme tokens, not colour alone (icon + word + colour).

- Top banner: worker alive (newest run of any job and how long ago, version), or "No job has run since 14:02".
- One card per job: title and one-sentence purpose, schedule in words, next expected, health badge, last result sentence, a strip of the last 24 hours (one cell per run: worked, idle, failed, missed), failure streak.
- Run drawer: when, how long, outcome, instance and version, summary and counts, the error if any, and a table of items (user, account, action, result, reason, link to the session on `/sessions`). The `account-daily` drawer has a filter by action so "message reads" shows exactly which users and accounts a run asked for.
- Tab "Message reads": one row per ACTIVE account (user, account, last read, next due, gap, last verdict, conversations read, overdue flag).
- Refreshes every 30 s; no buttons that change anything.

## Scope and non-goals

- In scope: `JobRun` and `JobRunItem` and migration, batching recorder in `JobRunner`, `title` and `purpose` on every job, richer return of `account-daily` (items and skip reasons) and `proxy-scoring`, 30 day cleanup, `jobs` router, `ADMIN_EMAIL` and the single admin, the `/jobs` page and sidebar entry for the admin, tests, `MEMORY.md`.
- Out of scope: Run now, Pause and Resume; alerts (email, chat); a separate cron container, `croner` or any new scheduler; the two Kubernetes CronJobs (DNS updater, idle shutdown); recording the RabbitMQ consumers (a follow-up if wanted); the Service status page; any view for non-admin users.

## Approach

- [x] 1. Tests first for the pure parts: job health and lateness, schedule to words, the per account message-read state, error masking and cutting, the 500 item cap, the batching buffer (flush, cap, retry).
- [x] 2. Migration `add_job_monitor` (additive: two tables, indexes `(job, startedAt)`, `(runId)`, `(userId, createdAt)`, partial unique index for one `ADMIN`); `db:generate`.
- [x] 3. `database/jobRun.service.ts` (`recordMany`, `cleanup`) and `database/jobMonitor.service.ts` (reads for the router); unit tests with mocked Prisma, integration test against Postgres (a run with items, retention, the one-admin index).
- [x] 4. `defineJob` gets `title`, `purpose` and an outcome with `counts` and `items`; `JobRunner` records every run through an injected recorder (never throws into the job); `runtime.ts` passes the real one; fill in the 10 jobs; update `jobRunner.unit.test.ts` and `jobs.unit.test.ts`.
- [x] 5. `AccountDailyJob.runDue` returns the handled accounts and skip reasons (keeping the counters); `account-daily` and `proxy-scoring` turn them into items; extend their unit tests.
- [x] 6. `retention` job: one more step for the job history (30 days); test.
- [x] 7. `ADMIN_EMAIL` in `env`, `.env.example`, `deploy/base/config.env` (staging value in the staging config, which CI writes from `STAGING_CONFIG_ENV`), `UserService` promotion and `syncAdmin` at start; tests (case-insensitive, verified only, a second admin refused, demoted when the env changes).
- [x] 8. Router `jobs` behind `adminProcedure`; a test that every procedure answers `FORBIDDEN` to a `USER` and `UNAUTHORIZED` without a token.
- [x] 9. Body: `/jobs` page and components, sidebar entry and route only for `role === 'ADMIN'`, helpers with unit tests (no component tests beyond that, as elsewhere).
- [x] 10. Verify end to end (below), update `MEMORY.md`, set this plan to `done`.

## Edge cases and risks

- The fast jobs write 49,000 rows a day together: batching every 5 s, small rows, grouped reads (never raw ticks to the page), and a daily delete of rows over 30 days. The recorder's own insert must not make a job slower: it is fire and forget on a buffer.
- The recorder fails (database blip): the job result stands, the failure is logged once a minute, and the buffered runs are retried on the next flush (capped at 10,000 buffered runs, then the oldest are dropped). A run cut off by a restart leaves no row (written at the end); the job then simply shows `LATE`. No `ABANDONED` state is invented.
- Two worker replicas (not the intended setup; jobs are kept in one): both would write rows, so a job would show twice its runs; `instance` tells them apart. The existing rule "keep jobs in one replica" stays.
- Clock: lateness is judged with the database clock (`now()`), not the pod clock, and message times from LinkedIn (wall-clock kept as if UTC) are never compared with it.
- The message-read table must not claim "on time" for accounts that are not due: only ACTIVE accounts with a recent sign-in count; a paused or blocked account is listed as not scheduled, with its status.
- Privacy and secrets: items hold ids and fixed sentences only, never message text, credentials, proxy passwords or tokens; errors are cut and masked; only the admin can read it, and the admin sees every user's email and LinkedIn account email there (the owner's role, noted on purpose).
- Staging is switched off by the smart shutdown and Spot nodes are replaced: the page then shows `LATE` for every job with the time of the last tick, not failures, and no rows are invented for the gap.
- The staging idle checker counts log lines as activity: the recorder writes none when nothing was due.
- Migration is additive, rollback is the previous image (the extra tables stay unused). The partial unique index on `ADMIN` must not fail on existing data: no row is `ADMIN` today (checked: nothing sets it), and the migration only creates the index.
- `ADMIN_EMAIL` unset or wrong: nobody sees the page and nothing else breaks. Set in the staging config before the PR is merged, because `main` deploys staging at once (not a secret, so `STAGING_CONFIG_ENV`).
- Existing `Usage` owner view opens for the new admin (see above).
- `apps/body` imports brain types through `AppRouter`: new router outputs must stay plain (no Prisma `Json` flowing into the output type, parse on the server), or `tsc` reports "excessively deep".

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` and the brain integration tests (`set -a; . apps/brain/.env.test; set +a; pnpm --filter @automatedLinkedIn/brain db:migrate:deploy` first).
- Local: run brain and the worker, open `/jobs` as `soni@elitale.com` and as another user (no entry, `FORBIDDEN` from the API); watch `account-daily` write a row every 10 minutes with items; stop the worker and see `LATE` and the banner; make a job throw and see `FAILING` with its error; trigger a message read for an account and follow its item to the session.
- Check that an idle tick of a fast job (for example `data-reads`) is recorded as `IDLE` and that the page still loads quickly with a day of rows.

## Outcome

Shipped 2026-10-24: `/jobs` (admin only) with the job cards, run drawer with items, and the Message reads tab; `JobRun`, `JobRunItem` and `JobDefinition` with migration `add_job_monitor` (including the single-admin index); batching `RunRecorder`; `account-daily` items with skip reasons; `ADMIN_EMAIL` with `syncAdmin` at brain start and at sign-in; 30 day cleanup in the `retention` job.

Deviations from the plan:

- A `JobDefinition` table was added (the worker announces its jobs) because the API cannot import the worker's registry; `JobStatus` was dropped as planned after the owner chose to record every run.
- `proxy-scoring` reports counts only, no per-proxy items (its service does not return which proxies it scored).
- An empty `ADMIN_EMAIL` changes nothing (it does not demote an existing admin), so a missing setting cannot lock the owner out.
- The run list links no session: `/sessions` is owner-scoped, so a link to another user's session would not open. The item shows the session's verdict, whether its messages were stored and how long it took.

Verified: `pnpm lint`, `pnpm ts:check`, `pnpm test:unit:run`, `pnpm build`, brain integration tests (28 files) against the local test database, and the compiled brain worker (jobs role) run against it: idle runs of the fast jobs and of `account-daily` and `proxy-scoring` were recorded, all ten jobs announced, and a SIGTERM flushed and exited cleanly. Not run: the page in a browser behind sign-in, and a run that handled real accounts.

Follow-ups: set `ADMIN_EMAIL` in the `STAGING_CONFIG_ENV` GitHub secret before the next staging deploy (not done here); alerts; the RabbitMQ consumers on the page; per-proxy items for `proxy-scoring`.
