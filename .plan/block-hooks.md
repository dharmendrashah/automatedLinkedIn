# Block hooks: before, on and after on every block

> Superseded on 2026-11-03 by [workflow-events-and-hooks.md](workflow-events-and-hooks.md), which merges this plan with `task-events.md` and resolves the edge cases found in review. Kept as the record of the owner's answers of 2026-11-02; build from the merged plan.

- Status: superseded <!-- draft | locked | in progress | done | superseded -->
- Created: 2026-11-02
- Locked by user: yes, 2026-11-02 <!-- change to "yes, <date>" only after the user confirms -->

## Goal

On the workflow canvas, every block can carry three attached chains: before, on and after. When that block runs, the engine fires the matching hook with a JSON event, and the blocks attached there run inside the same run. Example: attach to "Withdraw connection request" an after chain that checks what happened and tells your own system; attach to a read block a before chain that records what it is about to take.

This is the in-canvas sibling of `.plan/task-events.md` (events of spider tasks that start other workflows). Block hooks are the events of a block's own step inside the run that is going now.

## What exists today (checked in the code, 2026-11-02)

- One graph per workflow: nodes and edges stored as JSON (`Graph` in `packages/contracts/src/workflow.ts`). An edge may carry `fromPort` (any string up to 20 characters); `main` is the default and `else` exists for If, Task result, Retry and Run another workflow (`outputsOf`, `ELSE_SOURCES`, `portKey`, `portOfEdge`). Items of a non-main port are stored under `portKey(nodeId, port)`, for example `<id>~else`, so another port name needs no new item storage.
- `validateGraph` rejects an edge whose `fromPort` is not in `outputsOf(from.type)`, so a hook port needs one explicit rule; it also rejects duplicate edges and flags cycles through the back-edge logic that the engine reads as loops.
- The engine (`apps/brain/src/worker/engine/engine.ts`): a step per node is created when the run starts (`WorkflowStepRun`, `@@unique([runId, nodeId, round])`); a step is ready when every forward parent passed (`PASSED`) or is a handled failure; it is SKIPPED when it has forward lines in and none is live (`emits`, saved when the step ends: `main`, `else`); roots (no incoming line) are live; triggers are live only when `isFired`. Each executor returns `StepResult { status, itemsIn, itemsOut, message?, errorCode?, emit? }`. `WorkflowRun.engineVersion` (2 for new runs) lets a new rule apply only to new runs.
- Account blocks go through domain services; each act is one `AccountActionCall` row (run, block, person, account). Queued acts (reply) make the step wait for each to go; Send connection request ends when the invite is planned and the invite goes out later through the invite-send job.
- The canvas is React Flow (`workflow-canvas.tsx`, `block-node.tsx`, `graph-convert.ts`): the Else output is a separate handle `port:else`, saved as `fromPort: 'else'`; `canConnect` limits connections.
- Rounds (checked 2026-11-03): a For each or a loop repeats a `RepeatRegion` (`kind`, `start`, `nodes`); at the end of a round `nextRound(run, graph, round)` (`engine.ts`) lists the region's nodes and `WorkflowRunService.addRound` creates their step rows for round + 1 with `skipDuplicates`, so a repeat creates nothing twice. Loops run at most `MAX_LOOP_ROUNDS` (10); a For each runs once per batch (`batchSize` 1 to 500). Steps are only created for the nodes the region lists, so today a chain hanging on a block in a region would have a step for round 0 only.
- Spend limits (checked 2026-11-03): the limits that exist are the wallet floor checked when a run starts (`startRun`, `WalletService.belowFloor`), the same check before every paid request (`walletLow` in `worker/engine/context.ts`, which stops the step), the estimate shown before a start, and the cost kept per step (`costMicros`). There is no per-run spend cap. Every block runs through the same executors and that same paid-request path, so a block in a hook chain is under exactly the same limits with no hook-specific code, provided its steps go through the engine like any other.
- About 33 places read `graph.edges` directly (contracts: ordering, back edges, validation, parents; brain: `engine.ts` x2, `executors.ts`, `context.ts`, `core/workflowInput.ts` x2; body: canvas, layout, api-sample, graph-convert, block-run-tabs). A hook line must not change what any of them mean for the main flow.
- `output.sendApi` posts what reaches it as JSON; `output.return`, `process.tag`, the account act blocks and the logic blocks already exist.

## Requirements

Confirmed (from the owner's request):

- Every block can have a before, an on and an after attached.
- They are blocks on the canvas, attached to that block.
- Each receives the event as JSON (block, settings, input, result, times, run, and for account blocks the account, proxy and task).

Decided with the owner (2026-11-02):

- Before fires when the block is about to start (its inputs are known, nothing has been done). On fires when the block is working: for a block that starts a spider task, when the worker reports the first task started (the same `tasks.started` message as the task events plan), for every other block when its step starts. After fires when the step reaches its final state, with the result.
- Observe only: a hook is never implied to delay, stop or change its block, and a failed hook does not fail the block or the run. The one exception is a block the owner puts in the chain on purpose: a Stop block stops the run, because that is what Stop does.
- Hooks exist for every block, now and later, with no code per block.
- Same canvas: three small pills on each block, dashed lines to the attached chain.
- The run ends when its hook chains end (a Wait inside a hook delays the run's end and holds the workflow's live-run slot).
- Every block may sit inside a hook chain, including blocks added later: input blocks, paid blocks, Stop and Retry. There is no block flag that forbids it; the guards are in "What the unrestricted chain means".
- A hook step must sit under the run's spend limits (owner, 2026-11-03: yes). It does by construction (the shared paid-request path above) and the plan adds tests that prove it: a paid block in a hook stops when the wallet is low and the host is not affected; its cost counts in the run's `costMicros`; `estimateGraph` shows the chain's cost per fire.
- A hook chain must have a step for every round of the block it hangs on (owner, 2026-11-03: yes), for a For each batch and for every loop round, up to the existing maxima.
- A block's after fires when its step ends, never later. For Send and Withdraw connection request that is "planned": the invite goes out later and the spider task returns its result then. The owner builds a second workflow on the task events trigger (`.plan/task-events.md`) to react to what the task did (note sent or not, withdrawn or not). No fourth "settled" phase and no waiting inside the hook. (The owner first ticked "make after wait" and then wrote that it does not matter because the spider task's result starts a new workflow; the written answer is the one followed.)

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: hook ports on every block (contracts, validation, engine, canvas), the block event JSON, the `WorkflowHookEvent` record, hook chains running as normal steps, the rules above for what may sit in a chain, the run view showing hook steps, tests, docs, `MEMORY.md`.
- Out of scope: hooks that stop, skip or change their block; hooks of hooks; a fourth "settled" phase or any waiting for an effect inside a hook; hooks on a workflow as a whole (a trigger block's after already covers its start); firing hooks for old runs; copying a hook chain to other blocks in one click (later).
- Shared with `.plan/task-events.md`: the block `logic.ifEvent` (conditions on event facts), `process.messageMood`, the envelope pieces for account, proxy and started-by. Whichever plan is built first builds them with facts for both kinds of event.

## The design

### Hook ports are extra output ports of every block

- Contracts: `HOOK_PORTS = ['before', 'on', 'after']`. `validateGraph` accepts `fromPort` in `outputsOf(type)` or in `HOOK_PORTS`, for every block type (so a block added tomorrow has hooks with no change). Hook ports are not in `outputsOf`, so Else logic, `emitsOf` and the picker for data lines are untouched.
- Rules checked by `validateGraph`, each with a plain message: a hook line starts from a block that is not itself inside a hook chain (no hooks of hooks); every block reachable from a hook line belongs to that one hook and has no line to or from the main flow (a chain is closed); no line from a chain back to its host (it would be read as a loop); several lines from one hook port are fine, like any output. There is no rule about which block types may be in a chain.
- Everything that reads `graph.edges` for the main flow reads `mainEdges(graph)`, a contracts helper that drops hook lines; hook lines are read only by `hookLinesOf(graph, hostId)`. The 33 sites are listed in step 0 and each is changed or confirmed unaffected, with one guard test: for the existing graph fixtures, adding hook chains to any node leaves ordering, liveness, estimates and engine results of the main flow identical.

### The engine fires hooks, without touching the main flow

- Hook roots are blocks whose only incoming line is a hook line, so they are not roots of the run and do not run at the start. A hook chain's blocks keep their `WorkflowStepRun` rows made at run start (WAITING); a hook root is ready only when its hook event row exists for its round, and the blocks after it follow the normal rules inside the chain.
- The event is a row, `WorkflowHookEvent` (runId, hostNodeId, round, phase, payload JSON, firedAt), unique on `(runId, hostNodeId, round, phase)` so a repeated engine tick fires nothing twice. Firing also writes the items the phase carries under `portKey(hostNodeId, phase)` (before: the block's input items; after: its output items with their `result`; on: the input items), so a hook root reads them through the existing `readInputs` as if the host had emitted on that port. A hook root whose host never fires that phase is SKIPPED with the usual sentence.
- Where each phase fires: before in the tick that claims the step, ahead of the executor call, in the same transaction as the claim; on when the step goes RUNNING, or for a task-starting block when the first `tasks.started` arrives for one of its sessions; after when the step reaches DONE, PARTIAL or FAILED. A step that is SKIPPED fires nothing (nothing happened). A step run again by Retry fires before and on again with `tries` in the payload, and after only when it ends for good.
- Rounds: the blocks of a chain join the repeat region of their host, so `nextRound` lists them with the region's nodes and `addRound` creates their step rows for each round (same `round` number as the host's step; `skipDuplicates` keeps a repeat from creating them twice). A host that runs three For each batches therefore fires its hooks three times, each time with that round's items; the key `(runId, hostNodeId, round, phase)` keeps them apart. A host outside any region has round 0 only. The 200-fires cap bounds the worst case (10 loop rounds, or one batch per item up to the item cap).
- Spend: no hook-specific limit code. Hook steps are ordinary steps run by the ordinary executors, so a paid request in a hook is stopped by `walletLow` like any other; its `costMicros` lands on its own step row and in the run's total; `estimateGraph` adds each chain's cost per fire and, for a host in a region, multiplies by the rounds it knows (loop rounds) or says the total depends on the batches.
- The host never waits for its hooks; the engine's "all steps ended" check includes hook steps (question 5). A hook step that fails is marked FAILED with its error code and is shown, but is "handled" for the run's status, so the host's result and the run's status are unchanged; the in-app failure alert (engine phase 4) fires for main failures only.
- `WorkflowRun.engineVersion` becomes 3 for a run whose graph has any hook line; older runs and graphs without hooks keep 2 and the exact old rules.
- Previews (`previewGraph`) fire hooks too but follow the preview rules: acts do nothing, `Send via API` sends nothing.

### The event, as JSON (version 1)

```json
{
  "version": 1,
  "event": "after",
  "run": { "id": "...", "workflowId": "...", "start": "SCHEDULE", "depth": 0, "preview": false },
  "block": { "id": "n7", "type": "account.withdrawInvite", "label": "Withdraw connection request", "round": 0, "tries": 0, "settings": { "actForReal": false } },
  "input": { "kind": "profile", "count": 12 },
  "result": { "status": "DONE", "itemsIn": 12, "itemsOut": 12, "costMicros": 0, "message": null, "errorCode": null, "emits": ["main"] },
  "startedAt": "...",
  "finishedAt": "...",
  "durationMs": 1800,
  "account": { "id": "...", "displayName": "..." },
  "proxy": { "id": "...", "country": "IN" },
  "tasks": [ { "sessionId": "...", "task": "linkedin-invite", "verdict": "DONE" } ]
}
```

- Before: no `result`, `finishedAt`, `durationMs`. On: adds `startedAt`. After: all.
- `settings` is the block's configuration with every secret removed (`output.sendApi` secret, anything a field marks `secret`) and with the owner's own words trimmed to a length cap. People are never in the JSON: they are the items the hook receives (so the 14-day item rule and erasure already cover them); the JSON carries counts and ids only.
- `account`, `proxy` and `tasks` are filled for account blocks from `AccountActionCall` rows and the sessions they point at, using the same builders as `.plan/task-events.md` (`startedBy` becomes the run). Other blocks leave them out.
- Facts for `logic.ifEvent` come from this JSON (status, error code, counts, duration, block type) and from each item (`result.status`, `result.action`, mood); one list of facts per event kind, in contracts, so the editor offers them with no body code per block.

### What the unrestricted chain means

Every block may sit in a chain. What that means for the blocks that were going to be restricted, and the guards that make it safe:

- **Paid blocks.** A hook that spends wallet money is the owner's choice. `estimateGraph` adds each chain's cost per fire; for a host that runs once the estimate is exact, for a host that runs per round (For each, loops) it shows the cost per fire and says the total depends on the rounds. At fire time every paid step still checks the wallet floor and the run's existing spend limits like any other step (step 0 confirms which limits exist and that a hook step goes through them), a hook's cost counts in the run's `costMicros`, and a chain fires at most 200 times in a run (then the rest are recorded as skipped with a sentence), so a hook on a loop cannot spend without end.
- **Input blocks.** An input block in a before chain picks from the owner's lists as usual; its items stay in the chain (they are not given to the host). `skipTaken` writes its rows only for real runs, as today.
- **Stop.** A Stop in a chain ends the run with the Stop's own sentence, the same as anywhere. Its effect on the host: steps not yet started do not start, a step already running is wound down by the existing Stop rules (phase 0 and 4 of the engine). The run view says which hook stopped it.
- **Retry.** Retry looks at the nearest working block before it. Inside a chain that is a block of the chain, so it retries that block, never the host.
- **Run another workflow** and **Wait** work as anywhere; both can lengthen the run, and a child run started from a hook keeps the chain depth rule (`MAX_CHAIN_DEPTH`).
- **Blocks added later** need nothing: the hook ports belong to every block by the validation rule, and the chain rules above are written against the engine, not against block types. A new block with unusual flow control must still say how it behaves when it is the first block of a chain, in its own tests.

### Canvas

- Each block shows three small pills (before, on, after) in its footer when the block is hovered or selected, and always when something is attached (a filled dot, and a count when a hook fired in the shown run). Clicking an empty pill opens the block picker limited to blocks that may sit in a hook, with the host's item kind as the starting kind, and places the new block in a lane beside the host; clicking a filled pill selects its chain.
- Hook lines are dashed, in one colour per phase, with a label ("Before", "On", "After"); each pill is one React Flow handle (`port:before`, `port:on`, `port:after`, through the existing `handleOfPort`/`portOfHandle`), so `graph-convert` saves them as `fromPort`.
- Auto layout places each chain to the right of its host in its own lane so lines do not cross the main flow; the layout is a spike in step 6 (dagre on the main graph, then chains placed by host, because a hook line must not pull the main flow sideways).
- The block's side panel gets a "Hooks" section listing the three chains and what each received in the last run; the run view shows hook steps with their own status and a "Fired N times" note on the pill.

## Approach

Each step starts with the failing tests.

- [ ] 0. **Guard and site list.** List the 33 sites that read `graph.edges` and decide for each: main only, hook only, or both. Add the guard test (adding hook chains to the fixtures changes nothing in the main flow) before any change. The two questions this step used to ask are answered above: rounds (hook steps join the host's repeat region) and spend (the shared paid-request path); their tests are written in steps 3 and 5. Output: a table of the sites in this plan's Outcome.
- [ ] 1. **Contracts.** `HOOK_PORTS`, `mainEdges`, `hookLinesOf`, the validation rules and messages (no block-type rule), `eventFacts` (shared with task events), the block event JSON schema and its builder input type; unit tests including every rule and the "block added later has hooks" case (a test catalogue entry with no hook code).
- [ ] 2. **Model (additive migration).** `WorkflowHookEvent` table; nothing else. `engineVersion` 3 needs no schema change.
- [ ] 3. **Engine.** Fire before, on, after for any executor (one wrapper around the existing step run, not per executor), write the event and the phase items, make hook roots ready from the event row, include hook steps in the run's end check, mark a failed hook step handled, keep main behaviour identical when no hook exists. Integration tests (real Postgres) with a plain block, a block that fails, a skipped block, a block run again by Retry, a For each host with three batches (three before, on and after events, each with its batch's items, and no duplicate step rows on a repeated tick), a loop host with its rounds, the 200-fires cap, and a preview run.
- [ ] 4. **Account blocks.** Fill `account`, `proxy` and `tasks` from `AccountActionCall`; `on` waits for the first `tasks.started` of the block's sessions when the task events plan has shipped it, else fires at step start (the plan notes which). Tests with the invite, reply and remove-connection blocks.
- [ ] 5. **Blocks used in hooks.** `logic.ifEvent` and `process.messageMood` as in `.plan/task-events.md` (built here if this plan lands first); `output.sendApi` adds `event` to its JSON when run inside a hook; `output.return` and `process.tag` work unchanged on hook items. Spend tests: a paid block in a hook stops when the wallet is below the floor and the host's result is unchanged; the hook's cost is on its own step and in the run total; `estimateGraph` includes each chain's cost per fire.
- [ ] 6. **Body.** Pills, handles, dashed lines, the picker limit, the Hooks section, run view for hook steps, layout lanes. Browser check on a real workflow (and what was not seen).
- [ ] 7. **Docs and memory.** `MEMORY.md` (decision, the chain rules a later block must know, the unrestricted-chain guards), the engine notes in the plans' Outcomes.

## Edge cases and risks

- **A hook line read as a loop or a data line.** The main risk: engine and validation read `edges` in about 33 places. Mitigation: `mainEdges`, the guard test of step 0, and `engineVersion` 3 only for graphs with hooks so old runs and old graphs run exactly as before.
- **Loops and For each.** A host that runs per round fires per round (`round` is part of the key); a hook chain therefore runs once per round, which can be many. Cap: a hook chain fires at most 200 times in a run, then the rest are recorded as skipped with a sentence.
- **Wait in a hook.** A Wait inside a chain holds the run open and the workflow's live-run slot. Documented in the Hooks section; the watchdog (`workflowWatchdog`) already ends runs that hold too long.
- **Duplicates.** Event rows are unique per run, host, round and phase; hook steps use the existing unique step key; a repeated tick or a redelivered result fires nothing twice.
- **Preview.** A preview fires hooks with the preview rules: acts do nothing and `Send via API` sends nothing. A paid block in a hook behaves as a paid block does in a preview today (the existing `previewCap`), so a preview cannot spend without that cap.
- **Money and limits.** Paid blocks in hooks go through the wallet floor, the run's existing limits and the fire cap of 200 (see "What the unrestricted chain means"); act blocks inside a hook still go through the domain services and "Act for real", so a hook cannot bypass a limit, and a chain of act blocks hanging on an act block is still bounded by the per-account limits. Stop in a hook ends the run: that is deliberate, not a leak.
- **Security and privacy.** Event JSON carries no secrets and no people (counts, ids, the block's settings with secrets removed); people travel as items under the 14-day rule; `Send via API` sends only to the HTTPS address the owner set. A hook runs as the run's owner; nothing reads another owner's data.
- **Editor.** Hooks add handles to every block: the pills are hidden until hover or selection to avoid clutter, and the layout lanes are the part most likely to need a second pass in a browser.
- **Existing workflows and rollback.** No stored graph changes: a graph without hook lines is untouched, and older stale tabs save what they hold (a tab that predates hooks and saves drops nothing it did not have). Rollback is not deploying the engine change; the one new table is unused without hooks.
- **Dev vs production and CI.** One additive migration; no new queue or env variable (the `on` of task blocks uses the task events plan's started message when it exists). CI runs unit tests only; the engine integration tests run locally and are listed in the Outcome.
- **Relation to task events.** Two paths give two answers on purpose: a block hook tells about this block's step in this run; a task event starts a run for any task, whoever started it. For Send connection request's final outcome use the task event.

## Verification

- `pnpm lint && pnpm ts:check --force && pnpm test:unit:run && pnpm build` and `pnpm --filter @automatedLinkedIn/brain test:integration:run`.
- The guard test from step 0 passes at every later step, and every existing engine, liveness and golden test passes unchanged.
- Real path: a workflow with a hook on a plain block, on an account block in preview, and on a For each; check the run view and the event JSON delivered to a local `Send via API` listener; draw, attach, detach and reload hooks in a browser and say what was and was not seen. Not verified until the owner runs it: hooks on live account acts.

## Outcome

Filled in when done.
