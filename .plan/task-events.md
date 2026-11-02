# Task events: before, on and after every account task, as a workflow trigger

> Superseded on 2026-11-03 by [workflow-events-and-hooks.md](workflow-events-and-hooks.md), which merges this plan with `block-hooks.md` and resolves the edge cases found in review. Kept as the record of the owner's answers of 2026-11-02; build from the merged plan.

- Status: superseded <!-- draft | locked | in progress | done | superseded -->
- Created: 2026-11-02
- Locked by user: yes, 2026-11-02 <!-- change to "yes, <date>" only after the user confirms -->

## Goal

Every time one of the owner's accounts performs a task, brain records three moments (before, on, after) as a small JSON event, and a workflow can start from any of them. The workflow gets the account, proxy, input, who started the task and (after) the result with times, and can branch on it and act: read a new message's mood and answer, or learn whether an invite went out with its note.

## What exists today (checked in the code, 2026-11-02)

- A task is asked in `TaskService.request` (`apps/brain/src/database/task.service.ts`): one transaction runs the task's `onRequest` hook, saves the `SpiderSession` (`startedAt` is the request time, not the time the browser opened) and a `TaskDispatch` row; `TaskDispatchService.dispatch` publishes to `tasks.run` afterwards, and the worker job `task-dispatch` retries.
- The spider answers on `tasks.done`; the brain-worker consumer `taskResults` calls `applyTaskResult`, which runs the task's `onResult(session, result, tx)` inside the transaction that finishes the session (`database/taskHooks.ts`, one entry per task).
- There is no message from the spider when a run starts. `TaskResult` (`packages/contracts/src/tasks.ts`) carries `status`, `verdict`, a fixed `message`, an optional `report` (fixed sentences only), `started_at`, `finished_at`, `browser_seconds`.
- The useful data of a result arrives later: `onResult` queues an import row (`InviteImport`, `MessageImport`, `ConnectionImport`, `InvitationImport`, `ProfileImport`); a worker job reads the task's file and stores the domain rows (who was invited and whether the note went, the conversations and messages, new requests). The import row is marked `DONE` when stored.
- `SpiderSession.trigger` is `manual | automatic | retry`. A workflow's account block starts its task with `automatic`, and `AccountActionCall` (run, block, person, account) is the only link back to the workflow run.
- `SpiderSession.proxyServerId` and the `proxyProtocol/Host/Port/Country` columns say which proxy the run used.
- Workflow triggers are `trigger.manual`, `trigger.schedule`, `trigger.api`, `trigger.workflow` (`packages/contracts/src/workflow.ts`, `isFired`, `FIRES`). `WorkflowService.startRun(userId, workflowId, trigger, runKey, { input })` is the one way to start a run; `runKey` is unique, so a repeated start is refused; a second live run of the same workflow queues (up to `MAX_QUEUED`); chained runs carry `depth` and stop at `MAX_CHAIN_DEPTH` (5).
- Blocks already able to act on what a run holds: `logic.if`, `logic.else`, `logic.taskResult`, `logic.retry`, `process.tag` (labels), `account.replyToConversation` (takes `conversation` items), `account.sendMessage`, `account.sendInvite`, `output.sendApi` (posts what reaches it as JSON), `output.return`.
- No model or sentiment code exists anywhere in brain. `score.icp` is rule based.
- A block's `output` kind is static: `BLOCKS[type].output` is read by `edgeNotes` and `convertsTo` (a conversation becomes the person in it where people are wanted, never the other way). So one trigger cannot give people for one task and conversations for another, which is why there are two trigger blocks. Checked 2026-11-02.
- Which tasks need an account is already announced by the worker: every catalog entry (`TaskService.catalog()`, `TaskCatalogEntry.needs.account`) says so, so "every account task" is read from the catalog, not from a list in the code.
- `TaskService.emit(event, ...)` already exists for the opposite direction (brain tells a task something happened, for example `proxy.active`). The new feature is a different thing; the code calls it a task event (`TaskEvent`) and never `emit`.

## Requirements

Confirmed (from the owner's request):

- Three events for any task an account performs: before, on, after.
- Each event is passed to the next block as JSON.
- Before: account, proxy, input, started by. On: the same. After: result, input, account, proxy, start time, finish time, started by.
- Every account task, the ones that exist and every one added later, gets all three events with no code of its own, and a new task shows up in the trigger's task picker by itself. The design must hold at many accounts and many workflows (see "Built for every task, now and later").
- A workflow can run on any of them; examples: act on a positive or negative message found; after a reply or invite, know whether the invite went with its note.

Decided with the owner (see the answers below):

- Before means: brain accepted the request and saved the session; nothing has gone to the worker yet.
- On means: the worker began the run (needs one new spider message, `tasks.started`).
- After means: the result is stored and the task's data is in brain (the import is done), so the event can carry the details; it waits at most 15 minutes for that, then fires without details and says so.
- Observe only in this version: an event never stops, delays or changes a task.

Answered by the owner on 2026-11-02 (every recommended answer):

- On means the worker really began the run (new spider message `tasks.started`; brain, worker and spider deploy together).
- Observe only: an event never stops, delays or changes a task.
- Mood of a message by rules the product ships now; a model later, as its own decision.
- Two trigger blocks: "When an account runs a task" (gives people) and "When a message arrives" (gives conversations).
- Defaults accepted: a workflow ignores events caused by its own runs, chains stop at depth 5, at most 30 event runs per workflow per hour; tasks started by hand and by the system fire too and the trigger filters on who started them; events kept 30 days with no personal text on the event row.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: the `TaskEvent` record and its emission for every account task; `startedBy` and the real start time on the session; the `trigger.taskEvent` and `trigger.messageArrived` blocks; a block to branch on event facts (`logic.ifEvent`); a block to read the mood of a message (`process.messageMood`, rules); JSON of the event in `Send via API` and in the run view; optional per-task `details` (first for invite, reply and message, messages read, requests read, connections read, post); the two example workflows as starting templates; tests, docs, `MEMORY.md`.
- Out of scope: stopping or changing a task from an event; a model for mood; webhooks to outside systems other than the existing `Send via API` block; events for tasks with no account (`browser-detection`); events for brain-only actions that do not run a task; replaying old events; a page that lists every event (the trigger block shows its latest ones, an admin page can come later).

## The event, as JSON

One envelope for all three, versioned. No secret, session token, proxy password or account password is ever in it.

```json
{
  "version": 1,
  "event": "after",
  "id": "<event id>",
  "task": "linkedin-invite",
  "taskVersion": 3,
  "sessionId": "<session id>",
  "account": { "id": "...", "email": "...", "displayName": "..." },
  "proxy": { "id": "...", "protocol": "http", "country": "IN" },
  "input": { "...": "the task's own input" },
  "startedBy": { "kind": "owner | automation | workflow | retry", "job": "invite-send", "workflowId": "...", "runId": "...", "nodeId": "..." },
  "requestedAt": "...",
  "startedAt": "...",
  "finishedAt": "...",
  "durationMs": 41000,
  "result": { "status": "SUCCEEDED", "verdict": "DONE", "message": "...", "report": { "headline": "...", "sections": [] } },
  "details": { "invites": [{ "slug": "ada-lovelace", "outcome": "SENT_WITHOUT_NOTE", "noteSent": false }] }
}
```

- `before`: no `startedAt`, `finishedAt`, `durationMs`, `result`, `details`. `on`: adds `startedAt`. `after`: all of it; `details` is `null` with `"detailsStatus": "late"` when the import did not finish in 15 minutes.
- The envelope is built when it is delivered, from `SpiderSession` (input, account, proxy, times, verdict) and the task's own rows, never copied onto the event row.

Details are optional and declared per task (`TASK_EVENT_DETAILS` in contracts, see "Built for every task, now and later"). The first ones, because the owner's examples need them:

| Task | `details` |
| --- | --- |
| `linkedin-invite` | `invites`: slug, name, `outcome` (`SENT`, `SENT_WITHOUT_NOTE`, `NOT_SENT`, `NO_CONNECT`, ...), `noteSent` true, false or null; `withdrawn`: slug, outcome |
| `linkedin-reply`, `linkedin-message` | `replies`: slug, conversationId, state (`SENT`, `FAILED`, `UNKNOWN`) |
| `linkedin-messages` | `conversations`: conversationId, slug, name, `newMessages` (direction, text up to 500 characters, sentAt), `truncated`; only messages stored by this read, at most 50 conversations, and only messages from the last 48 hours so a first read of an old account does not flood |
| `linkedin-invitations` | `requests`: slug, name, note, new in this read |
| `linkedin-connections` | `connections`: slug, name, new in this read; `removed` for a removal run |
| `linkedin-post` | `post`: state, link |
| every other task, and every task added later | none until someone declares them: the envelope (account, proxy, input, who started it, times, verdict, report) is complete without them, and `details` is `null` |

## Built for every task, now and later

The rule: emitting an event never names a task. Anything a new task needs is one optional line, never a precondition.

1. **One choke point per event, keyed on the catalog.** `before` is written inside `TaskService.request` (the one place any session is made), `on` by the consumer of the spider's started message, `after` inside `applyTaskResult` (the one place any session ends). Each writes through `TaskEventService.record(tx, sessionId, phase)`, which asks only whether the task's catalog entry has `needs.account`. A task the spider announces tomorrow is covered the moment the worker announces it. The tests walk the real spider registry (`apps/spider/src/tasks/registry.ts`) and a fake task, and assert that every account task produces all three events; they fail if a task is skipped, so coverage cannot silently drop.
2. **Three layers, each optional above the first.**
   - Layer 0, the envelope: built from `SpiderSession` alone. Works for every task with zero code.
   - Layer 1, `details`: a task that produces something a workflow would branch on adds one entry to `database/taskHooks.ts` (`eventDetails(session, db)`, the same file that already lists each task's brain-side effect) and one entry in contracts `TASK_EVENT_DETAILS` (the task, a version number, and the facts: key, label, type, allowed values). No entry means `details: null`, never an error.
   - Layer 2, what the owner sees: the trigger's task picker (from the catalog), the "If the event says" fact picker and the run view are generated from `TASK_EVENT_DETAILS`, so a new declaration appears in the editor with no body code. A task with no declaration offers the envelope facts only (verdict, who started it, account, duration).
3. **Settle without per-task code.** A task whose result is imported later says so in its hook (`settledBy: 'import'`, naming the import row it queues); each `*Import` service calls one function (`TaskEventService.ready(sessionId)`) where it marks `DONE`. A task with no import is ready at once; any task is ready after 15 minutes regardless, so a missing call can delay an event, never lose it.
4. **Versions.** The envelope carries `version`, and each task's details a `detailsVersion`. Changes are additive (new keys); a removed or renamed key ships as a new `detailsVersion`, with the old builder kept until no saved workflow uses it. A saved condition on a fact that no longer exists does not match and the block shows a warning, like a block that needs `upgradeGraph`. `phase` is text checked by zod, not a database enum, and so is the run start value, so a later phase (for example `progress` or `retry`) needs no migration.
5. **Degrades, never breaks.** The spider's started message is published by the runner's own lifecycle for every task (not by tasks), and a failure to publish is logged and ignored. An old spider that sends none gives no `on` event and everything else works; a brain that does not know the queue yet is the reason brain asserts it first (deploy order: brain, then spider). Event recording and dispatch can never fail or slow a task: recording is two small inserts inside transactions that already exist, and dispatch is a separate job.
6. **Scale.**
   - Volume: three small rows per session. At 1,000 accounts, 50 sessions a day each and 30 days kept, that is about 4.5 million rows of a few hundred bytes, which one indexed table holds; the retention job deletes in chunks. Partitioning is only revisited past about 50 million rows (a note in `MEMORY.md`, not built now).
   - Finding listeners: a normalised table `WorkflowListener` (workflowId, nodeId, userId, phase, task or null for any, plus the trigger's other filters as columns that matter), kept in step with the graph whenever a workflow is saved or switched on or off, indexed on `(userId, phase, task)`. A lookup per event is one indexed query; no graph is read, and an owner with no listener costs one `exists`.
   - Throughput: `task-event-dispatch` takes events in batches of 200 with `FOR UPDATE SKIP LOCKED` and a lease, so several worker replicas share the work; it takes at most 20 events per owner per tick so one busy owner cannot starve the others (the same fairness the read worker lacked, `MEMORY.md`); one event starts at most 20 workflows of its owner.
   - Isolation: a poison event (five failed deliveries) is parked with its error kind and no longer picked; a slow or failing listener never holds back another's; each skip carries a fixed reason (busy queue, wallet low, loop rule, hourly cap) counted in the cron monitor.
7. **A task that has no account** (`needs.account` false) never produces events; if the catalog later says otherwise for a task, it starts producing them by the same rule.

## Approach

Phases in order; each starts with the failing tests. Phase 1 and 2 need no spider change.

- [x] 0. Open questions answered and the plan locked (2026-11-02). Still to check while building phase 7: that a block's `output` kind is static (read `outputOf` in `validate` and the canvas); the owner chose two trigger blocks either way.
- [ ] 1. **Model (additive migration).** Table `TaskEvent` (id uuid7, userId, sessionId FK cascade, accountId, task, phase as text, `at`, `readyAt`, `claimedUntil`, `dispatchedAt`, `attempts`, `lastError`), unique `(sessionId, phase)`, index on `(dispatchedAt, readyAt)` and on `(userId, at)`. Table `WorkflowListener` (workflowId FK cascade, nodeId, userId, phase, task nullable, the trigger's filters), unique `(workflowId, nodeId)`, index `(userId, phase, task)`; filled from the graph on every save and on enable or disable, and once for existing workflows by a migration that finds none. `SpiderSession.runStartedAt` and `SpiderSession.origin` (JSON: kind, job, workflowId, runId, nodeId). `LinkedInInvite.noteSent Boolean?` (set where `store` settles an invite, so the answer is not read back from a sentence).
- [ ] 2. **Start origin.** `TaskService.request` takes an `origin` option (default from `trigger`: manual is the owner, automatic is automation with the calling job's name); the workflow engine's account blocks pass `{ kind: 'workflow', workflowId, runId, nodeId }`; the `retry` trigger names the session it retries.
- [ ] 3. **Emit before and after, for every account task.** `TaskEventService.record(tx, sessionId, phase)` is the only writer and checks the catalog's `needs.account`, never a task name. `before` is written in the request transaction (a refused request leaves no event); `after` in `applyTaskResult`'s transaction with `readyAt` set when the task's hook has no `settledBy`, else null until its import calls `TaskEventService.ready(sessionId)`; the dispatcher treats an `after` older than 15 minutes as ready with `details` late. A test iterates the spider registry and a fake task and fails when an account task does not produce all three events.
- [ ] 4. **Build the envelope and the optional details.** `TaskEventService.envelopeOf(event)` builds layer 0 from `SpiderSession`. A task that has details adds `eventDetails` to its entry in `taskHooks.ts` (first ones: invite, reply and message, messages read, requests read, connections read, post; each one small function, tested against real rows, read only) and its facts to `TASK_EVENT_DETAILS` in contracts. A task with neither gets `details: null`; a test proves that, so a new task needs nothing.
- [ ] 5. **Dispatch to workflows.** New worker job `task-event-dispatch` (every 10 s, `defineJob`, title and purpose set, an `items` entry per event handled for the cron monitor, nothing logged when idle): takes ready events in batches of 200 (`FOR UPDATE SKIP LOCKED`, lease in `claimedUntil`, at most 20 per owner per tick), reads the owner's matching rows of `WorkflowListener`, and calls `WorkflowService.startRun(userId, workflowId, 'EVENT', runKey, { input: envelope })` with `runKey = taskEvent:<eventId>:<workflowId>:<nodeId>`, at most 20 workflows per event. A refused start (busy queue, wallet low, workflow needs fixing) is recorded as skipped with the fixed sentence and never retried; five failed deliveries park the event. New `RunStart` value `EVENT` (text) and `FIRES.EVENT = [trigger.taskEvent, trigger.messageArrived]`.
- [ ] 6. **Guards** inside the dispatcher: skip an event whose `origin.workflowId` is the workflow itself (unless the trigger's "Also react to this workflow's own tasks" is on, off by default); the run's `depth` is the origin run's depth plus one and stops at `MAX_CHAIN_DEPTH`; at most 30 event runs per workflow per hour; the account must belong to the workflow's owner (events are looked up by `userId`, never across owners).
- [ ] 7. **Blocks (contracts, executors, body).** `trigger.taskEvent` ("When an account runs a task": event, task or any, accounts or any, started by, verdicts for after; gives the people in `details`). `trigger.messageArrived` ("When a message arrives": gives conversations with the new message words in the item). `logic.ifEvent` ("If the event says": conditions on a closed list of facts per task, for example `note sent is no`, `outcome is`, `verdict is`, `mood is`, no free JSON path; passes the matches, Else gets the rest, same rules as `logic.if` and the ports of phase 3 of the engine). `output.sendApi` adds `event` (the envelope) to the JSON it posts when the run was started by an event, and `output.return` can return it. Items made from `details` are written to `WorkflowItem` when the run starts (the existing 14-day rule applies).
- [ ] 8. **Mood.** `process.messageMood` ("Read the mood of a message"): rules in `packages/contracts` (a pure function, word lists for English first, unit tested with a table of real-looking replies, including negation such as "not interested" and "no thanks"), writes `mood` (`positive | negative | question | out_of_office | unsubscribe | neutral`) on each item; `logic.ifEvent` and `output.sendApi` read it. A wrong guess is possible, so the block says in its summary that it reads words, not intent, and keeps the original text next to it.
- [ ] 9. **On event, for every task.** The spider's runner (the shared lifecycle in `apps/spider/src`, not any task) publishes `tasks.started` when it opens a task (contract `taskStartedSchema`: task_id, started_at, worker build); a failure to publish is logged and ignored, never a task failure. New queue asserted in `topology.ts` by brain, so deploy brain first, then the worker and spider. A brain-worker consumer `taskStarted` sets `SpiderSession.runStartedAt` once and records the `ON` event (a repeated message changes nothing; a message after the result is dropped; an unknown session is dropped); the result's `started_at` stays the truth for `after`. Tests: a runner test with a fake task proves the message is sent for a task that knows nothing of events, and that a broker error does not fail the task.
- [ ] 10. **Body.** The trigger blocks' settings use existing field kinds (selects, `accounts`, multi); the block shows "Recent events" (the last five that matched, their run and whether they were skipped) from `workflow.taskEvents`; the run view says "Started by: after Send connection request, account X" and shows the envelope; `Send via API` documents the extra field.
- [ ] 11. **Templates** for the two examples (see below), built only from the blocks above and made through the existing "start from a template" path.
- [ ] 12. **Docs and memory.** `MEMORY.md` (decision, the volume note and when to partition, the real-world checks not done), the `spider-task-writer` skill and its checklist gain one optional line: if the new task produces something a workflow would branch on, add `eventDetails` and its `TASK_EVENT_DETAILS` entry; the events themselves need nothing. The plan's Outcome.

## The two examples, as workflows

1. **Act on a positive or negative message.** `When a message arrives` (account: any, started by: anyone) -> `Read the mood of a message` -> `If the event says: mood is negative` -> (yes) `Add label: unhappy` -> `Send via API` (tell my own system); the Else goes to `If mood is positive` -> `Reply in a conversation` (the owner's words, "Act for real" off until the owner switches it on).
2. **Did the invite go with its note?** `When an account runs a task` (after, `linkedin-invite`, verdict done) -> `If the event says: note sent is no` -> (yes) `Add label: invited without note`, then `Send via API` or `Send message` later; the Else ends the run. The same shape works for `linkedin-reply` with `state is failed`.

## Edge cases and risks

- **Loops.** A reply block makes a reply task, whose after event can start the same workflow again. Covered by the own-origin rule, the depth cap and the hourly cap (phase 6); each has a test, including two workflows that trigger each other.
- **Flood.** The invite job runs every few minutes per account and the messages read every 30 minutes; with several accounts and workflows the queue per workflow fills (`MAX_QUEUED`). A full queue skips the event and says so; nothing is retried. If the owner needs every event, batching ("collect events for N minutes into one run") is the next step, not part of this one.
- **Duplicates and ordering.** Results can be redelivered; `(sessionId, phase)` is unique and `runKey` includes the event id, so an event fires each workflow once. An `on` after the result is dropped; an `after` never fires before its `before` was written because both come from the session's own transactions.
- **Settle wait.** Waiting for the import delays the after event by up to the import job's tick (seconds to a minute) and at most 15 minutes. A failed import (`lastError`, retries exhausted) lets the event go with late details instead of never.
- **UNKNOWN verdicts.** A task that ended unsure may or may not have sent something. The event says `UNKNOWN` as it is; `noteSent` is null then, and `logic.ifEvent` treats null as "not known", which matches neither yes nor no of "note sent is no" unless the owner picks "not known".
- **Privacy.** Message words, names and notes are other people's personal data. They are never stored on the event row (reference only), are read from brain's own rows when the run starts, live in `WorkflowItem` (14-day rule), and leave the system only through a `Send via API` block the owner added, to the HTTPS address the owner gave. `input` of a send task holds the owner's own words and recipients and is already stored on the session; the envelope shows it to the owner's own workflows only. Erasing a person deletes their items already; the events hold no personal text, and `details` is rebuilt from rows that erasure removes. Never in the envelope: account or proxy secrets, session tokens, the supplier's name, the worker's file paths.
- **Security.** Events are scoped by `userId` at every query; the dispatcher never starts another owner's workflow; the API trigger and the event trigger do not share tokens; the envelope is JSON data and never executed or interpolated into a block's words (the existing `fillWords` placeholders still only read the person's own fields).
- **Acts stay behind "Act for real".** A workflow started by an event can reach an act block; every act still goes through the domain service that keeps the limits and stays off until the owner arms it (the existing rule of Account Actions). The mood block and the event trigger never send anything themselves.
- **Mood is a guess.** Rules mislabel sarcasm, other languages and mixed messages. The block keeps the text, says what it is, and `neutral` is the default; nothing destructive (Do not contact, remove connection) is offered after a mood in a template.
- **Cost.** Starting a run checks the wallet floor as before; events that read nothing cost nothing, but a workflow that collects after an event spends the owner's wallet like any run, so the trigger shows the estimate the way other triggers do.
- **Existing data and migration.** All additive: new table, nullable columns, a new array column defaulting to empty, a new enum value for `RunStart`. No backfill: old sessions have no events and old workflows listen to nothing. Rollback is dropping the new table and columns; nothing else reads them.
- **Dev vs production.** The new queue `tasks.started` is asserted by brain at start (the topology file), so brain, brain-worker and spider must go out together; staging needs the new migration and the three images. No new env variable. The `listensTo` GIN index is small.
- **CI.** Unit tests only run in CI; the integration tests (event writing in the request and result transactions, settle by import, dispatcher, guards) run locally and are listed in the Outcome.
- **Spider tasks.** No task changes behaviour, so the `spider-task-writer` checklist is not applicable except for the new declaration line; the runner change is one published message.

## Verification

- Tests first, per phase: unit tests for the envelope builder, each task's `details`, `isFired` with `EVENT`, the guards, `logic.ifEvent`, the mood rules table the contracts registry of details (each declared fact matches its builder; a task with no declaration gives `details: null`), and a coverage test that walks the spider registry and a fake task and asserts all three events for every account task; integration tests (real Postgres) for: a request writes `before` in its transaction and a refusal writes none; a result writes `after` once on redelivery; an invite import marks the event ready and `noteSent` reaches the details; a read import gives only the new messages; the dispatcher starts one run per listening workflow, skips another owner's, skips a workflow's own events, stops at depth 5 and at 30 an hour, and records a skipped start.
- `pnpm lint && pnpm ts:check --force && pnpm test:unit:run && pnpm build` and `pnpm --filter @automatedLinkedIn/brain test:integration:run`.
- Real path: brain, worker and spider locally with a test account (never a live send): start a login check and see `before`, `on`, `after` in the trigger block's recent events; run the first example against a stored conversation fixture and see a run start from the event with the mood and the envelope in `Send via API` (to a local listener); open the trigger block, the run view and the picker in a browser and say what was and was not seen. The `on` event and the two examples against live LinkedIn are not verified until the owner runs them.

## Outcome

Filled in when done.
