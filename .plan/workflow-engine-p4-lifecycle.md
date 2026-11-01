# Workflow engine phase 4: run lifecycle

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-02
- Locked by user: yes, 2026-11-02 (phase 4 of [workflow-engine-n8n-alignment.md](workflow-engine-n8n-alignment.md); questions 3, 6 and 7 answered with the recommended defaults; "deploy all 5 phases at once", same branch as phases 0 to 3)

## Goal

A run can be stopped on purpose with a message, a stuck run frees its workflow, a start while a run is live waits its turn instead of being lost, the owner is told when a run failed, a workflow can give back more than people, and a failed run can go on from the block that failed.

## Requirements

Confirmed (parent plan, questions 3, 6, 7 and sections 4 to 8):

- Stop with an error: a block (`logic.stop`, Logic group, nothing after it) that ends the run as FAILED with the owner's message. It runs only when something reaches it (phase 2 rules).
- Stuck-run check: a job ends a RUNNING run with no step started or finished for 36 hours, no wait or retry ahead, and no run it waits for. The run fails with code `RUN_STUCK`.
- Queued runs: a start while a run is live is saved as `QUEUED` (up to 10 per workflow); the engine tick starts the oldest when the live run ended (wallet floor checked then); a schedule tick queues at most one; a preview, and a start by "Run another workflow" (a parent waits for it, so queuing could deadlock), still refuse; the API answers 202 with the status; Stop cancels a queued run at once.
- Failure alerts: a failed run shows in the app (the bell and the run page), with a dismiss; no block text or secrets, only ids and fixed sentences.
- Give back: a block (`output.return`) whose items are the run's result for a caller ("Wait for its results", chained workflows), of any kind; without one, the people saved to lists as today.
- Resume: "Run again from the failed block" on the newest FAILED run (a PARTIAL run is left out, see Outcome) when nothing is live: failed and not-started steps go back to waiting, finished steps and their items stay, paid requests are never paid again.

Open questions: none. Deferred, with the parent plan's reasons: engine parallelism (not measured), the error workflow and email or webhook alerts (no block can consume run facts yet).

## Scope and non-goals

- In scope: contracts (blocks, codes), migration (`QUEUED`; alert and resume columns if needed), brain services, engine, jobs, tRPC, body labels and surfaces, tests, MEMORY.md.
- Out of scope: parallel engine, email and webhook, error workflow, an input contract on a child.

## Approach

- [x] 1. Stop with an error block: contracts, executor, icon, tests.
- [x] 2. Stuck-run check: `endStuck`, `failUnfinished`, job `workflow-watchdog`, tests.
- [x] 3. Queued runs: migration, `startRun`, promotion in the engine tick, stop of a queued run, body labels, tests updated.
- [x] 4. Failure alerts.
- [x] 5. Give-back block.
- [x] 6. Resume a failed run.
- [x] 7. Gates, plans, MEMORY.md, commit.

## Edge cases and risks

- QUEUED values: the enum value is added in its own migration (it cannot be used in the transaction that adds it). Code that lists live runs reads `RUNNING` only, so a queued run is invisible to the engine until promoted.
- Deadlock: a child started by "Run another workflow" never queues (its parent waits for it), so a cycle cannot wait on itself.
- Two promotions at once: the partial unique index on `RUNNING` makes the second fail; it is caught and left queued.
- A queued run keeps the graph it was saved with; the owner may edit the workflow meanwhile.
- A stuck run that holds paid requests: calls with a retry ahead keep it alive; others are ended.
- Rollback: new values and columns are additive; older code ignores `QUEUED` runs (they would never start).

## Verification

- `pnpm lint && pnpm ts:check --force && pnpm test:unit:run && pnpm build`, all brain integration tests.

## Outcome

Shipped: `logic.stop` (Stop with an error, code `STOPPED_BY_BLOCK`); job `workflow-watchdog` (`endStuck`, `failUnfinished`, code `RUN_STUCK`, 36 hours); queued runs (migration `20261102020000_workflow_run_queued`; `admit` in `startRun`, cap 10, one scheduled run waiting, `promoteWaiting` in the engine tick, Stop cancels a queued run, retention keeps queued runs, body label, sentence, polling and Cancel button, API text); failure alerts (migration `20261102030000_workflow_run_alert_dismissed`; `alerts` and `dismissAlert`; popover in the header); `output.return` (Give back: `returned`, used by "Wait for its results" and chained workflows, `trigger.workflow` accepts any kind); resume (`reopen`, `resume`, `resumeRun`, button on the run page). Tests: `workflowRun.stuck`, `workflowQueue`, `workflowAlerts`, `resume`, parts of `liveness` and `freeForm` integration tests; run-sentence unit test.

Deviations:
- Resume takes a FAILED run only. A PARTIAL run has handlers that already ran, so a retried block would not feed them; it needs its own design.
- A resumed run's `startedAt` is set to now (it is live again; it keeps the watchdog away from a run whose old steps finished long ago).
- A queued run is created with its graph and estimate at queue time; the wallet floor is checked again when it starts.
- A child started by "Run another workflow" refuses instead of queuing (deadlock), so "Don't wait" in a loop still fails with a clear message instead of queuing.
- The give-back result key in a chained run's input stays `people` (it now holds items of any kind).
- Engine parallelism, email or webhook alerts and the error workflow are deferred, as the parent plan said.

Verified: lint, `ts:check --force`, unit tests, build, all brain integration tests. Not run: the header alerts popover, the Cancel and resume buttons, in a browser; the migrations on the dev database (only on the integration template).
