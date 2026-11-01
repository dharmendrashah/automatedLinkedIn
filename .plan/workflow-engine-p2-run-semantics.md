# Workflow engine phase 2: run semantics

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-02
- Locked by user: yes, 2026-11-02 (phase 2 of [workflow-engine-n8n-alignment.md](workflow-engine-n8n-alignment.md); questions 1 and 2 answered with the recommended defaults; same branch as phases 0 and 1)

## Goal

A run starts from the trigger that fired, a block runs only when something reaches it, and ready blocks go in a fixed order. This closes L4 (a block behind an empty branch still runs), L5 (a run started by one trigger runs the other triggers' chains) and L7 (the order of two ready blocks is chance).

## Requirements

Confirmed (parent plan, question 1 and 2):

- Which triggers fire: Run by hand and previews fire all; a schedule run fires the schedule triggers; an API run the API triggers; a run started by another workflow the "when another workflow finishes" triggers; if none of those exists in the graph, all fire (nothing that runs today stops).
- A block with no line into it is live. A line is live when its source ran and gave something on that output: at least one item, or, for a block that passes work on without needing items (Wait, Select accounts, Write a post), the fact that it was live. A trigger that fired is live. A block with lines into it runs when at least one is live, otherwise it ends `SKIPPED` ("Nothing reached this block"). Blocks that decide for themselves (Task result, Retry, Run another workflow) report which outputs are live.
- Order: depth first, one branch to its end before the next; children ordered by canvas position, top to bottom, left to right on a tie, then by id.
- `WorkflowRun.engineVersion` (1 for runs that exist, 2 for new runs) keeps a run in flight at deploy on the old rules.

Open questions: none.

## Scope and non-goals

- In scope: contracts (`liveness` on definitions, `isFired`, `executionOrder`, `portOfEdge`, `isTrigger` exported), migration (`engineVersion`, `emits`), engine (fired triggers, liveness, skipping, order, `emits`), executors of Task result, Retry and Run another workflow report their outputs, tests, MEMORY.md.
- Out of scope: ports on lines (phase 3), queued runs (phase 4), a line in the UI explaining the order.

## Approach

- [x] 1. Tests first: contracts (`isFired`, `executionOrder`, `portOfEdge`), integration (an empty Else starts nothing and sends nothing; an API run skips the schedule chain, a manual run runs both, no matching trigger runs all; a Wait keeps the run alive with no items; an input with nothing ends its branch; a run of engine version 1 behaves as before).
- [x] 2. Migration `workflow_engine_version_and_emits` (additive); `startRun` makes runs of version 2.
- [x] 3. Contracts: `liveness` on the definitions (triggers `always`; Wait, Select accounts, Write a post `passes`), `isFired`, `executionOrder`, `portOfEdge`.
- [x] 4. Engine: ready steps in order; a step skips when nothing reaches it; a step's `emits` saved at its end; SKIPPED counts as passed for readiness.
- [x] 5. Task result, Retry and Run another workflow report their outputs.
- [x] 6. Gates, MEMORY.md, commit.

## Edge cases and risks

- Existing runs: `engineVersion` 1 skips none (only a stop or a failure skips, as in phase 0); the new rules apply to runs created after the deploy.
- A handled failure still lets its handlers run: a failed step that a Task result or Retry looks at emits `main`, so a Wait in between and the handler itself are live; a block wired straight to it runs on nothing, as before.
- A join: a block with several lines runs when any is live; a dead branch's step is SKIPPED and counts as passed.
- Loops and For each: liveness is judged per round with the round's own parents; a block that restarts a loop (no parent step in the round) is live.
- A block that needs items but gets none is skipped, which is also what ends a branch whose input found nothing; the run still ends SUCCEEDED when nothing failed.
- Order only decides which of two ready blocks starts first; it never delays a block that is ready.
- Rollback: set the default of `engineVersion` back to 1 for new runs.

## Verification

- `pnpm lint && pnpm ts:check --force && pnpm test:unit:run && pnpm build`, all brain integration tests.
- The repros of L4 and L5 as tests asserting the right behaviour.

## Outcome

Shipped: `engineVersion` and `emits` (migration `20261102010000_workflow_engine_version_and_emits`); contracts `liveness`, `isTrigger`, `RunStart`, `isFired`, `executionOrder`, `portOfEdge`; engine skips a block nothing reaches, starts only fired triggers, and orders ready steps; Task result, Retry and Run another workflow report `emit`. Tests: contracts `runSemantics.unit.test.ts`, brain `liveness.integration.test.ts`. The run page already shows a SKIPPED step's message. Deviations: an Else nobody reaches is SKIPPED (not DONE). Follow-ups: ports on lines (phase 3).

Verified: lint, `ts:check --force`, unit tests, build, all brain integration tests. Not run: a live LinkedIn run, a browser.
