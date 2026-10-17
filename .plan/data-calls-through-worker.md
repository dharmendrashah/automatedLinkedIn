# Data service calls: worker only, retried, never blocking

- Status: done
- Created: 2026-10-18
- Locked by user: yes, 2026-10-18

## Goal

Every request to the data service goes through the brain worker. A failed request is retried when nothing was charged, a restart never loses a request or pays twice, and one slow job never holds up the others.

## Today (checked in the code and the local database)

| Where | Runs in | Retries | Survives a restart |
| --- | --- | --- | --- |
| Workflow blocks (`worker/engine/context.ts` `paidCall`) | worker, job `workflow-engine` every 5 s | HTTP only: 2 retries for GET, none for POST. A job that **fails at the supplier is final**: the call is FAILED and the step ends PARTIAL ("did not answer for some requests"). | yes: the job id is saved and read again |
| On-demand reads (profile, company page, post, comments, reactions; `database/paidRead.ts`) | **brain API, inside the tRPC request**, its own `DataClient` (`trpc/api/resolvers/reader.ts`) | same HTTP retries only | **no**: a restart mid-read loses it; the $0 ledger row then blocks it (patched to "still running" for 11 min) |

- **Evidence:** locally, 12 of 62 workflow requests (19%) failed with the supplier's own "System error … You were not charged for it, please try again". All 12 are commenters and reactors requests, and none was retried.
- **Blocking:** `DataClient.collect` waits up to 10 minutes for a job. The engine moves runs one after another in one tick, so a slow job holds up every other run, and in the API it holds a browser request open.
- **Two clients:** the API and the worker each pace their own requests, so together they can go over the per-minute limit (`MINDCASE_RPM`).

## Proposal

1. **Start, then check (never wait).** `DataClient` gets `start(slug, params) -> jobId` and `check(jobId) -> outcome | 'running'`. A caller saves the job id, and a later worker tick checks it. Nothing blocks for minutes, and a restart just checks again. (`collect` stays for the opt-in live tests.)
2. **Retry what was not charged.** A request that failed with nothing charged is tried again after a pause: 1, 2, 5, 15, then 30 minutes. This covers a supplier failure ("system error"), no answer, a timeout, or a 5xx. After 5 retries it counts as failed, as today. A request that cost money is never sent again. A bad request (400/422), a missing key or an empty wallet is not retried.
3. **Workflows:** `WorkflowStepCall` gets `attempts` and `retryAt`. A collect step starts or checks each of its requests, skips the ones waiting for a retry, and hands the step back until all of them have finished. Other runs move on meanwhile, and the step's output, cost and PARTIAL message stay as today.
4. **On-demand reads move to the worker:**
   - A new `DataRead` table holds owner, kind (profile, company, post, comments, reactions), slug, variant, params, status (QUEUED, RUNNING, DONE, FAILED), jobId, attempts, retryAt, cost and error.
   - A worker job `data-reads` (every 5 s) starts, checks and retries them, then stores the snapshot and books the ledger, using the same `store` code as today.
   - The tRPC `readFull` / `readEngagement` calls only queue the read and return at once. A second click while one is queued or running returns the same read.
   - The drawer shows "Reading… this can take a few minutes", polls every few seconds while a read is open, and shows the result or the failure message ("did not work, you were not charged, try again").
   - The once-a-day rule counts only reads that finished and cost money, so a failed read can be tried again at once.
   - This replaces the $0-ledger placeholder and the 11-minute "still running" patch.
5. **One client:** only the worker talks to the data service, so its pacing covers every request. Brain API no longer needs `MINDCASE_API_KEY`; the worker already has it.

## Requirements

Confirmed:

- Every data service call goes through the brain worker, with retries, so failures like the comments reads stop ending runs or reads.
- Answered by the owner on 2026-10-18:
   - **Retries:** only requests that were not charged, 5 times, after 1, 2, 5, 15 and 30 minutes. Then the request is failed.
   - **On-demand reads:** queued in the worker; the drawer shows "Reading…" and updates when done.
   - **Once a day:** only reads that finished and cost money count.
   - **Workflows:** a step waits for its retries, up to about 53 more minutes.

Open questions: none.

## Scope and non-goals

- In scope: `DataClient` start/check, the retry policy, workflow step calls, the `DataRead` queue and worker job, the tRPC and drawer changes, removing the API's data client, tests.
- Out of scope: running several runs in parallel inside one tick (no longer needed once nothing blocks), the spider and RabbitMQ (LinkedIn browser tasks, not the data service), and changes to prices.

## Approach

- [x] 1. Lock this plan.
- [x] 2. `DataClient.start` / `check` and the retry rule `retryable(outcome | error)`, with unit tests first.
- [x] 3. Migration (additive): `WorkflowStepCall.attempts`, `retryAt`; new model `DataRead` and enum `DataReadStatus`.
- [x] 4. Engine: `paidCall` on start/check with retries; `collectEach` hands the step back while calls are pending. Integration tests: a supplier failure, then success on retry; a charged failure is not retried; a restart while running.
- [x] 5. `DataReadService` (queue, claim, finish) and worker job `data-reads`. `paidRead` becomes "queue a read", and the store functions move to a per-kind table. Integration tests: queue, double click, retry, success books the ledger and stores the snapshot, final failure.
- [x] 6. tRPC: the read mutations queue; `detail` / `engagement` return the read's status. Remove `resolvers/reader.ts`.
- [x] 7. Body: "Reading…" state and polling in `ReadButton` and the engagement read buttons, plus the failure message.
- [x] 8. Verify all gates, integration tests, and one live read through the worker; then MEMORY.md and Outcome.

## Edge cases and risks

- **A charged failure:** never retried; shown as failed. The supplier says that failed system runs are not charged.
- **Start lost in a crash:** the existing `findJob` lookup is kept for workflow calls and used for reads too, so nothing is paid twice.
- **Worker down:** reads stay QUEUED and the drawer keeps "Reading…". After 15 minutes without a start it shows "Reading is taking longer than usual". Nothing is charged.
- **Wallet below the floor:** refused when queued (as today) and checked again before starting.
- **Concurrency:** a read is claimed with a conditional update (as `WorkflowRunService.claim`), so two workers never start it twice. There is one active read per owner, kind, slug and variant (partial unique index or a check in a transaction).
- **Archive while a read is queued:** the worker drops it; nothing is stored.
- **Existing data:** additive columns with defaults. Old $0 ledger rows from the patch are harmless (they age out).
- **Production:** the API deployment no longer needs the data key. Leave it set until this ships, then remove it from the API in a follow-up.
- **Rollback:** a code revert. The new table and columns stay unused.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, plus the brain integration tests (engine retries, read queue).
- The worker running locally (`pnpm --filter @automatedLinkedIn/brain dev:worker`): one live read of comments queued from the API and finished by the worker.

## Outcome

- **Shipped:** every step 2 to 8 below.
   - `DataClient.start` / `check` / `cancel`, and `core/dataJob.ts` `advanceJob` (one step per tick, retries after 1, 2, 5, 15 and 30 minutes, only when nothing was charged).
   - Migration `add_data_retries_and_reads`: `WorkflowStepCall.attempts`, `retryAt`, `sentAt` (in-flight calls without a job id are backfilled with `sentAt`, so they are looked up, never re-sent), plus the `DataRead` table.
   - Engine: up to 5 jobs in flight per step; the step waits for retries.
   - `DataReadService` with the `database/dataReads.ts` registry, and the worker job `data-reads`. One shared client in `worker/data/client.ts`.
   - Drawers show "Reading…" and poll every 3 s.
- **Deviations:**
   - `advanceJob` lives in `core`, not `worker/data`, so the database read queue can use it; only the worker constructs a client.
   - The enrich step now goes through `collectEach` as well, so a failed batch ends PARTIAL with the "did not answer" message instead of silently.
   - The "taking longer than usual" hint was not built: a read whose worker is down stays "Reading…".
- **Live check:** one post read was queued and the local worker started it, finished it on the next tick, stored it and booked $0.002 as "Post reads" in about 10 seconds.
- **Verified:** lint, ts:check, unit (974 in brain), build, and brain integration (82, including a workflow retry and a read retry). Not checked in a browser, because that needs sign-in.
- **Follow-up:** remove `MINDCASE_API_KEY` from the brain API deployment once this ships; the worker keeps it.
