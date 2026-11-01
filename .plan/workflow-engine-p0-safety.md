# Workflow engine phase 0: safety fixes (one live run, Stop and failure wind down, item key)

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-02
- Locked by user: yes, 2026-11-02 (phase 0 of [workflow-engine-n8n-alignment.md](workflow-engine-n8n-alignment.md), no product decision needed)

## Goal

Fix four loopholes of the workflow engine that were reproduced on 2026-11-01: two live runs of one workflow (L1), Stop that does not stop blocks that have not started (L2), a failure in one branch that leaves another branch's paid request unbooked (L3), and a person and a company with the same slug collapsing into one item (L6).

## Requirements

Confirmed (parent plan, locked 2026-11-02):

- L1: one live run per workflow is enforced by the database; a second start gets the existing "still going" answer.
- L2 and L3: after Stop, or after an unhandled failure, no block that has not started may start, no new paid request starts, requests already started are looked at until they end and are booked, then the run ends STOPPED or FAILED.
- L6: the kind is part of an item's identity in a block's output.
- Migrations are additive; never reset or drop.

Open questions: none.

## Scope and non-goals

- In scope: a new step status `SKIPPED`; the wind down in `advanceRun`; the stop check at the start of Write a post; the partial unique index and the cleanup of duplicate RUNNING rows; `kind` in the item key; the body showing `SKIPPED`; tests; `MEMORY.md`.
- Out of scope (later phases): skipping blocks behind empty branches, the fired trigger, step order, ports, queued runs, alerts, resume.

## Approach

Each step starts with a failing test (the repro of 2026-11-01 turned around).

- [x] 1. L1: migration `20261102000000_workflow_run_one_live` (create-only, read the SQL): end all but the newest RUNNING run of a workflow as STOPPED with a message, then `CREATE UNIQUE INDEX "WorkflowRun_workflowId_running_key" ON "WorkflowRun"("workflowId") WHERE "status" = 'RUNNING'`. `startRun` turns a violation of that index into the "still going" `ConflictError`; a violation of `runKey` keeps its own message.
- [x] 2. L6: migration `20261102000100_workflow_item_kind` (add `kind`, fill it from `data->>'kind'`, NOT NULL, new unique index with the kind, old one dropped); `WorkflowRunService` writes and upserts with the kind.
- [x] 3. L2 and L3: migration `20261102000200_workflow_step_skipped` (add the enum value only). Engine: when the owner asked to stop or a step failed with nothing looking at it, steps that have not started end `SKIPPED`; after a failure, started steps with no request still open end PARTIAL ("ended early"); started steps with open requests go on in a mode that starts nothing new (`collectEach` reads `unhandledFailure`); the run ends once nothing is open. Write a post checks the stop before it makes a post.
- [x] 4. Body: `SKIPPED` in the step label, the block state, the canvas icon and the block dialog.
- [x] 5. Gates, integration tests, `MEMORY.md`, plans done, commit on `feat/workflow-engine-p0-safety`.

## Edge cases and risks

- Duplicate RUNNING rows already in a database would make the index fail: the same migration ends all but the newest first (a live row is never deleted).
- `ALTER TYPE ... ADD VALUE` cannot be used in the transaction that adds it: the enum migration changes no data.
- The item key change: rows are at most 14 days old; the backfill reads the JSON kind; brain and worker ship in one image, so no row is written without a kind after the deploy. An item whose JSON has no readable kind would break NOT NULL: the backfill uses `COALESCE(data->>'kind', 'profile')`.
- Wind down must end: a started request that never answers is bounded by the data client's retries and time limits; the 15 minute stale claim frees a dead worker's step.
- A step that was started and then released (waiting for its requests, or reset by a Retry) is "started"; only steps never taken (`startedAt` null) are skipped.
- A Retry's pause (`waitUntil`) on a step that still has open requests must not hold the wind down: the pause is ignored while winding down.
- Money: wind down books what was started and starts nothing new; `SpendLedger.callId` stays unique, so nothing is booked twice.
- `SKIPPED` must not break old readers: body shows it as its own state; `markPosts` already treats any non-DONE step as "the run did not finish fully".
- Rollback: the index, the column and the enum value stay unused if the code is reverted.

## Verification

- Integration tests (real Postgres, fake data service): two starts at once leave one live run; Stop during a Wait leaves Send via API unsent, the step SKIPPED and the run STOPPED; a failing branch next to a paid branch still books the paid request and ends FAILED; a person and a company with one slug both stay.
- Unit tests for the new engine decisions where they are pure.
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests, migrations applied to both local databases and `prisma migrate diff` clean.
- Not verifiable here: the real data supplier and LinkedIn; the pages behind sign-in.

## Outcome

Shipped as planned. L1: one RUNNING run per workflow in the database (partial unique index; the migration first ends all but the newest of any doubled runs; checked on a scratch database with doubled rows); `startRun` answers "still going" to the start that loses the race. L6: `WorkflowItem.kind` is part of the key (backfilled from the stored item). L2 and L3: new step status `SKIPPED`; after Stop or an unhandled failure the engine skips every step never taken, after a failure ends started steps that wait on no paid request (a Wait of days no longer holds a failed run), and lets steps with an open paid request go on, starting nothing new, until the request ends and is booked; `collectEach` stops new requests after a failure (new message); Write a post makes no post once the run was stopped. Body: `SKIPPED` shows as its own state (label, canvas icon, block dialog with the reason).

Deviations: no `Context.windDown` field; `collectEach` asks `unhandledFailure(run, graph)`, which now lives in `context.ts`. The old integration test "end a long wait at once when the owner stops the run" expected Export to CSV to still run after Stop; it now expects it `SKIPPED` (the rule is the same for every block).

Found on the way: the Turborepo cache gave a false pass for `pnpm ts:check` in body after a Prisma enum changed (the generated client is not one of body's inputs); `pnpm ts:check --force` or `pnpm --filter @automatedLinkedIn/body ts:check` shows the truth. The database does not return step rows in a stable order (updated rows move), which is loophole L7; the new tests hold a block behind a one second Wait named `gate` when they need an order.

Checks: lint, forced `ts:check`, unit tests (contracts 249, spider 1,358, body 945, brain 1,625), build, brain integration (55 files, 341 tests, the wind-down test file run three times for stability), migrations applied to both local databases with `prisma migrate diff` clean. Not run: the compiled worker loop on a long run, the real data supplier, the pages in a browser.

Follow-ups: phase 1 (one definition per block), then phase 2 (fired trigger, empty branches, order).
