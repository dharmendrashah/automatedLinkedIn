# Workflow engine, blocks and connections: learn from n8n, close the loopholes

- Status: locked <!-- draft | locked | in progress | done -->
- Created: 2026-11-01
- Locked by user: yes, 2026-11-02 ("yes and continue with defaults": every recommended answer below was accepted)

## Goal

Make runs, new blocks and connections work the way n8n's do where that makes workflows predictable and easy to extend: a run starts from the trigger that fired and walks the graph in a fixed order, a block runs only when something reaches it, a block has named outputs, and adding a block is one definition plus one executor. Close the engine loopholes found on the way, and keep what we already do better than n8n (saved steps, paid requests booked once, previews, items with an identity).

This is the parent plan. Each phase gets its own plan file when it starts, as the GTM phases did.

## How this was checked

- Our code at `main` (5109a40): `apps/brain/src/worker/engine/*`, `database/workflow*.ts`, `packages/contracts/src/workflow.ts`, `apps/body/src/components/workflows/*`, `prisma/schema.prisma`, and the plans that locked earlier product decisions (`free-form-workflows`, `gtm-phase-2-engine-canvas`, `gtm-phase-3-blocks-triggers`, `rich-blocks-merge`, `logic-wait-result-retry`, `run-workflow-block`, `wait-block-long-waits`, `api-fed-blocks-and-samples`).
- n8n: its documentation (docs.n8n.io, n8n 2.x) on execution order, data structure, nodes and node settings, error handling, sub-workflows, the Wait node, workflow settings, queue mode, node versioning, looping and merging. n8n's source code was not read.
- Six suspected loopholes were run for real against the local test database with a throwaway integration test (written, run, deleted; nothing of it is committed). They are marked "run". Items marked "read from code" were not run.

## Where we are today (verified)

| Topic | How it works now |
| --- | --- |
| A block | One entry in `BLOCK_TYPES` and `BLOCKS` (label, group, item kind in and out, zod config, form `fields`, presets, `api`) in contracts. Its behaviour is spread over: five capability sets (`ELSE_SOURCES`, `TAKES_ANYTHING`, `PASSES_ON`, `POOL_BLOCKS`, `VISIT_BLOCKS`), the `blockEstimate` switch, `PREVIEW_CAPS`, special cases in `validateGraph`, `EXECUTORS` in brain, two engine special cases (`SCORING_STEPS`, `output.markPosts` runs last), and in body `BLOCK_ICONS`, `summaryOf`, `flowOf`, `startConfig`, `UNITS`. Adding Retry or Write a post touched about eight places in three packages. |
| The graph | `nodes[id, type, config, position]`, `edges[from, to, fromSide, toSide]`, `loopRounds`; at most 50 blocks and 100 lines; any block to any block (owner decision 2026-10-17). A block has one output and no ports. |
| Branching | By convention: an If, Task result, Retry or Run another workflow keeps what it did not pass on under the item key `<id>~else`; an Else block reads it. The line has no "yes" or "no" handle. |
| Starting a run | `WorkflowService.startRun` creates a step for every block of the graph, whichever trigger fired. Trigger executors only return DONE. The run keeps a copy of the graph. |
| Walking the graph | Job `workflow-engine` (every 5 s) loops over all RUNNING runs of all users. `advanceRun` claims one ready step at a time (atomic `claim`) and runs it inline. Ready = the step's non-loop parents passed (all of them, an AND join), taken in the order the database returns the step rows. A step that waits throws `Waiting` and is given back. |
| Rounds | For each and loops add steps with `round + 1`; items are keyed `(runId, nodeId, round, slug)`; loops are capped (`loopRounds`, default 3, max 10) and stop early when nothing new comes back. |
| Data | `WorkflowItem` rows of three typed kinds (person, post, company) with an identity (slug), merged by slug; kept 14 days. Paid requests are saved before they are sent (`WorkflowStepCall`) and booked once (`SpendLedger`). |
| Errors | `StepError(message, code)`; an unhandled FAILED step ends the run at once; a failure a Retry or Task result looks at (`isHandled`) lets the run go on and end PARTIAL. |
| Stop | `stopRequestedAt`. Honoured by data blocks (no new requests), For each and loops (no new round), Wait, Run another workflow, the visit blocks, and Write a post (only while it waits). |
| Triggers | Run by hand, On a schedule (job `workflow-schedule`), When called by API (route, token, idempotency key), When another workflow finishes (`startAfter`, passes people only). One live run per workflow, checked with `findFirst` then `create`. A refused start is an API 409, a skipped schedule tick, a "no" answer or a failed "Run another workflow" step. |
| Sub-workflows | Run another workflow: do not wait, wait for yes or no, wait for results. "Results" are the people its Add to list blocks saved. |
| Versions | No version on a block or a graph. Changes go through additive defaults and SQL migrations of the stored JSON (the Wait migration). No workflow history. |
| Contracts in body | Body imports contracts as types only (the package builds CommonJS), so it keeps copies (loop constants, `hasLoop`, posting rules, prices) with parity tests. |

## What n8n does (from its docs)

- Items: every node gets and returns an array of items (`json`, `binary`); a node handles each item; fields are mapped with expressions such as `{{ $json.fruit }}` that the editor builds by drag and drop.
- Outputs: a node can have several outputs (IF true and false, Switch, "Continue (using error output)"); a line leaves from one of them.
- Order: v1 runs one branch to its end before the next, branches ordered by canvas position from top to bottom (leftmost on a tie); v0 (old workflows) runs the first node of each branch, then the second. Chosen per workflow in its settings.
- A node that outputs nothing ends its branch, unless "Always Output Data" is on. "Execute Once" uses the first item only.
- Errors: per node, Retry On Fail and On Error (stop the workflow, continue, continue using the error output); per workflow, an Error Workflow that starts with the Error Trigger and gets the execution, error, last node and mode; a Stop and Error node; a timeout; "save execution progress" to resume after a crash.
- Sub-workflows: Execute Sub-workflow starts a workflow whose trigger declares its input (fields, a JSON example, or accept everything); the data of the last node comes back; a setting says who may call it; the two executions link to each other.
- Wait: after a time, at a time, on a webhook call or a form. Waits over 65 seconds are saved to the database and resumed later.
- Scale: queue mode. The main process turns timers and webhooks into executions, Redis holds the execution ids, workers (10 in parallel by default) load the workflow from the database and write the result back. With several main processes one leader runs timers and pruning.
- Versions: each node in a saved workflow carries `typeVersion`; the workflow keeps running the version it was built with, new workflows get the newest.
- Editor: execute one step, disable a node, pin data, duplicate, notes, workflow change history.

## What we already do better (keep)

- Steps and their items live in the database, so a crash resumes by design (n8n does it only with the optional "save execution progress"). A Wait of days is a stored `waitUntil`.
- A paid request is saved before it is sent, never paid twice, booked once per client and month, and the wallet floor stops spending.
- Preview runs with caps; an irreversible step asks `markAttempt()` once and ends UNKNOWN when unsure, never retried.
- Items have an identity (slug), so the same person arriving by two lines is one person with both reasons, and dedupe against lists is natural.
- Loops and For each have rounds with caps and a wallet stop (n8n has no loop cap; only its optional workflow timeout ends a runaway loop).
- Retry and Task result work with every block and keep failed input for an Else; every failed step has a code with advice.
- The run keeps its own copy of the graph; Input and Output tabs show what every block took and gave; owner scoping and 14 day retention.

## Verified loopholes

Run on 2026-11-01 with a throwaway integration test (a real database, a fake data service, a fake HTTPS post):

| # | What happens | How it was run | Why it matters |
| --- | --- | --- | --- |
| L1 | Two starts at the same moment with different keys both become RUNNING runs of one workflow. `startRun` reads for a RUNNING run, then creates; only `runKey` is unique. | Six pairs of simultaneous starts (one MANUAL, one API); at least one pair left two live runs. | A schedule tick plus a click, or two API calls, double the spend and double any posting. The "one live run" rule is a promise, not a constraint. |
| L2 | Stop does not stop blocks that have not started. | input -> Wait 1 hour -> Send via API. Stop while it waits: the Wait ends at once and Send via API posts. | Read from code for the rest: Write a post checks the stop only after it has already made the post; Add to list still adds people. The owner presses Stop and a LinkedIn post can still go out. |
| L3 | A failure in one branch leaves a paid request of another branch unbooked. | trigger -> Find company from website (job in flight) and trigger -> Search people (fails: data service not configured). The run ends FAILED at once; the first request stays started with its supplier job id; after the supplier "finished", another `advanceRun` still did nothing. No ledger row, no cost on the run. | The supplier charges, our statement does not show it. |
| L4 | A block behind an empty branch still runs. | people -> If (everyone matches) -> Else -> Run another workflow and Send via API. The Else got nobody; the other workflow was still started, and Send via API still posted a page with no items. | Every block of the graph runs in every run. n8n ends the branch when nothing arrives. The same path makes Write a post post. |
| L5 | A run started by one trigger runs the chains of the other triggers. | An API start of a workflow with `API -> Profiles` and `Schedule -> Profiles`: the schedule chain's Profiles step passed its item. | Several triggers in one workflow cannot mean different things. |
| L6 | A person and a company with the same slug collapse into one item of a block. | `seedItems` with both under slug `stripe` kept one row (`@@unique([runId, nodeId, round, slug])`, `skipDuplicates`). | Mixed outputs (Merge) can silently lose items. Rare, but quiet. |

Read from code, not run:

- L7: ready steps are taken in the order the database returns them (`load` has no `orderBy`). It decides which of two independent branches goes first, so which one gets the budget when the wallet is low.
- L8: one engine loop serves every user. A slow step (Send via API: up to three tries of 10 s with pauses) delays all other runs. No tick duration is known yet; the cron monitor records it.
- L9: an API call made while a run is going gets 409 and is lost; a schedule tick in that time is skipped; "Don't wait" in a loop fails on its second start (already noted as a follow-up in `run-workflow-block.md`).
- L10: nothing tells the owner a run failed (no alert or email in the workflow code), there is no run-level timeout and no stuck-run check (retention never touches RUNNING runs).
- L11: workflows started after another, and "Wait for its results", receive people only (`listedPeople`); posts and companies do not travel.
- L12: which line of a cycle is the way back comes from a depth-first walk that starts at blocks with nothing before them, then follows the order the blocks were created, not what the owner drew (`backEdges`).
- L13: body copies logic from contracts (`hasLoop`, loop constants, posting rules, prices) and guards it with parity tests; the cause is the CommonJS-only contracts build.

## Verdicts: what to improve and what not

Verdict: Fix (a bug in ours), Adopt (copy the idea), Adapt (copy it in our shape), Keep (ours is right), Skip (do not build). Priority: M = closes a loophole or is needed to add blocks safely, S = parity that adds clear value, C = only if wanted.

| Area | n8n | Us | Verdict | Prio | Phase |
| --- | --- | --- | --- | --- | --- |
| Stop and failure leave nothing half done | Stops after the current node | Later blocks run; paid requests orphaned (L2, L3) | Fix | M | 0 |
| One live run per workflow | Parallel runs, instance-wide limits | Not atomic (L1) | Fix, then queue | M, S | 0, 4 |
| Item identity | Anonymous JSON items | Typed, slug identity, kind missing in the key (L6) | Keep, add kind to the key | M | 0 |
| A node is one definition | One node class with a description | About eight places (see above) | Adopt | M | 1 |
| Versioned blocks | `typeVersion` per node | None | Adopt | M | 1 |
| Test that a block is complete | n/a | Partly (`apiFed` tests) | Adopt (registry test) | M | 1 |
| Run starts from the fired trigger | Yes | Every block runs (L5) | Adopt | M | 2 |
| A branch with nothing ends | Yes (Always Output Data to override) | Every block runs (L4) | Adopt | M | 2 |
| Fixed run order | v1: top to bottom, leftmost on a tie | Database order (L7) | Adopt | S | 2 |
| Named outputs on lines | Several outputs per node | `~else` convention plus Else block | Adapt (ports, same item keys) | S | 3 |
| Loops | Cycles plus Loop Over Items (done, loop), no cap | Rounds with caps | Keep; maybe mark the way back explicitly | C | later |
| Merge and join | Merge node, waits per mode | AND join plus Merge block | Keep | - | - |
| Error handling per block | Retry On Fail, On Error | Retry and Task result blocks, work with every block | Keep | - | - |
| Error handling per workflow | Error Workflow, Stop and Error, timeout | Nothing (L10) | Adopt | S | 4 |
| Queue instead of refuse | Queue mode | 409, skipped ticks (L9) | Adapt (queue behind the live run) | S | 4 |
| Sub-workflow result and input | Last node's data, declared input | People only (L11) | Adapt (Return block, later an input contract) | S | 4 |
| Retry a failed run | Retry execution | None | Adapt (resume from the failed block) | S | 4 |
| Engine throughput | Workers, concurrency 10 | One loop (L8) | Measure first, then bound parallel runs | C | 4 |
| Long waits | Saved to the database, resumed | Stored `waitUntil` | Keep | - | - |
| Wait until something happens | Wait node resumes on a webhook call or a form | Only a timed Wait | Adapt: wait for our own events and approvals first; a public resume URL later | C | 5 |
| Queue and scale | Redis, workers, multi-main | RabbitMQ, brain worker, spider worker | Keep | - | - |
| Contracts usable in the browser | Shared core package | Types only (L13) | Adopt (dual ESM and CJS build) | S | 1 |
| Workflow history and restore | Change history | None | Adopt | C | 5 |
| Disable a block | Deactivate node | None | Adopt (pass through) | C | 5 |
| Run one block with sample input | Execute step, pin data | Preview run, sample item on the Input tab | Adapt (free blocks only) | C | 5 |
| Trigger registry, event triggers | Per type activation, polling, webhooks | Three hand-wired triggers | Adapt | C | 5 |
| Accounts as a typed link | Credentials per node, sub-node ports | Select accounts found "nearest before" | Keep for now | C | later |
| Expressions and Code node | Core feature | Out of scope (2026-10-17) | Skip; later `{{field}}` only in text settings a block needs | - | - |
| Whole workflow in one process | Yes | Saved steps, polled | Skip | - | - |
| Redis queue, community nodes, 400 integrations, binary storage modes | Yes | n/a | Skip | - | - |
| Save-execution toggles | Yes | Fixed retention for privacy | Skip | - | - |

## Target design

### A. One definition per block

```
defineBlock({
  type, version, group, label, summary,          // as today, plus version
  takes, gives,                                   // item kinds, 'any' replaces TAKES_ANYTHING
  outputs,                                        // ports, default one called main (phase 3)
  flags: { passesOn, keepsResults, usesAccounts, runsLast, ... },   // replace the five sets and the type checks
  liveness: 'items' | 'passes' | 'always',        // phase 2
  config, fields, presets, api,                   // as today
  estimate(node, incoming, available),            // replaces the blockEstimate switch
  previewCap,                                     // replaces PREVIEW_CAPS
  validate(node, graph),                          // replaces the special cases in validateGraph
  summarize(config),                              // replaces summaryOf and flowOf (needs the dual build, see G)
  migrate: { 1: config => ... },                  // upgrades saved settings when version goes up
})
```

- The executor stays in brain (`EXECUTORS: Record<BlockType, ...>`, compile-time complete). The icon stays in body. Nothing else is touched to add a block.
- The old exports (`ELSE_SOURCES`, `TAKES_ANYTHING`, `PASSES_ON`, `POOL_BLOCKS`, `VISIT_BLOCKS`) become values derived from the flags, so callers do not change in the same step.
- A registry test walks every definition: label and summary are set, `config.safeParse({})` is valid or says why not, every `fields[].key` is in the schema, `estimate` is pure and never negative, `previewCap` is a positive number, `migrate` covers every version up to the current one, the supplier-name guard passes. Brain's test checks an executor exists, body's an icon and a summary.
- Proof of "one definition": a test registers a made-up block with only a definition and an executor and runs it through `validateGraph`, `estimateGraph`, `previewGraph` and `advanceRun`.
- Parity guard for the refactor: a golden test of `catalog()` and of `validateGraph` for every template, taken before and compared after, so the move changes nothing.
- n8n's rule for versions: a saved block keeps the version it was built with; new blocks get the newest; changing behaviour means a new version with a `migrate`, never a silent change. A block type is never removed or renamed: it is retired with `deprecated: true` (hidden from the palette, still runs).

### B. Ports (connections)

- A definition lists its outputs, default `[main]`. If: `main` (matches), `else` (does not). Task result and Retry: `main` (worked), `else` (did not). Run another workflow: `main` (yes), `else` (no).
- An edge gets an optional `fromPort` (absent = `main`). The item key of a port is `main -> <id>`, any other port `-> <id>~<port>`, so the existing `<id>~else` rows are already the `else` port: no data migration.
- `forwardSources` and `inputKeys` read the port of the line instead of special-casing `logic.else`. `validateGraph` refuses a port the source does not have.
- The Else block keeps working (it reads the `else` port of the block before it) and becomes optional; a later "convert" action can rewrite `If -> Else -> X` as `If[else] -> X`. No forced migration.
- Canvas: one source handle per port (labelled), the line label keeps the item count. Handle ids must carry both the side and the port.
- Any block to any block stays. Merge keeps one input; no named inputs (YAGNI).

### C. Run model

1. Start and liveness (phase 2, as n8n). Triggers that fire: MANUAL and PREVIEW run all triggers, SCHEDULE the schedule triggers, API the API triggers, WORKFLOW the "when another workflow finishes" triggers; if none matches, all fire (so nothing that runs today stops). A block with no incoming line is live. A line is live when its source ran and gave something on that port: at least one item, or, for blocks that pass work on without needing items (Wait, Select accounts, Retry, Write a post), the fact that the source itself was live. Each definition says which (`liveness`), and an executor may report its live ports itself (Task result does: "worked" with zero items is still "worked"). A block with incoming lines runs when at least one is live (n8n's "any input has data"); otherwise it ends `SKIPPED` ("Nothing reached this block"), which counts as passed for readiness. Triggers are always live. `WorkflowRun.engineVersion` (default 1 for existing runs, 2 for new) lets a run that was in flight at deploy finish under the old rules, as n8n keeps v0 for old workflows.
2. Order (phase 2). Ready steps are sorted by the graph's depth, then canvas position (top to bottom, then left to right), then block id. Documented in the UI as "Lines at the top run first".
3. Wind down (phase 0). After Stop, or after an unhandled failure: no step that has not started may start (it ends `SKIPPED`, "Stopped before this block ran" or "A block before it failed"), no new paid request starts, started requests are looked at until they end and are booked, and then the run ends STOPPED or FAILED. Irreversible blocks also check the stop at their start. This reuses the existing Stop wind-down for data blocks.
4. One live run (phase 0, then 4). Phase 0: a partial unique index on `WorkflowRun(workflowId) WHERE status = 'RUNNING'`; a violation becomes the existing "still going" `ConflictError`. Phase 4: a start while a run is live is saved as `QUEUED` (up to a cap per workflow), starts when the live run ends, a schedule tick queues at most one, the API answers 202 with the queued status, and "Don't wait" in a loop queues instead of failing. Estimate and wallet are checked when the run actually starts.
5. Throughput (phase 4, only if measured). Look at the cron monitor's duration of `workflow-engine` first. If it matters, advance a few runs in parallel (the atomic `claim` already makes a step safe) and keep the 5 s tick.
6. Failure handling per workflow (phase 4). A workflow setting "when a run fails": tell me in the app (the bell, and the run page), later email or webhook, and optionally start another workflow with the run's facts (id, name, status, message, failed block) through the existing Run another workflow machinery. A "Stop with an error" block ends the run with a message the owner wrote. A stuck-run check ends a RUNNING run that has made no progress and holds no future `waitUntil` for a set time.
7. Sub-workflows (phase 4). A "Give back to the caller" block (group Output, takes anything): what reaches it is what "Wait for its results" and chained workflows receive, of any kind; with none, the people saved today. Later, an input contract on the child like n8n's input data mode.
8. Resume a failed run (phase 4). "Run again from the failed block" on the newest FAILED or PARTIAL run when nothing is live: the failed and not-started steps go back to waiting, finished steps and their items stay, paid requests already done are never paid again, the spend stays on the same run. Cheap here because steps and items are already saved; n8n re-executes.

### D. Versions and history (phase 1 for blocks, phase 5 for workflows)

- `version` on a definition and on each saved node (absent = 1); `readGraph` runs `migrate` up to the current version; the saved graph is rewritten on the next save. Runs keep their own copy, which is read the same way.
- Workflow history: one row per save (graph, saved at, by), the last 30 kept, "Restore this version" as a normal save (so it goes through the stale-save check).

### E. Editor parity (phase 5, only the ones wanted)

- Disable a block (a `disabled` flag; the engine passes its input on unchanged, like n8n).
- "Test this block" with the sample item (free blocks only, nothing paid, nothing sent).
- Workflow history and restore.

### F. Trigger registry (phase 5)

Today a new trigger means changes in three hand-wired places (the schedule job, the API route, `startAfter`). A small registry (`activate`, `deactivate`, how a firing starts a run) plus an event outbox (invite accepted, reply received, ...) would make "when a connection accepts" one definition. Needs a product decision; not part of the first rounds.

The same outbox lets a block wait for an event: "Wait for an event" (invite accepted, reply received, the owner or a client approves in the app) with a timeout, answering on two ports (happened, timed out). The timeout is the existing `waitUntil`; the resume comes from our own events (`LinkedInInviteService.markAccepted` already records an accepted invite, the message import sees replies). It needs phase 3 ports, and phase 4's queue, because a long wait holds the live-run slot. It matters once workflows can send invites and messages (today the account blocks are Select accounts, the two visit blocks and Write a post). A resume URL for outside systems can be added later on the same wait state with a resume token and one route.

### G. Contracts usable in the browser (enabler for A)

Build contracts as ESM and CommonJS (`tsup --format cjs,esm`, an `exports` map) so body can import runtime code (`summarize`, `validateGraph`, `hasLoop`, loop constants, prices) and the parity copies and tests can go. Without it, `summarize` has to be a declarative template carried in the catalog. Check the body bundle size after.

### H. Not copying, and why

- Expressions and a Code node: server-side user code is a security and support burden, and the owner kept it out of scope on 2026-10-17. Personalisation can come later as `{{field}}` in the text settings of blocks that need it (message, note), previewed on the sample item.
- Anonymous JSON items: our typed items with identity give dedupe, lists, do-not-contact and cost per client.
- Running a whole workflow in one process, Redis queue mode, community nodes, binary data modes, save-execution toggles: not needed, or we have an equal or better mechanism.
- A public resume URL (n8n's Wait on webhook or form): not now. Nothing calls back into a running workflow today, it would be a new unauthenticated entry point, and a run waiting on an outside system holds the workflow's only live-run slot. The useful form, waiting for something that happens inside our own system, is in F.
- Connections by block name: ours are by id.

## Requirements

Confirmed (your request, 2026-11-01):

- The workflow run, the way a new block is introduced, and how blocks connect should be architecturally close to n8n.
- Learn from n8n's architecture, close the loopholes and gaps in our workflow, and say what to improve and what not.
- Plan first; no code until you lock it.

Open questions: none. Answered 2026-11-02 with the recommended defaults (the list below is the record):

1. Empty branches (changes behaviour of existing workflows): a block runs only when something reaches it, as in C1, so a block behind an empty If, Else or Filter no longer runs. Recommended: yes, for all workflows, with `engineVersion` protecting runs in flight at deploy.
2. Which trigger runs: only the chains of the trigger that started the run; Run by hand and previews run all; if none matches, all run. Recommended: yes.
3. One live run per workflow: keep the rule, enforce it in the database, and queue extra starts (cap 10 per workflow; a schedule tick queues at most one; API answers 202 queued; beyond the cap 409). Recommended: yes. The alternative is parallel runs as in n8n, which makes double posting and double spend easier.
4. Ports replace the Else block for new graphs, while the Else block keeps working. Recommended: yes.
5. Contracts built as ESM and CJS so body can share runtime code (G). Recommended: yes; if no, summaries become declarative templates.
6. Failure alerts: first channel. Recommended: in the app (bell and run page); email or webhook later; error workflow through Run another workflow.
7. Block lifecycle: never remove or rename a block type; retire it with `deprecated`. Recommended: yes.
8. Phase 5 (history, disable a block, test a block, event triggers, wait for an event or approval): decide after phase 4. Recommended: defer; wait for an event is the first to build once workflows can send invites or messages.
9. Branches: one branch and PR per phase from `main` (PR 174 is merged). Recommended: `feat/workflow-engine-p0-safety`, then one per phase.

## Scope and non-goals

- In scope: phases 0 to 4 below, each with its own plan, migrations (additive only) and tests. Phase 5 only for what you choose.
- Out of scope: expressions or code blocks, new data sources, new LinkedIn actions, changing account limits, changing the money rules (wallet floor, ledger), a second queue technology, changing what the owner sees about the supplier.

## Approach

Each phase is its own PR with its own plan; tests first; the six repros become tests that assert the right behaviour.

- [x] Lock this plan (answers to the questions above).
- [x] Phase 0, safety (done 2026-11-02, branch `feat/workflow-engine-p0-safety`; plan `workflow-engine-p0-safety.md`):
   - [x] L1: partial unique index, one-time cleanup of any duplicate RUNNING rows in the same migration, catch the violation as "still going".
   - [x] L2 and L3: wind down on Stop and on failure (C3); irreversible blocks check the stop at their start; new step status `SKIPPED`.
   - [x] L6: `kind` in the item key (column, backfill from `data->>'kind'`, index swap).
   - [x] Inverted repro tests for L1, L2, L3, L6; engine unit tests for wind down.
- [x] Phase 1, one definition per block (done 2026-11-02; plan `workflow-engine-p1-block-definition.md`):
   - [ ] Golden test of `catalog()` and `validateGraph` before the move.
   - [ ] `defineBlock`, flags, derived sets, `version` and `migrate`, `deprecated`; move `blockEstimate`, `PREVIEW_CAPS` and the `validateGraph` special cases into definitions, one group of blocks at a time.
   - [ ] Registry tests (contracts, brain, body) and the made-up block test.
   - [ ] Dual build of contracts (if question 5 is yes); `summarize` in definitions; drop body's duplicated logic and its parity tests.
- [x] Phase 2, run semantics (plan `workflow-engine-p2-run-semantics.md`, done): `engineVersion`; fired triggers; liveness and `SKIPPED`; fixed order; the run page says why a block was skipped; inverted repro tests for L4, L5, L7.
- [x] Phase 3, ports (plan `workflow-engine-p3-ports.md`): `outputs`, `fromPort`, port item keys, validation, engine reads, If, Task result, Retry, Run another workflow ports, canvas handles, Else compatibility, tests, `MEMORY.md`.
- [ ] Phase 4, run lifecycle (plan `workflow-engine-p4-lifecycle.md`), each item its own step and go-ahead: queued runs; failure alerts and the stop-with-error block; stuck-run check; the give-back block; resume a failed run; engine parallelism only if measured.
- [ ] Phase 5 only for what you choose after phase 4.

## Edge cases and risks

- Existing graphs and runs: `readGraph` must keep reading graphs and run copies saved before (ports, versions and flags are optional; absent means today's meaning). Runs in flight at deploy have a step for every block and no `SKIPPED`; `engineVersion` keeps them on the old rules.
- Behaviour change for existing workflows (questions 1, 2, 3): blocks behind empty branches stop running, other triggers' chains stop running, a start during a live run queues. Say it in the release note and show "Skipped: nothing reached it" on the run page so nobody thinks the block broke.
- Migrations stay additive: the partial unique index fails if two RUNNING runs of one workflow already exist, so the same migration first ends all but the newest as STOPPED with a note (check the data with a SELECT first); `ALTER TYPE ... ADD VALUE` for `SKIPPED` and `QUEUED` cannot be used in the transaction that adds it, so no data change in that migration; the item key change touches a table of at most 14 days of rows, backfill from the JSON, deploy brain and worker together (same image) so no row is written without `kind`. Never reset or drop.
- Wind down must end: a started request that never answers is bounded by the data client's own retries and time limits; the stale claim (15 minutes) still frees a dead worker's step.
- Money: wind down books what was started and starts nothing new; resume never pays a finished request again (`SpendLedger.callId` is unique); a queued run checks the wallet floor and estimate when it starts, not when it queues.
- Liveness and loops: apply it per round; a For each batch with nothing ends its round's chain as skipped, and the loop stops early as today when nothing new comes back.
- `SKIPPED` must not read as "done with zero items" in the Runs tab, the canvas, the CSV and the block dialog; replay of old runs shows them as before.
- Ports: handle ids today are sides (`top`, `right`, ...) and are saved in `fromSide`; ports need their own id so a saved line keeps its side and its port. An unknown port is a validation error, not a silent `main`.
- Block definition refactor: a large move in a 3,500 line file. Do it in small steps with the golden test green after each; the executors do not move.
- Dual build: zod and the catalog grow body's bundle; measure; keep `sideEffects: false`.
- Security: no new endpoint in phases 0 to 3. Phase 4 alerts must not put block text or secrets in a notification, only ids and fixed sentences (as the job monitor does). Event triggers (phase 5) need signed or authenticated sources and rate limits.
- Dev and production: no new env var expected; Docker and CI unchanged apart from the contracts build. Rollback per phase: additive columns stay unused; the engine rules sit behind `engineVersion`, so setting the default back to 1 restores today's behaviour for new runs.
- Not verifiable here: behaviour with the real data supplier and real LinkedIn accounts; the browser views behind sign-in.

## Verification

- Each phase: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests, and for migrations the SQL read, applied to the local database and checked with `prisma migrate diff`.
- Phase 0 and 2: the six repros of this plan as integration tests asserting the correct behaviour (two starts leave one live run; Stop leaves later blocks skipped and the post unsent; a failed branch still books the other branch's request; an empty Else starts nothing and sends nothing; an API run skips the schedule chain; two kinds with one slug both stay).
- Phase 1: golden tests, registry tests, the made-up block test.
- Real path: run workflows through the compiled worker against the local database (Stop during a Wait, a failing branch next to a paid branch with the fake data service, two quick starts) and read the run page.
- State at the end what could not be run (live supplier, live LinkedIn, pages behind sign-in).

## Outcome

Filled in when done: what shipped, deviations, follow-ups (also copy durable ones to `MEMORY.md`).
