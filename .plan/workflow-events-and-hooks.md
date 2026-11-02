# Workflow events and hooks: one model for "something happened"

- Status: locked <!-- draft | locked | in progress | done -->
- Created: 2026-11-03
- Locked by user: yes, 2026-11-03 <!-- change to "yes, <date>" only after the user confirms -->

## Goal

A GTM engineer running several campaigns across many accounts can react to anything that happens, in two ways that share one model:

1. **Task events**: every task an account performs gives before, on and after; a workflow can start from any of them (cross-run, any account, any task, now and later).
2. **Block hooks**: every block on the canvas can carry a before, an on and an after, each with blocks attached, that react to that block's step in the run that is going now.

One event envelope, one delivery path with a log and a retry, one set of blocks, one set of rules, and a way to see, test and replay what happened. This plan merges `.plan/task-events.md` and `.plan/block-hooks.md` (both locked 2026-11-02, now marked superseded and kept as the record of the owner's answers), after a review from the GTM engineer's seat covering the run engine, UI and UX, and data discovery. Everything that review found is resolved below.

## What exists today (checked in the code, 2026-11-03)

Tasks and results

- A task is asked in `TaskService.request`: one transaction runs the task's `onRequest`, saves the `SpiderSession` and a `TaskDispatch` row; `TaskDispatchService.dispatch` publishes to `tasks.run` after, and the worker job `task-dispatch` retries. `SpiderSession.startedAt` is the request time; `trigger` is `manual | automatic | retry`; `task` is null for sessions older than the standard contract; `requestParams` is the fixed non-secret input; the proxy is a snapshot (`proxyProtocol/Host/Port/Country`).
- The spider answers on `tasks.done`; `applyTaskResult` runs the task's `onResult(session, result, tx)` inside the transaction that ends the session (`database/taskHooks.ts`). Nothing is sent when a run starts. The useful data of a result arrives later through an `*Import` row (`InviteImport`, `MessageImport`, `ConnectionImport`, `InvitationImport`, `ProfileImport`), marked `DONE` when stored.
- Which tasks need an account is announced by the worker: `TaskService.catalog()`, `needs.account`. `TaskService.emit` (brain tells a task something) is a different thing; the new feature is called a task event.
- `LinkedInInvite` has `source`, a partial unique index of one live invite per person, and a `sessionId` that one send run shares across many invites (so an invite needs its own origin). `LinkedInReply.sessionId` is unique (one reply, one run). `LinkedInMessage.direction` says who wrote it and `sentAt` is LinkedIn's wall clock kept as if UTC: it is never compared with the real clock.

Runs and the engine

- `WorkflowService.startRun` is the one way to start a run; `runKey` is unique. A partial unique index (`WorkflowRun_workflowId_running_key`, `status = 'RUNNING'`) allows one live run per workflow. `admit` queues a start up to `MAX_QUEUED` (10) and refuses a preview, or a start by "Run another workflow", while one is live. `promoteWaiting` starts the oldest queued run when none is live. `reopen` (resume) and `endStuck` (watchdog, `STUCK_HOURS`) rely on the same index. `MAX_CHAIN_DEPTH` is 5.
- `RunStart` is a contracts union (`MANUAL | SCHEDULE | PREVIEW | API | WORKFLOW`) with `FIRES` and `isFired`; `WorkflowTrigger` is a Prisma enum with the same values. The engine reads `preview` from `run.trigger === 'PREVIEW'` (`engine.ts`, one place).
- `advanceRun`: one `WorkflowStepRun` per node at start (unique `(runId, nodeId, round)`), a step is ready when its forward parents passed; after an unhandled failure or a Stop, steps never taken are SKIPPED and nothing new starts (winding); For each and loops repeat a region through `nextRound` / `addRound`; `finish()` ends the run and starts the "When another workflow finishes" listeners (not after a failure, a Stop or a preview).
- `logic.stop` is a failing step (`StepError ... 'STOPPED_BY_BLOCK'`), not a stop request. "Run another workflow" does not pass the owner's Stop to its child.
- A run keeps a copy of its graph (`WorkflowRun.graph`), read by `readGraph` (strict zod). A graph has at most 50 nodes and 100 edges; a node has `id` (`^[\w-]{1,40}$`), `type`, `version`, `disabled`, `config`, `position`, and no name; an edge may carry `fromPort`. Items are stored under `portKey(nodeId, port)`.
- Account blocks resolve their accounts in one place, `accountIdsOf` (`worker/engine/accountPool.ts`): `accountMode` is `pool | one`. The reply block already looks each conversation up for its own account but still needs a pool.
- `Send via API` posts what reaches it, in pages, to the owner's HTTPS address (private addresses refused, 10 s timeout, optional `X-Workflow-Secret`). The catalog has no field-level "secret" flag.
- Retention (`RETENTION`): items 14 days, a run's `input` is cleared after 14 days, runs 90 days, ledger 13 months. `WorkflowService.listeners` reads every enabled workflow's graph (fine for "When another workflow finishes", not for events). `WorkflowService.runs` lists the 50 newest runs of a workflow; `alerts` lists failed runs of the last 7 days.
- No model or sentiment code exists; `score.icp` is rule based.

## Requirements

### Carried over (owner answers, 2026-11-02, unchanged)

- Three moments, before, on and after, for any task an account performs and for any block; each is passed on as JSON.
- Task event content: before and on carry account, proxy, input, started by; after adds result, start and finish time. Block event content: block, settings, input, result, times, run, and for account blocks the account, proxy and task.
- Every task and every block, the ones that exist and every one added later, gets them with no code of its own; a new task shows up in the trigger's picker by itself; the design holds at many accounts and workflows.
- A workflow can run on any task event. Examples: act on a positive or negative message; know whether an invite went with its note.
- Task event moments: before is request accepted and session saved; on is the worker really began (new spider message `tasks.started`; brain, worker and spider deploy together); after is the result stored and the task's import done, waiting at most 15 minutes, then it fires with details marked late.
- Block hook moments: before is about to start; on is working (a block whose step starts tasks: the first `tasks.started`; any other block: step start); after is the step's final state with the result. After for send and withdraw means planned (the invite goes out later); the real outcome comes from a task event workflow. There is no fourth phase and no waiting inside a hook.
- Observe only: an event or hook never stops, delays or changes its task or block, and a failed hook never fails the block or the run. The one exception is a Stop block the owner puts in a chain.
- Same canvas: three pills on each block, dashed lines to the attached blocks.
- Every block may sit in a chain, including input, paid, Stop, Retry and blocks added later; no block flag forbids it. A hook step is under the same spend limits as any step (wallet floor at the start, `walletLow` before every paid request, the estimate, the cost kept per step); a paid block in a hook stops when the wallet is low and its host is unaffected. A hook has a step for every round of its host (For each batches, loop rounds) up to the existing maxima.
- Mood of a message by rules the product ships; a model is a later, separate decision. Two trigger blocks: "When an account runs a task" (gives people) and "When a message arrives" (gives conversations).
- Defaults: a workflow ignores events caused by its own runs; chains stop at depth 5; events are kept 30 days with no personal text on the event row. No per-run or per-workflow spend caps (owner, 2026-10-17); the wallet floor is the limit.

### Changed in the merge (confirmed by the owner, 2026-11-03)

| # | Was | Now | Why |
| --- | --- | --- | --- |
| 1 | Hook chains run as steps of the same run | Each hook fire is its own small run (a hook run) of the same workflow, linked to the host run. The hook is still drawn and edited on the host block's canvas | After a failure or a Stop the engine skips every step not yet started, so an after hook on a failed block would never run, the case people want most. Steps in a For each or loop need 2D rounds. A Wait in a chain would pin the workflow's one live-run slot. Every function that reads edges would need to ignore hook lines. With a split at run start the engine never sees a hook line |
| 2 | The run ends when its hook chains end | The host run ends when its own flow ends. Hook runs finish on their own, show under the host run and hold no live-run slot. The owner's Stop on the host run is passed to its live hook runs | Same as 1; a Wait in a hook must not stop the next scheduled run |
| 3 | A Stop block in a hook stops the whole run | Same effect, made explicit: the hook run ends as any Stop does, and the host run, if still live, gets a stop request carrying the Stop's sentence | `logic.stop` is a failing step today; the host needs a clean wind-down that books paid jobs |
| 4 | A skipped event start is never retried | A delivery waits (PENDING, retried with backoff) up to 6 hours, then is DROPPED with its reason; every outcome is kept 30 days in a log | Busy queue or low wallet must not lose events silently |
| 5 | Replaying old events is out of scope | In scope for events younger than 30 days: "Run on this event" (a preview with its real items) and "Replay" (a real run, confirmed) | A GTM engineer cannot design or test a trigger without them |
| 6 | One run per (event, workflow, trigger block) | One run per (event, workflow); its start nodes are the matching trigger blocks | Two trigger blocks in one workflow must not double the work |
| 7 | Task event `details` carried names, message words and notes; the hook JSON carried no people | One rule: the JSON carries counts, ids and fixed facts; people and their words travel as items. The task input is added when the envelope is delivered or shown, never stored on an event or a run | One privacy rule; erasure and the 14-day rule keep working |
| 8 | `output.return` can return the event | Dropped (YAGNI). Only `Send via API` carries `event` | No caller asked for it |
| 9 | At most 30 event runs per workflow per hour, extra skipped | A rate limiter: the rest wait as PENDING and the limit is a trigger setting (default 30, 1 to 200) | Smoothing, not loss |
| 10 | Two condition places (`logic.ifEvent` for events, mood in the same block) mixing scopes | One `logic.ifEvent` with named scopes (`event`, `hook`, `item`); mood is an item fact | Inside a hook of an event-started run two events are in scope |
| 11 | Block event `settings` has "secrets removed" | A whitelist: only fields a block lists in `eventSettings` appear; the default is none | The catalog has no secret flag, and an address can hold a token |
| 12 | A chain belongs to one hook | One chain can be attached to many blocks (a reference); nodes get an optional `label`; a hook can be paused | One "tell my system" chain serves a workflow, and the 50-block cap is not eaten by copies |

Kept as locked, on purpose: the default for who starts an event run stays "anyone" (owner, 2026-11-03), so a hand-started Refresh or Test login can start a workflow that listens to it. The trigger block says in one sentence who it reacts to, every event in "Recent events" shows who started it, and unticking "tasks I start by hand" or "retries" narrows it (case E26).

### Defaults chosen (not asked; accepted with the answers, change any before it is built)

- "When a message arrives" fires only for new incoming messages stored by a read; the first read of an account is a baseline and gives no arrivals; there is no 48-hour rule (message times are not real-clock).
- A hook fires only when something reached or left the block (`when: items`); "always" is opt-in. A hook fires every time its block runs (`fires: each`) with a warning for blocks in a repeat region; `once` fires a single time per run (before and on at the first start, after at the end of the last round with everything).
- Act blocks in event or hook runs can use a new account choice, "The account of the event".
- The preview of an event-triggered workflow uses the newest real matching event (or a generated sample) and acts nothing.
- A workflow's own tasks do not start it again unless it says so; "one workflow per conversation" (claim) is off unless ticked.
- Caps: 200 hook fires per host run; per workflow 20 live hook runs and 3 queued event runs; per owner 100 live hook runs, 20 deliveries started per tick and 200 events fanned out per tick; pending deliveries 200 per workflow and dropped after 6 hours. Events and deliveries are kept 30 days; hook run rows 14 days (their parent run keeps counts).

### Answered by the owner, 2026-11-03

1. Hook model: each hook fire is its own small run (changes 1 to 3 above).
2. Spending: no caps; show the bound ("up to 30 runs an hour, about $X each") instead.
3. Delivery promise: a delivery waits up to 6 hours, every outcome is logged, replay works for events under 30 days.
4. Attribution: record which workflow planned each invite and reply (additive columns; older invites stay "unknown").
5. Who starts an event run by default: anyone (the owner chose this over the recommended "system and workflows only").
6. Claim ("one workflow per conversation") and batching ("collect events for N minutes") are built in this feature, as the last phase.

### Open questions (must be empty before locking)

- None.

## Scope and non-goals

- In scope: the shared envelope and delivery path; task events for every account task; `trigger.taskEvent`, `trigger.messageArrived`; hook ports on every block with attached chains run as hook runs; `logic.ifEvent`, `process.messageMood`, `event` in `Send via API`, "The account of the event"; node `label`; recent events, event log, "why didn't it fire", run on an event, replay, samples and tests; attribution on invites and sessions; the canvas, run view, Sessions and Usage changes in "Edge cases"; templates; tests, docs, `MEMORY.md`.
- Out of scope: a hook or event that stops, delays or changes its task or block; a model for mood; webhooks other than `Send via API`; events for tasks with no account and for brain-only actions; hooks of hooks; workflow-wide default hooks (attach one chain to many blocks instead); a global events page (the Sessions drawer and the trigger block cover it); email or chat alerts (in-app only); spend caps.

## Design

### 1. One model

Words: an **event** is a thing that happened (a task moment, or a block's step moment); a **phase** is `before`, `on` or `after` (text checked by zod, never a database enum); a **delivery** is an event matched to something that reacts (a workflow's trigger block, or a hook); a **hook** is a block's before, on or after with a chain attached; a **chain** is the blocks attached to a hook, run as a hook run.

**1.1 The envelope (version 1), one core and two kinds.** Never in it: secrets, tokens, proxy host, port or password, file paths, the data supplier's name, other people's names or words.

```json
{
  "version": 1,
  "kind": "task",
  "phase": "after",
  "id": "<task event id>",
  "at": "2026-11-03T09:00:00Z",
  "account": { "id": "...", "email": "...", "displayName": "..." },
  "proxy": { "id": "...", "protocol": "http", "country": "IN" },
  "startedBy": { "kind": "owner | automation | workflow | retry", "job": "invite-send", "workflowId": "...", "runId": "...", "nodeId": "..." },
  "task": {
    "name": "linkedin-invite", "version": 3, "sessionId": "...",
    "input": { "...": "the owner's own settings, words and recipients; added when delivered" },
    "requestedAt": "...", "startedAt": "...", "finishedAt": "...", "durationMs": 41000,
    "result": { "status": "SUCCEEDED", "verdict": "DONE", "message": "...", "report": {} },
    "details": { "invites": { "SENT": 3, "SENT_WITHOUT_NOTE": 2 } },
    "detailsStatus": "ready | late | none"
  }
}
```

```json
{
  "version": 1,
  "kind": "block",
  "phase": "after",
  "id": "<delivery id>",
  "at": "...",
  "account": null,
  "proxy": null,
  "startedBy": { "kind": "run", "workflowId": "...", "runId": "...", "start": "SCHEDULE" },
  "block": {
    "id": "n7", "type": "account.withdrawInvite", "label": "Withdraw old requests",
    "round": 0, "tries": 0, "settings": {},
    "run": { "id": "...", "workflowId": "...", "start": "SCHEDULE", "depth": 0, "preview": false },
    "input": { "kind": "profile", "count": 12 },
    "result": { "status": "DONE", "itemsIn": 12, "itemsOut": 12, "costMicros": 0, "message": null, "errorCode": null, "emits": ["main"] },
    "startedAt": "...", "finishedAt": "...", "durationMs": 1800, "approximate": false,
    "tasks": [{ "sessionId": "...", "task": "linkedin-invite", "verdict": "DONE" }]
  }
}
```

- One builder, `envelopeCore`, makes `version`, `phase`, `id`, `at`, `account`, `proxy`, `startedBy`; each kind adds its own part. `before` has no `startedAt`, `finishedAt`, `durationMs`, `result`, `details`; `on` adds `startedAt`; `after` has all.
- People are items, not JSON. The per-person facts of a task event (`outcome`, `noteSent`, `state`, who wrote, mood, which workflow planned it) are fields of the items made from the event; the envelope holds only counts per outcome.
- A run started by an event or a hook keeps a reference only (`run.input = { delivery: <id> }`); the envelope and its items are rebuilt from the session, the domain rows and the host run when the run starts, shown or posted. Nothing personal is copied onto an event, a delivery or a run input.
- `block.settings` is a whitelist: only keys a block lists in its catalog entry's `eventSettings`. A test walks the catalog and fails when a field named like a token, key, secret, password or url is listed.

**1.2 Provenance, one shape everywhere.** `origin = { kind: 'owner' | 'automation' | 'workflow' | 'retry' | 'event', job?, workflowId?, runId?, nodeId?, eventId? }`, ids only. It is saved in `SpiderSession.origin` (replies and every task a workflow block starts), per row in `LinkedInInvite` (`originWorkflowId`, `originRunId`, `originNodeId`, because one send run carries invites of several workflows), and on deliveries. The engine passes it for every act it asks; system jobs pass `automation` plus the per-row origin. It drives the guards, the `campaign` filter, the Sessions page and the people's history.

**1.3 Deliveries, one inbox for both paths.** Table `WorkflowDelivery` (columns in section 5). A task event creates one delivery per listening workflow; a hook fire creates one delivery for its (host run, block, phase, round, try). A delivery is PENDING, STARTED (with `runId`), SKIPPED (a fixed reason, no retry) or DROPPED (too old or too many). The log, the retry, the caps and the cron monitor all read this one table.

**1.4 Matching, one function.** `matchEvent(triggerSettings, envelope, itemFacts)` in contracts returns `{ ok, failed: [{ filter, expected, got }] }`. The dispatcher uses it, the editor's "Check an event" uses it, and tests use it, so "why didn't it fire" is the same code that decides.

**1.5 One condition block.** `logic.ifEvent` ("If the event says") chooses from a closed list of facts generated from contracts (`EVENT_FACTS`), never a free path. Scopes: `event.*` (phase, task, verdict, who started it, account, duration, campaign), `hook.*` (host block type, status, error code, items in and out, tries), `item.*` (outcome, note sent, state, direction, mood, planned by). The picker shows the scope so a hook inside an event-started run is unambiguous. A fact that is null reads "not known" and matches neither yes nor no unless the owner picks "not known". Matches pass on, the rest goes to an Else, as `logic.if`.

**1.6 The account of the event.** `accountMode` gains `event`: `accountIdsOf` returns the accounts of the run's event (the task event's account; for a hook, the accounts the host block used). It is only valid in event-started runs and in hook chains (the editor says so; validation fails elsewhere), so a reply workflow no longer needs a "Select accounts" block.

### 2. Task events (cross-run)

**2.1 Emitting, for every task, now and later.** Unchanged from the locked plan: `TaskEventService.record(tx, sessionId, phase)` is the only writer and asks only the catalog's `needs.account`; `before` is written in `TaskService.request`'s transaction, `on` by the consumer of the spider's new `tasks.started`, `after` in `applyTaskResult`'s transaction. Layer 0 is the envelope from `SpiderSession` alone; layer 1 is optional `details` (`eventDetails` in `taskHooks.ts` plus `TASK_EVENT_DETAILS` in contracts); layer 2 (picker, facts, run view, reference) is generated from those. A task with no declaration gives `details: null`, never an error; a coverage test walks the real spider registry and a fake task and fails when an account task misses an event. Settle: a task whose result is imported later says `settledBy: 'import'` and its import calls `TaskEventService.ready(sessionId)`; every `after` is ready after 15 minutes anyway. The spider's runner publishes `tasks.started` for every task; a failure to publish is logged and ignored. Versions are additive. Deploy order: migrations, brain, worker, then spider.

**2.2 Columns for it.** `SpiderSession.runStartedAt`, `SpiderSession.origin`, `LinkedInInvite.noteSent` (set where the invite settles, so the answer is never read back from a sentence).

**2.3 Details, with the fixes.**

| Task | `details` (counts) and item facts |
| --- | --- |
| `linkedin-invite` | counts per outcome (`SENT`, `SENT_WITHOUT_NOTE`, `NOT_SENT`, `NO_CONNECT`, ...), `withdrawn` count; items: person, `outcome`, `noteSent` (true, false, null), `plannedBy` (workflow, run, block) |
| `linkedin-reply`, `linkedin-message` | counts per state (`SENT`, `FAILED`, `UNKNOWN`); items: conversation or person, `state`, `plannedBy` |
| `linkedin-messages` | per conversation: new incoming messages stored by this read only, never older rows; the first read of an account (no earlier `MessageImport` marked `DONE`) is a baseline and gives none; at most 50 conversations per event with a `truncated` count, the rest stay readable through the "Get conversations" block; the items carry the new words (up to 500 characters each) |
| `linkedin-invitations` | counts of requests, new in this read; items: person, note |
| `linkedin-connections` | counts of connections, new in this read, and removed; items: person |
| `linkedin-post` | state, link |
| any other task | none until declared; the envelope is complete without them |

**2.4 Listeners.** `WorkflowListener` (one row per trigger block of an enabled workflow: user, workflow, node, phase, task or any, the filters that matter) is written by one function, called in the same transaction as every write of a graph or of `enabled` (create, update, restore a version, copy, switch on or off), so it cannot drift on a normal path. A daily job `event-repair` rebuilds it from the graphs and reports a mismatch to the cron monitor. A lookup per event is one indexed query on `(userId, phase, task)`.

**2.5 The dispatcher, in two phases** (worker job `event-dispatch`, every 10 s, `defineJob`, title and purpose set, an `items` entry per event handled for the monitor, nothing logged when idle).

1. Fan out: take ready, undispatched events in batches (`FOR UPDATE SKIP LOCKED`, a lease, at most 200 per tick and 20 per owner), build the envelope once, read the owner's matching listeners, and in one transaction insert a delivery per workflow (PENDING, or SKIPPED with a fixed reason when a guard fails) and mark the event dispatched. A poison event (five failed builds) is parked with its error and no longer picked.
2. Start: take PENDING deliveries whose `retryAt` has come (20 per owner per tick), oldest first, one workflow at a time, and call `startRun(userId, workflowId, 'EVENT', 'taskEvent:<eventId>:<workflowId>', { input: { delivery, nodes }, depth })`. Started: STARTED with the run id. Busy, wallet low or three event runs already queued: stay PENDING with backoff (30 s up to 10 min), DROPPED at 6 hours. "Fix the workflow first": SKIPPED with the message (and the workflow shows "Not listening: fix this"). The same runKey means a repeated attempt finds the run it started. Phases of one session reach one workflow in order (a later phase waits until the earlier one started).

**2.6 The trigger blocks.**

- `trigger.taskEvent` "When an account runs a task": phase, task or any (from the catalog), accounts or any, started by (default anyone: the owner, the system, workflows and retries; untick any, and the block's summary says who it reacts to), verdicts (after only), planned by (workflows; default any), "also tasks this workflow started" (off), at most N runs an hour (30), collect window (0, later phase). Gives the people of the event's items.
- `trigger.messageArrived` "When a message arrives": accounts, planned by, "handle each conversation in one workflow only" (claim: a row per conversation and latest message in `WorkflowEventClaim`; the first workflow to take it keeps it, the others skip with "Another workflow took this conversation"), the same hourly limit. Gives conversations with the new words.
- Both: the header switch governs them like the schedule and API triggers; `trigger.workflow`'s own guards are unchanged.
- `trigger.hook` is internal (hidden from the picker; flag `hidden`): it starts a hook run and emits the hook's items. The reserved node id `__hook` is refused in a stored graph.

**2.7 Guards.** Skip an event whose `origin.workflowId` is this workflow (hook runs belong to their workflow, so a workflow's own acts never restart it) unless the trigger says so; `depth` is the origin run's depth plus one and stops at `MAX_CHAIN_DEPTH`; events are looked up by `userId` only, never across owners. A reply cannot make the "message arrived" of its own conversation fire (incoming messages only), and the reply block's "not again for N hours" keeps a second workflow from writing twice.

### 3. Block hooks (hook runs)

**3.1 In the graph.** Hook ports are `before`, `on`, `after`, valid as `fromPort` on every block type (`HOOK_PORTS`, not part of `outputsOf`, so a block added tomorrow has hooks with no change). The chain is every block reachable from a hook line through ordinary lines. A node gets optional `label` (up to 60 characters) and optional `hooks: { before?, on?, after? }` with `{ when: 'items' | 'always', fires: 'each' | 'once', off?: boolean }`. A chain may hang on several hooks of several blocks (a reference), but never connects to the main flow, never back to a host, and a chain block has no hooks (no hooks of hooks). `validateGraph` splits first and checks the main flow and each chain as separate small workflows (so a chain block that needs "Select accounts" must have it inside the chain, or use `one` or `event`), each error in plain words with the node id.

**3.2 Split at run start.** `splitHooks(graph)` (contracts, pure) returns the main graph, the chains and the attachments. `WorkflowRun.graph` is the main graph only, so the engine, `core/workflowInput.ts` and every executor never see a hook line; `WorkflowRun.hooks` (new, nullable) holds the chains and attachments for that run. `estimateGraph` runs on the main graph; each chain adds its cost per fire. Everything that answers a question about the main flow is called with the main graph; only the editor, `splitHooks` and `validateGraph` read the whole graph (step 0 lists the callers in contracts, brain and body).

**3.3 Firing.** Where: `runStep` wrapper, one place for every executor. Before: after the step is claimed, before the executor runs. On: for a block whose step starts tasks itself (reads and visits), when the first `ON` task event of one of its sessions arrives (found through `origin.runId` and `origin.nodeId`); for every other block, right after before; if the step ends first, on fires at the end with `approximate: true`. After: in the same transaction as `finishStep`, for DONE, PARTIAL and FAILED. A SKIPPED step fires nothing. The host never waits for a hook.

- Key: `(hostRunId, hostNodeId, phase, round, tries, resumes)`; `resumes` is a new counter bumped by `reopen`, so a resumed step fires again; a Retry try fires before and on again and after only at the final state; `fires: once` uses round -1.
- Zero items with `when: items`: no run, delivery SKIPPED "Nothing reached the block". With `always` the run starts with zero items and the start block emits anyway.
- A fire inserts its delivery (PENDING) in the host's transaction and starts it right after commit; the dispatcher's start phase picks up whatever is left.
- An `after` for an account block fires when the block ends, which for invites, replies and messages is when they are planned. The hook panel says so and offers "Start from what the task really did" (a ready "When an account runs a task" template).

**3.4 The hook run.** A normal run: new `WorkflowRun.kind` (`MAIN` default, `HOOK`), `trigger` `HOOK` (or `PREVIEW` when the host is a preview, so preview rules apply with no engine change), `parentRunId` the host run, `graph` the start block plus the chain, `input = { delivery }`, the host's items copied under the start block (14-day rule). It is created by `startHookRun`, not `startRun`: no whole-workflow validation (the host run already passed it), no queue, wallet floor checked, refused when the host has a stop request (SKIPPED "The run was stopped").

- The one-live-run index becomes `status = 'RUNNING' AND kind = 'MAIN'`; `admit`, `promoteWaiting`, `runs` (history), `alerts`, `finish`'s chained start and the API call count read `kind`. Step 0 lists every query on `WorkflowRun` by `trigger`, `status` or `parentRunId` with a test each.
- Stop: the owner's Stop on the host run is passed to its live hook runs; a Stop block in a chain ends its hook run as any Stop does and sets a stop request, with the Stop's sentence, on the host run if still live (`finish` keeps that sentence). A hook run has its own Stop button.
- Failure: a failed hook run never changes the host. Hook failures are grouped in the alerts (one line per hook per day), never one per fire.
- A hook run's output list, tags and labels are the workflow's, like any run of it. Hook run rows are removed after 14 days.

**3.5 What a chain may contain.** Every block. In a chain, `Task result` at the start answers about the host from the hook event (the start block counts as a working block whose outcome is the host's); later ones look at the nearest working block in the chain; `Retry` retries the nearest working block in the chain and is an error when none is before it; `Wait`, For each and loops work as in any workflow because the chain is its own run; input blocks pick from the owner's lists and keep their items in the chain; paid blocks are under the wallet floor and `walletLow` and cost on the hook run; act blocks go through the domain services and "Act for real".

### 4. Blocks

| Block | Change |
| --- | --- |
| `trigger.taskEvent`, `trigger.messageArrived` | New |
| `trigger.hook` | New, internal |
| `logic.ifEvent` | New: facts by scope, passes matches, Else the rest |
| `process.messageMood` | New: rules in contracts (pure, English first), writes `mood` (`positive`, `negative`, `question`, `out_of_office`, `unsubscribe`, `neutral`) with a fixed-sentence reason; says in its summary that it reads words, not intent; negations ("not interested", "no thanks") are in the test table |
| `output.sendApi` | Posts `event` (the envelope) with every page when the run was started by an event or a hook; otherwise the payload is exactly as today; "Send a test" posts a sample marked `"test": true` |
| account act blocks | `accountMode: 'event'` |
| every block | optional `label`, `hooks`, `eventSettings` |

### 5. Data model (additive; two migrations)

- Migration A: `ALTER TYPE "WorkflowTrigger" ADD VALUE 'EVENT'` and `'HOOK'`, alone, because a new enum value cannot be used in the transaction that adds it.
- Migration B: `TaskEvent` (id, userId, sessionId FK cascade, accountId, task, phase, at, readyAt, claimedUntil, dispatchedAt, attempts, lastError; unique `(sessionId, phase)`; indexes `(dispatchedAt, readyAt)`, `(userId, at)`); `WorkflowListener` (workflowId FK cascade, nodeId, userId, phase, task, filters; unique `(workflowId, nodeId)`; index `(userId, phase, task)`); `WorkflowDelivery` (id, userId, workflowId FK cascade, source `TASK | BLOCK`, taskEventId FK cascade, hostRunId, hostNodeId, phase, round, tries, resumes, targets Json, status, reason, runId FK set null, attempts, retryAt, createdAt, startedAt; unique `(taskEventId, workflowId)` and `(hostRunId, hostNodeId, phase, round, tries, resumes)`, each only for its own source because nulls are distinct; indexes `(status, retryAt)`, `(userId, workflowId, createdAt)`); `WorkflowEventClaim` (userId, key unique, workflowId, createdAt); `SpiderSession.runStartedAt`, `SpiderSession.origin`; `LinkedInInvite.noteSent`, `originWorkflowId`, `originRunId`, `originNodeId`; `WorkflowRun.kind` (text, default `MAIN`), `WorkflowRun.hooks` (Json, null), `WorkflowRun.resumes` (int, 0); the new partial unique index is created before the old one is dropped, in the same migration, so the rule is never missing.
- No backfill: old sessions have no events, old invites have no origin ("unknown"), old workflows listen to nothing. Rollback: stop the job, do not deploy the engine change; nothing else reads the new tables and columns.
- Retention adds: events and deliveries 30 days, claims 7 days, hook run rows 14 days; the existing 14-day rule clears run inputs.

## Edge cases, by what the GTM engineer meets

### Run engine

| # | Case | Resolution | Proven by |
| --- | --- | --- | --- |
| E1 | Event arrives while the workflow is busy or the wallet is low | PENDING with backoff for 6 hours, then DROPPED with the reason; always in the log | dispatcher integration test |
| E2 | Two trigger blocks of one workflow match one event | One delivery and one run; the matching triggers are its start nodes (`isFired` reads the run's node list) | contracts unit, engine integration |
| E3 | Redelivered result, two workers, repeated tick | Unique keys, `SKIP LOCKED` leases, the fixed runKey | integration |
| E4 | Phases out of order | One session's phases reach one workflow in order; `on` after the result is dropped | integration |
| E5 | A reply makes the next message arrive, an act makes an event, a hook's act makes an event | Incoming messages only; the origin rule; depth 5; the hourly limiter; "not again" on the reply block | unit, integration with two workflows triggering each other |
| E6 | Two campaigns, one conversation | `planned by` filter on the origin; optional claim; otherwise both run and the reply block's "not again" window protects | integration |
| E7 | First read of an account, or a backlog after downtime | Baseline gives no arrivals; at most 50 conversations an event with a `truncated` count; 20 deliveries per owner per tick; 200 pending per workflow | integration |
| E8 | The host fails | Its after hook still fires (a separate run is not wound down); a SKIPPED step fires nothing; a run ended by the stuck-run watchdog fires no after (noted in the panel) | engine integration |
| E9 | The owner presses Stop | No new hook run starts (SKIPPED "The run was stopped"); live hook runs get the stop | integration |
| E10 | Retry and resume | Key has `tries` and `resumes`: before and on per try, after at the end; a resumed step fires again | integration |
| E11 | Zero items | `when: items` skips with a sentence; `always` starts and the chain runs; `Send via API` with zero items posts the event and an empty list (checked in step 0) | integration |
| E12 | Host inside For each or a loop | `fires: each` per round (warning shows the expected count), `once` for one fire per run; 200 per host run, then SKIPPED "Hook limit for this run" | integration |
| E13 | Wait in a chain | Its own run; no live-run slot held; the watchdog ends a stuck hook run alone | integration |
| E14 | Host run ends while hook runs live | Normal; the run view says "hooks still running"; each hook run has its own Stop | integration |
| E15 | Stop block in a chain | See 3.4 | integration |
| E16 | Task result, Retry, Wait in a chain | See 3.5 | unit and integration |
| E17 | Preview | Hook runs of a preview are previews (acts and `Send via API` do nothing, paid reads capped); an event-triggered preview uses the newest real event or a sample; "Test this hook" runs the chain alone on a recent or sample host event | integration |
| E18 | Wallet and money | Wallet floor at every start and before every paid request; cost on the hook run; the estimate per fire and, for event workflows, per event with "up to N runs an hour"; no cap (owner) | integration |
| E19 | Listener switched off or invalid | No deliveries while off; invalid: SKIPPED "Fix the workflow first: ..." and a header notice; events during off are not replayed on switch-on (the replay tool is) | integration |
| E20 | Listener table drift | Same-transaction writes plus the daily repair | integration |
| E21 | A stale browser tab saves a graph that drops `label`, `hooks` or a chain | Same risk as any new graph key; mitigated by the saved versions (the newest 50) and a note in the editor when a save removes hooks | unit |
| E22 | Delete or move a host, delete a shared chain | Deleting a host removes its hook lines; a chain is deleted only when no other host uses it, with a confirmation that counts the blocks | unit, body |
| E23 | Queries that count or pick runs by trigger or status | Each gets a `kind` rule and a test (step 0 list) | integration |
| E24 | Enum value and index migration | Two files; the index is swapped without a gap | migration test on a data copy |
| E25 | Message times are wall clock | Never compared with the real clock; "new" means stored by this read | unit |
| E26 | A hand-started Refresh or Test login starts a campaign workflow (the default is anyone, by the owner's choice) | The trigger's summary says who it reacts to in one sentence; "Recent events" shows who started each event; unticking "tasks I start by hand" and "retries" narrows it; `matchEvent` tests cover every `startedBy` mix | unit |

### UI and UX

| # | Case | Resolution |
| --- | --- | --- |
| U1 | Pills hidden until hover hide the feature, and dragging has no keyboard way | A block always shows a small "Hooks" control with a dot per attached hook; the side panel has a Hooks section with "Add a block", "Attach an existing chain", "Pause", "Remove" for each phase, so no drag is needed (`ACCESSIBILITY.md`) |
| U2 | Blocks have no names, so "after which block" is unreadable | Optional `label`, shown on the canvas, in run views, the overview, the event picker and ledger lines |
| U3 | Many hooks clutter the canvas | A "Show hooks" toggle (React Flow `hidden`), and a Hooks overview list at workflow level: block, phase, chain, on or off, fired and failed in the last run; a row focuses the chain |
| U4 | Reuse and copy | "Attach to more blocks" (multi-select, "all blocks") makes more lines to one chain; a shared chain's lines show only when the chain or a host is selected, otherwise the pill shows the chain's name; "Make a separate copy" to diverge; duplicating a block copies its attachments, not the chain |
| U5 | 50-block and 100-line caps | The picker and the overview show "31 of 50 blocks"; sharing a chain keeps it small; at the cap the message says why and suggests sharing or splitting |
| U6 | Phase wording | Pills say Before, On, After with sublabels "Before it starts", "While it works", "When it finishes"; for a block with no task the On sublabel says it starts at the same moment as Before; invite, reply and message blocks say "finishes when planned, not when sent" with the link to the task event template |
| U7 | A trigger that listens silently | The block shows Listening or Off, what it listens to, events in 24 hours (matched, started, skipped), the last event, the cost per event and "up to N an hour"; "Not listening: fix this" for an invalid workflow |
| U8 | History drowned in hook runs | The runs list shows main runs; hook runs sit under their host run and behind a "Show hook runs" toggle; a host run has a chip "Hooks: 14 fired, 1 failed"; trigger labels read "Event: after Send connection request, account Ada" or "Hook: after ..." with links; a filter by what started the run |
| U9 | A failed hook is invisible | The pill goes red in the run view with the error sentence; failures are grouped in the alerts per hook per day |
| U10 | Testing | "Test" on a trigger (recent event or sample) and on a hook (chain alone on a sample or recent host event), both under preview rules; "Send a test" on `Send via API` (sample envelope marked as a test, rate limited, same address rules) |
| U11 | A blank start | Three templates: reply to positive messages (act off), follow up an invite that went without its note, tell my system when a block finishes; each shows its cost per event or fire |
| U12 | Layout | Chains are placed in lanes beside their host; manual positions are kept; the layout is a spike to be checked in a browser |
| U13 | Accessibility | Pills and the Hooks control are buttons with names ("After hook of Withdraw old requests, 2 blocks attached"); dashed lines also differ by label and icon, not colour only; focus order, live-region announcements for attach and detach; keyboard pass, a screen reader and 200 percent zoom are listed in the PR |

### Data discovery

| # | Question | Resolution |
| --- | --- | --- |
| D1 | What does this event carry? | A reference generated from contracts (`TASK_EVENT_DETAILS`, `EVENT_FACTS`, block entries): fields, types, allowed values, an example; shown in the trigger and pill panels and in the `Send via API` panel |
| D2 | Samples | `sampleEvent(kind, task or block, phase)` makes realistic made-up JSON for every task and block; used by the Input tab, previews with no real event and "Send a test" |
| D3 | Real events | "Recent events" in the trigger: the newest 50 matching events with account, task, phase, verdict, time and what happened to each (started, skipped, why); open the JSON; "Run on this event" (preview, real items); "Replay" (a real run, confirmed, one per event and workflow every 10 minutes) |
| D4 | Why did it not fire? | "Check an event" lists each trigger filter with pass or fail from `matchEvent` |
| D5 | What happened to my events | An event log per workflow: deliveries with status, reason and run link, filterable, 30 days |
| D6 | Where did this session come from | The Sessions page gains "Started by" (owner, automation, workflow with link) and a campaign filter; its drawer shows the three events, the JSON and the workflows each one started or skipped, with reasons |
| D7 | Why is this person here | Event facts become the person's signal with a fixed sentence ("Replied, read at 10:30 on account Ada", "Invite went without its note"), shown in list reasons and My network; never message words in a list; the person's history shows "Invited by <workflow> on <date>" |
| D8 | Which campaign did this | Invites carry their origin; the trigger filters on it; item facts show it; older invites show "unknown" |
| D9 | What did it cost | Usage splits main runs, hook runs and event runs per workflow; ledger lines read "Hook: <label>"; cost per qualified lead counts all runs of the workflow (said on the page) |
| D10 | Why this mood | The mood item keeps a fixed-sentence reason (which rule matched) next to it; the words stay in the conversation, not in lists |
| D11 | Which hook did what | The overview shows last fired, last failure and counts for each hook |

### Security, privacy, rollout

- Every query is scoped by `userId`; the dispatcher never starts another owner's workflow; claims and replays are the owner's own.
- Nothing personal on events, deliveries, claims or run inputs; the envelope and items are rebuilt on demand; erasing a person removes their items and the rows the rebuild reads; `Send via API` still reaches only the HTTPS address the owner set, public addresses only.
- Acts still go through the domain services and stay off until "Act for real"; no event, hook or mood block sends anything on its own.
- Dev vs production: a new queue (`tasks.started`) asserted by brain at start, so brain, worker and spider go out together; two migrations; no new environment variable; events are recorded for every owner but only owners with listeners cost a dispatch; hooks exist only in graphs that have hook lines. CI runs unit tests only; integration tests run locally and are listed in the Outcome.
- Spider tasks: no task changes behaviour; the `spider-task-writer` checklist gets one optional line (declare `eventDetails` if a workflow would branch on the result).

## Approach

Each step starts with failing tests. Three releases, in this order; each ends with the full gate.

Release 1: task events end to end (steps 0 to 5 and 7a). Release 2: hooks (steps 6 and 7b). Release 3: discovery, claim and batching (steps 7c and 8).

- [ ] 0. Lock the plan. Before code: list every function that reads a graph's edges and say which gets the main graph (contracts, brain, body); list every query on `WorkflowRun` by `trigger`, `status` or `parentRunId` (`admit`, `promoteWaiting`, `runs`, `alerts`, `callsLastHour`, `inputPick`, `endStuck`, retention, `finish`) with the rule it gets; confirm `logic.if` fields, `Send via API` with zero items, `workingBlockBefore` with a start block and `logic.stop`; add golden tests that pin today's engine, liveness and queue behaviour.
- [x] 1. Contracts: `RunStart` and `FIRES` for `EVENT` and `HOOK`; the five block types and the `hidden` flag; `HOOK_PORTS`, node `label` and `hooks`, `splitHooks`, chain rules and messages; `matchEvent`; `EVENT_FACTS`, `TASK_EVENT_DETAILS`, `sampleEvent`; `envelopeCore` and its types; `eventSettings`; `accountMode: 'event'`; the mood rules and their table of real-looking replies. Rebuild the contracts dist.
- [x] 2. Model: migrations A and B, the index swap, retention additions.
- [x] 3. Origin and emission: `TaskService.request` takes an origin; workflow account blocks and system jobs pass it; invites record their origin; `TaskEventService.record`, the envelope builder, details for the first tasks, `settledBy` and `ready`; `tasks.started` in the spider runner and its consumer; the coverage test over the spider registry.
- [x] 4. Delivery: `WorkflowListener` sync and the repair job; `event-dispatch` (fan out, start, backoff, caps, guards, claim); `startRun` for `EVENT`; the trigger executors; items from details; monitor items.
- [x] 5. Blocks: `logic.ifEvent`, `process.messageMood`, `Send via API` event and test, `accountMode: 'event'` in `accountIdsOf`.
- [x] 6. (done; deviations in MEMORY.md: `on` at step start, `after` after `finishStep`, no estimate per fire) Hooks in the engine: `splitHooks` at start and `WorkflowRun.hooks`; the fire point in `runStep` and `finishStep`; `startHookRun` and its caps; the `kind` rules from step 0; the Stop cascade and Stop in a chain; `resumes`; the start block; preview; estimate per fire.
- [~] 7a. (trigger panel done; samples, Check an event and docs not) Body, release 1: the two trigger blocks (settings, listening status, recent events, event log, "Check an event"), run labels and links, `Send via API` documentation.
- [~] 7b. (done: dots, lines, dialog section, name, run view list; not done: overview, show or hide, attach an existing chain by button, copy and delete rules, hook alerts, test a hook) Body, release 2: the Hooks control and pills, lines, side panel section, overview, show or hide, attach to more blocks, copy and delete rules, labels, run view nesting and chips, test a hook, hook alerts.
- [ ] 7c. Body, release 3: reference and samples in panels, "Run on this event" and Replay, Sessions "Started by", campaign filter and events drawer, people signals and history, Usage split, templates.
- [ ] 8. Claim and batching ("collect events for N minutes": PENDING deliveries of one trigger inside the window start one run with the union of their items, de-duplicated by slug).
- [ ] 9. Docs and memory: `MEMORY.md` (the decision, the volume note and when to partition, what was not verified), the `spider-task-writer` skill's optional line, this plan's Outcome.

## Verification

- Tests first, by area. Unit: envelope builders, each task's details, `matchEvent`, `splitHooks` and every chain rule, `isFired` with `EVENT` and `HOOK`, guards, `logic.ifEvent` null handling, mood table, `eventSettings` whitelist walk, the spider-registry coverage test, `accountIdsOf` with `event`. Integration (real Postgres, own database per file): event writing in the request and result transactions; settle by import; a first read gives no arrivals; the dispatcher (one run per listening workflow, other owners skipped, own-origin skip, depth 5, hourly limiter, PENDING then started, DROPPED at 6 hours, claim); hook fires for a plain block, a failing block, a skipped block, a Retry, a resume, a For each of three batches, a loop, zero items, the 200 cap, a preview, a Stop; host run ending while a hook run waits; the index swap; every `kind` rule from step 0.
- `pnpm lint && pnpm ts:check --force && pnpm test:unit:run && pnpm build` and `pnpm --filter @automatedLinkedIn/brain test:integration:run`.
- Real path: brain, worker and spider locally with a test account, never a live send: a login check shows before, on and after in a trigger's recent events; the first example against a stored conversation fixture starts a run from the event with the mood and the envelope reaching a local `Send via API` listener; a hook on a plain block, on an account block in preview and on a For each; draw, attach, share, pause, delete and reload hooks in a browser, and run the keyboard, screen reader and 200 percent zoom checks; say what was and was not seen. The `on` event and the two examples against live LinkedIn are not verified until the owner runs them.

## Outcome

Filled in when done.
