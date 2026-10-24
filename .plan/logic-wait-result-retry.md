# Logic blocks: Wait, Task result (yes or no) and Retry, for every block

- Status: built, waiting for the live run <!-- draft | locked | in progress | done -->
- Created: 2026-10-25
- Locked by user: yes, 2026-10-25 (answers below)

## Goal

Three logic blocks that work with **every block of a workflow**, not only the Account Actions blocks:

1. **Wait**: hold the run for a fixed number of seconds, or a random number between two values, before the next block runs.
2. **Task result**: a yes or no on whether the block before it worked, so what worked goes one way and what did not goes another.
3. **Retry**: run the block before it again, up to a number of times, when it did not work.

Examples: `Get commenters` -> `Retry (3)` -> `Task result` -> yes: `Add to list`, no (`Else`): `Export to CSV`; `Visit profile` -> `Retry (2)` -> `Task result` -> `Wait` -> next block.

## What exists today (checked in code, 2026-10-25)

- Blocks, groups and graph checks are in `packages/contracts/src/workflow.ts`; each block has one executor in `apps/brain/src/worker/engine/executors.ts`; the engine (`worker/engine/engine.ts`) runs a step per block (and per round of a loop or For each). The group "Logic" holds `If`, `Else`, `Run another workflow` and `For each`.
- A step ends `DONE`, `PARTIAL` (done with gaps, for example some data requests failed after their retries, or the wallet ran low) or `FAILED` (a step that could not go on: a `StepError`, or an unexpected error). **Any `FAILED` step ends the run as failed at once** (`advanceRun`), and a step only starts when every block before it is `DONE` or `PARTIAL`.
- A data block keeps one `WorkflowStepCall` per paid request. A finished request is never sent again; a failed one stays failed. Data requests that fail are already retried inside a tick by the data client (`advanceJob`); when they still fail the step ends `PARTIAL` with the message "The data service did not answer for some requests".
- A step can give itself back with `Waiting` and is looked at again on the next engine tick (every 5 seconds). A step has no start time and no "wait until" column (`WorkflowStepRun`: `claimedAt`, `childRunId`, `finishedAt`, ...).
- Two branches exist only as a convention: a block in `ELSE_SOURCES` (`logic.if`, `logic.runWorkflow`) keeps what it did not pass on under `<id>~else`, and an `Else` block after it reads that. Lines have no "yes" or "no" handle.
- The visit blocks (`worker/engine/visitPages.ts`) pass on only the people or companies viewed, retry a failed visit once on another account, treat a page that led away as final, and drop skipped people. Every visit is a `LinkedInPageVisit` row (`runId`, `nodeId`, `slug`, status `ASKED`, `DONE`, `NOT_AVAILABLE`, `FAILED`), so results can be read back per person.

## Proposal

All three go in the group "Logic" and take any items. "Working block" below means any block except Wait, Task result, Retry and Else; the block a Task result or a Retry looks at is **the nearest working block before it** (found like `nodeBefore`, going back along the lines). Nothing in a block's own settings changes.

### Wait (`logic.wait`)

- Settings: `mode` ("Exactly" or "Between"), `seconds` (1 to 3,600, for "Exactly"), `minSeconds` and `maxSeconds` (1 to 3,600, `min` not above `max`, for "Between").
- On its first claim the step picks its wait (the fixed value, or a random whole number between the two) and saves it as `waitUntil` on the step (new nullable column, additive migration). The engine does not start a step whose `waitUntil` is in the future; when it is due the step passes every item on unchanged. A restart keeps the same time; a random wait is never re-rolled.
- Accurate to about 5 seconds (the engine tick). A preview does not wait. A stopped run ends the wait at once. Each round of a loop or For each waits again.

### Task result (`logic.taskResult`)

- Setting: none.
- It reads how the block before it ended, for the whole step: **yes** when it ended `DONE` or `PARTIAL` (done with gaps), **no** when it ended `FAILED`. For a visit block it also splits per person: **yes** for people viewed, **no** for people whose page was not available or whose visits failed.
- Yes goes on as the block's output. No is kept under `<id>~else` for an `Else` after it: for a failed step, the items that reached the failed block (so something else can still be done with them); for a visit block, the people that did not go through.
- `ELSE_SOURCES` includes it. With no working block before it, it is an error.

### Retry (`logic.retry`)

- Settings: `times` (1 to 5): how many more tries the block before it gets after its first, and `waitSeconds` (0 to 3,600): the pause before each try.
- Retry sits **directly after** the block it repeats (a graph error otherwise, with the sentence "Retry goes right after the block it repeats").
- **Any block except the visit blocks:** when that block ends `FAILED`, or ends `PARTIAL` because requests failed (the "service did not answer" case), the engine does not let the blocks after it see that result yet: it resets the same step (`tries` + 1, new nullable `tries` column, clears the message and finish time, sets `waitUntil` when a pause is set) and runs it again. A reset keeps every request that went through (never sent or paid twice) and sends again only the requests that failed **without a charge**. After the last try the step ends as it ended.
- **Visit blocks:** a failed visit is a per-person result, not a failed step, so Retry raises the per-person limit instead: each person gets `times` more visits (on top of the built-in one on another account), preferring an account that has not failed them, always through the same round robin, limits and gaps.
- Retry then passes on what the block before it passed on; if the block ended `FAILED` after the last try, Retry is an `ELSE_SOURCES` block: its inputs go to `<id>~else`.
- The card says "a retry may cost more" for a block that costs money.

### Engine change for all of it

- A `FAILED` step no longer ends the run when a Task result or a Retry looks at it (it is "handled"): its inputs are kept under `<id>~failed`, it counts as passed with nothing to give, and the blocks after it start. The run ends `PARTIAL` ("done with gaps") instead of `FAILED`, and the message of the failed step is shown. A failed step nothing looks at ends the run as before, so existing workflows do not change.
- A step is not started before its `waitUntil` (used by Wait and by Retry's pause).

### Changes to the visit blocks

- They pass on **everyone they handled** (viewed, page not available, failed) so `Task result` can split them; skipped people (do-not-contact, viewed lately, own profile) and people left for the next run are still dropped and counted.
- They keep their built-in "one retry on another account" (owner's answer).
- `validateGraph` adds a note when a visit block's output reaches a block that keeps results (`Add to list`, `Export to CSV`, `Send via API`) without a `Task result` in between.

### Body

- Icons, one-line summaries ("Waits 30 seconds", "Waits 20 to 60 seconds", "Tries up to 3 more times"), flow text ("Takes anything, passes it on"), `Else` notes that name the new sources, and Wait's settings showing the fields of the chosen mode. A step that is being retried says "Try 2 of 4" in the run view.

## Requirements

Confirmed (from your requests): a wait with a fixed or a between-seconds time so the next block runs after it; a yes or no on whether a task succeeded or failed; a retry of the same task up to a number of times; and, the same day, that all three work with **all the other blocks**, not only the action blocks.

Answered by the owner on 2026-10-25 (defaults accepted, except as marked):

1. **What a visit block passes on.** Everyone it handled, so `Task result` can split them.
2. **Built-in retry of the visit blocks.** Keep it as well.
3. **Wait.** Once per step, 1 to 3,600 seconds, the random value picked once per step.
4. **Retry count.** N more tries after the first, 1 to 5.
5. **What Retry repeats.** Only failures, not "page not available".
6. **Which account (visit blocks).** An account that has not failed this item first, then the usual order.
7. **Delay between tries.** A setting on Retry, "wait between tries" (0 to 3,600 seconds). (Changed from "put a Wait before Retry": with Retry re-running the block itself, a Wait after it cannot pause between tries.)
8. **Where they appear.** The group "Logic", labels "Wait", "Task result", "Retry".
9. **Which tasks.** Every working block (changed from the visit blocks only).
10. **Every block.** Task result "yes" when the block ended done or done with gaps, "no" when it failed; Retry re-runs the same step up to N more times when it failed or ended with gaps because requests failed.
11. **A failure that Task result or Retry looks at stops nothing.** The run goes on and ends "done with gaps".
12. **Paid blocks.** A retry re-sends only requests that failed without a charge, stays above the wallet floor, and can cost more than the estimate (the card says so).
13. **Where Retry goes.** Directly after the block it repeats; `Task result` and `Wait` come after it ("Visit -> Retry -> Task result -> Wait").

## Scope and non-goals

- In scope: the three blocks (catalog, config, graph checks, executors), the migration (`waitUntil`, `tries` on `WorkflowStepRun`), the engine changes above (handled failures, waiting steps, step reset for Retry), the visit blocks' output change, body icons and summaries, tests, `MEMORY.md`.
- Out of scope: branches with their own "yes" and "no" handles on the canvas, waiting for a time of day, waiting between items, retrying a request that failed after being charged, a different retry count per block kind, changing any account limit.

## Approach

- [x] 1. Lock this plan.
- [x] 2. Contracts, tests first: three catalog entries and configs (`min` not above `max`), `workingBlockBefore`, `retriesOf(graph, nodeId)`, `ELSE_SOURCES`, `validateGraph` (Task result and Retry need a working block before them, Retry directly after it, the keep-results note), estimate default and a note on Retry's cost.
- [x] 3. Migration `add_step_wait_and_tries` (create-only, folder name sorts last, read the SQL, apply to both local databases); `WorkflowRunService`: save `waitUntil`, reset a step for a retry (reopen only the failed calls that cost nothing), keep a failed step's inputs under `<id>~failed`.
- [x] 4. Engine, tests first: a `FAILED` step nobody looks at still ends the run; a handled one does not; a step with a future `waitUntil` does not start; a block that ends `FAILED` or `PARTIAL` with failed requests is reset up to `times` times, then ends as it ended; finished requests are never sent again.
- [x] 5. Wait executor (fixed, between, saved time kept, preview skips, stop ends it); `Task result` and `Retry` executors (step level); visit blocks: pass on everyone handled, per-person results, per-person limit raised by Retry; unit tests for each rule.
- [x] 6. Integration tests with Postgres through the engine: (a) a data block whose requests fail once then succeed, with `Retry`; (b) one that keeps failing, with `Task result` and an `Else`; (c) a `FAILED` step with a `Task result` after it and the run ending "done with gaps"; (d) `Wait` between blocks; (e) a visit block with one account failing, `Retry` and `Task result`; nothing asked or paid twice after a restart.
- [x] 7. Body: icons, summaries, flow text, mode-dependent fields, "Try 2 of 4" in the run view; helpers tested first.
- [ ] 8. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, all warnings fixed, brain integration tests; `MEMORY.md`; plan done. One live run waits for your go-ahead.

## Edge cases and risks

- **Existing workflows.** A `FAILED` step nobody looks at behaves as before. A workflow with a visit block (built the day before, not released) now passes on everyone handled; the note on keep blocks points at `Task result`.
- **Money.** A retried data block re-sends failed requests; only ones that failed with a zero charge are reopened (a charged one has a `SpendLedger` row keyed by the call, so it is never reopened). The wallet floor is checked fresh before every new request, so a retry stops when the wallet runs low, like any step. The pre-run estimate does not include retries; the card says so.
- **Deterministic failures.** A `StepError` such as a deleted ideal customer fails the same way every try; retrying it wastes only time (a few ticks), and the last try ends as `FAILED`. The Retry card hint says that retrying fixes busy services, not wrong settings.
- **Handled failures and what comes after.** A handled failed step counts as passed with an empty output, so a block connected to it directly (not through Task result or Retry) runs on nothing instead of blocking the run forever. The run's final status shows the gap.
- **Wait and the run clock.** A wait counts toward the 8 hour limit of a visit step; waits are capped at 1 hour. A restart keeps `waitUntil`; the tick is 5 seconds, so 1 or 2 second waits are really up to 5.
- **Retry and loops.** Each round has its own step row with its own `tries`, so a loop or For each retries per round. Retry inside a loop is bounded by the loop's rounds as well.
- **Retry and the account rules (visit blocks).** Extra tries are new visits and count against the 15 a day cap and the 3 minute gap; with one account 5 extra tries take at least 15 minutes. The 8 hour limit applies.
- **Several candidates.** The nearest working block wins; Retry must be directly after its block (error otherwise), so there is nothing to guess. Task result takes the nearest working block through Retry, Wait and Else.
- **Concurrency.** The reset is one update guarded by `status` and `tries`, so two workers cannot reset the same step twice; claiming stays as is (`claimedAt`).
- **Security and privacy.** Results are read per owner; messages hold counts only, never page content. Nothing names the data supplier.
- **Dev vs production, Docker, CI.** No new env var or dependency. Rollback: remove the three catalog entries and the engine branches; the two columns stay unused.
- **Not verifiable here.** How often the real data service fails in a way a retry fixes, and how long a retry cycle takes with real accounts.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; brain integration tests with Postgres.
- One live run (with your go-ahead): a workflow with `Wait`, `Retry` and `Task result` around one data block and one visit block. State what could not be run.

## Outcome

Built on `feat/select-accounts-block` (steps 1 to 7 done; step 8 waits for a live run with your go-ahead). Shipped: contracts blocks `logic.wait`, `logic.taskResult`, `logic.retry` (group Logic) with `workingBlockBefore`, `retriesOf`, `isHandled`, `TAKES_ANYTHING`, `PASSES_ON`, a `showWhen` form with `is`, and graph checks (Task result and Retry need a block before them; Retry goes right after its block; a note when a visit block feeds a block that keeps results without a Task result); migration `add_step_wait_and_tries` (`waitUntil`, `tries` on `WorkflowStepRun`); `WorkflowRunService.setWaitUntil` and `retryStep` (reopens only failed requests that cost nothing); engine: a failed step that a Task result or Retry looks at no longer ends the run (its inputs are kept under `<id>~failed`, the run ends "done with gaps"), a step is not started before its `waitUntil`, and a block that fails, or ends with failed requests, is reset up to the Retry's number of times; executors in `worker/engine/logicBlocks.ts`; the visit blocks pass on everyone handled and take their per-person tries (2 built in, plus the Retry's) and the pause from the Retry after them; body icons, card summaries, mode-dependent fields for Wait, "(try N)" in the run view.

Compatibility with every block: Task result and Retry look at the nearest block before them that is not Wait, Task result, Retry or Else, so a block added later works with them with no change; `TAKES_ANYTHING` and `ELSE_SOURCES` are the two sets a new logic-style block joins.

Deviations: the Wait message does not say how long it waited (a step has no start time); Retry on a block that ends with failed requests only retries when at least one failed request can be reopened (one that cost nothing), otherwise it ends as it ended; one Retry try for a data block is a full new round of the data client's own retries (1, 2, 5, 15, 30 minutes), so a retry of a busy data service can take long.

Checks: lint, `ts:check`, unit tests (contracts 180, body 578, brain 1,226, spider 1,022), build, brain integration (167, including six runs through the engine: a failure nobody looks at still fails the run, a Task result with an Else, Retry up to its number, a retry pause, a data block whose failed request is sent again and then works, and a Wait). Not run: a live run; how long a retry cycle takes against the real data service.
