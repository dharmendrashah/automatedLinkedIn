# Task outbox: a task is saved first and published until the broker has it

- Status: done
- Created: 2026-10-16
- Locked by user: yes, 2026-10-16

Follows `.plan/brain-worker.md` (done, PR 48), whose job framework this plugs into. It was left out of that PR on purpose.

## Goal

Today a task is saved in Postgres and then published to RabbitMQ as two separate steps. If the process stops between them, or RabbitMQ is briefly unreachable, the task is lost or the request fails. After this change the request saves the session and a small "to publish" row in one transaction, and the task is published right away with a fallback: the brain worker keeps trying until the broker confirms. A task that was accepted is never lost.

## What exists today (checked in code, 2026-10-16)

- `TaskService.request` (`database/task.service.ts`) checks ownership, needs, proxy and policy, runs the task's `onRequest` hook, saves the session (`SpiderSessionService.startTask`), then publishes (`TaskQueue.publish`). Each step uses `PrismaService.client` on its own, so none of it is one transaction.
- If the publish fails, the code marks the session `FAILED` with `NOT_QUEUED` and answers "The task could not be queued". A crash between the save and the publish leaves an `IN_PROGRESS` session that never gets an answer (it shows "No answer" after 30 minutes).
- The `linkedin-login` hook (`onRequest`) has already written `validationId` on the account by then. After a failed publish nothing clears it, and `requestIfWaiting` skips an account that has one, so the account waits until the owner presses Verify.
- `statusOf` in `linkedInLogin.hooks.ts` turns an unknown verdict into `NEEDS_REAUTH`, so a `NOT_QUEUED` result run through the hook would wrongly tell the owner their credentials need fixing.
- Callers of `request`: the `task.run` resolver, `LinkedInAccountValidationService`, and `TaskService.emit` (for example `proxy.active`, after a proxy test). All of them go through the one method.
- The brain worker already has `defineJob`, health reporting and a quiet-when-idle rule.

## Requirements

Confirmed (answers of 2026-10-16):

- R1 The outbox is its own plan and its own PR, after the brain worker.
- P1 Checks that refuse a request (ownership, needs a proxy, cooldown, one at a time, the task's `onRequest` refusal) stay synchronous, before anything is saved. The owner still gets an instant, readable answer for those.
- P2 One transaction saves the session, the effect of `onRequest` and the "to publish" row. The hook gets the transaction as `onResult` does now.
- P3 After the commit the API tries to publish at once. If that fails it does not fail the request: the row stays, and the worker's `task-dispatch` job publishes it with a back-off (Q1: publish at once, job as fallback).
- P4 The outbox row holds no secrets. The command is built at publish time from the session, the account and the chosen proxy, so credentials are not copied into another table.
- P5 A row that is not published within 15 minutes ends the session as `FAILED` with verdict `NOT_QUEUED`, through the same path as a result from the spider (so the task's hook runs and the account is not left waiting) (Q3: 15 minutes).
- P6 No change to the message contract or the web app: the session is `IN_PROGRESS` from the request, as now (Q5). The only addition to contracts is a label constant (`CANCELLED`, rule R-H).
- P7 When RabbitMQ is down at request time the request is accepted and the task runs when the broker is back, up to the limit in P5 (Q2).
- P8 The spider gets a duplicate guard in this same PR (Q4): a task whose `task_id` already has a `done.json` marker is acknowledged without running. See "Spider duplicate guard".

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: a `TaskDispatch` table, a `TaskDispatchService`, `request` saving atomically, publish at once with fallback, the `task-dispatch` worker job, giving up through the hooks, health numbers, fixing `NOT_QUEUED` in the login hook, the spider duplicate guard, tests, docs.
- Out of scope: exactly-once delivery, waking the job with LISTEN/NOTIFY, a "Queued" state in the UI, moving `emit` and its triggers anywhere else, a change to the task message schemas (one new runner verdict label, `CANCELLED`, is added to the constants).

## Design

### Data (one additive migration)

```
model TaskDispatch {
  sessionId     String   @id            // the task id, same as SpiderSession.id
  session       SpiderSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  createdAt     DateTime @default(now())
  attempts      Int      @default(0)
  nextAttemptAt DateTime @default(now())
  claimedUntil  DateTime?               // a lease, so two publishers never take the same row
  lastError     String?                 // a fixed sentence or an error class, never message content
  @@index([nextAttemptAt])
}
```

A row exists only while the task waits to be published. A successful publish deletes it. `SpiderSession` is not changed, so no enum value is added and none of the existing `IN_PROGRESS` checks (policy, takeover, retry, "No answer") needs to learn a new state.

### Request path (`TaskService.request`)

1. All current checks, unchanged and in the same order.
2. Build the command in memory and validate it with `taskCommandSchema` (see rule R-A below), so a command that can never be published is refused now, not 15 minutes later.
3. One `$transaction`: `onRequest(context, tx)`, create the session, create the `TaskDispatch` row. `startTask` takes an optional transaction client and no longer deletes old sessions (rule R-B). Any failure rolls back all three, which also closes the dangling `validationId` gap.
4. After the commit: delete sessions past retention (best effort, outside the transaction), then `TaskDispatchService.dispatch(id)` once with a 5 second limit. It never throws to the caller (P3). `request` resolves to `{ id }` as before.

`onRequest` gets `tx` as its second argument. `linkedInLogin.hooks.ts` uses it instead of `PrismaService.client`. The refusal rule is unchanged: throwing `TaskRefusedError` rolls back and refuses.

### `TaskDispatchService` (in `database/`, used by the API and the worker)

- `dispatch(sessionId)`: claim the row with one conditional update (`claimedUntil` empty or past, set to now plus 60 s). Count 0 means someone else has it. Then build the command, `TaskQueue.publish` (which waits for the broker's confirm), and delete the row. On a publish error: `attempts + 1`, `nextAttemptAt` from the back-off (10 s, 30 s, 2 min, then 5 min), `lastError`, release the lease.
- Build the command from the session (`task`, `taskVersion`, `userId`, `startedAt` as `requested_at`, `trigger`, `requestParams.input`), the catalog entry (`needs`), the account's sealed secret and email (only when `needs.account`), and `ProxyServerService.pickForAccount(accountId, proxyServerId)` for the proxy. Nothing here is copied into the outbox.
- If the command cannot be built (the proxy was removed or is no longer usable, the task left the catalog), the task cannot ever run: end the session now with the matching runner verdict (`NEEDS_PROXY` or `UNKNOWN_TASK`) through the give-up path below.
- `dispatchDue(now, limit)`: rows with `nextAttemptAt` due and no live lease, oldest first, at most 50 a run, each through `dispatch`. Rows older than the limit (P5) go to give-up instead.
- Give-up (`failSession`): build a `TaskResult` with status `FAILED`, the verdict, one fixed sentence, no files, and apply it through `TaskService.applyResult`, so the session ends in the same transaction as the task's `onResult` hook, and delete the row. `NOT_QUEUED` is added to the error list in `statusOf` so an account is not marked as needing new credentials.

### Spider duplicate guard (`apps/spider/src/tasks/runner.ts`)

The broker delivers at least once, so the same `task_id` can arrive twice: brain publishing again after a crash between the confirm and the delete, or RabbitMQ redelivering after a worker stopped between publishing the result and acknowledging. Today the second delivery runs the task again, and for `linkedin-login` that is a second sign-in.

- After the result is published, the runner writes `<runPrefix>/done.json` with `store.create` (create if absent). It is written for every run, whether or not recording is on (`manifest.json` only exists when a recording was saved, so it cannot be the signal).
- Before it does any work, the runner reads that key. If it exists, the command is acknowledged without running and one log line says so (`spider job skipped: already done`). For a task that needs an account the check comes right after the account lease is taken (and before the credentials are opened), so a duplicate that arrives while the first run is still going waits for the lease and then finds the marker. A task without an account checks at the start. The early refusals (unknown task, invalid input, no proxy) come before the check; repeating one is harmless.
- The marker is written only when a result was published, on every path that publishes one. A run that throws for the broker to retry (the browser crashing, the task failing) publishes nothing and writes no marker, so its retries (same `task_id`, `x-retries` header) are never skipped.
- Any read error other than "not found" (a permission or network error on the bucket) counts as "not done" and is logged: the run proceeds, which is today's behaviour, rather than dropping a task because the guard could not be consulted.
- The marker is written after the publish, never before: a crash between the two means the run repeats (the safe direction), where the other order would lose the answer.
- It lives under `runs/`, so the existing 7 day lifecycle rule deletes it. A manual retry has a new `task_id`, so it is never affected.
- `ObjectStore` gets no new method: a read that ends in `ObjectNotFoundError` means "not done" (the marker is a few bytes), and `create` is the write. Tests use the existing in-memory store.
- No contract change. The spider and brain deploy separately; either order is safe, since a guard without the outbox only skips real duplicates and an outbox without the guard behaves as today.

### Rules found in review (2026-10-16)

The first version of this plan was read again against the code. These are the gaps it had, each with the rule that closes it.

- **R-A Refuse a command that can never be published, at request time.** Today `TaskQueue.publish` validates the command and a failure became "could not be queued" at once. With the outbox that failure would surface only at give-up, 15 minutes later. `request` builds the command and runs `taskCommandSchema.parse` before the transaction (too large an input, a user id that does not fit the pattern) and answers with `TaskRefusedError`. At publish time a validation error is permanent: give up at once, do not retry.
- **R-B The retention delete leaves `startTask`.** `startTask` deletes sessions older than 30 days in a `try/catch` right after the insert. Inside a transaction a failed statement poisons the whole transaction, so the `catch` would hide the failure and the commit would fail. It moves to after the commit.
- **R-C Claim on the database clock, with one statement.** Due rows and leases are decided by `now()` in SQL (`UPDATE ... WHERE ... RETURNING`), not by the clock of the API or worker pod, so skew between pods cannot double-claim. Due means `nextAttemptAt <= now()` and (`attempts > 0` or `createdAt <= now() - 15 s`), so a fresh row is left to the inline publish.
- **R-D Look at the session first.** `dispatch` starts by reading the session. If it is no longer `IN_PROGRESS` (the spider already answered, the owner or retention removed it) the row is deleted and nothing is published. This stops a duplicate publish from running a task whose answer was already recorded, and stops a retry after a failed delete.
- **R-E Give-up goes through the same claim.** Give-up takes the lease like a publish does. Without it a row could be published and failed at the same moment, and the spider would run a task whose session is already `FAILED`, so a sign-in would happen with no record of it.
- **R-F Never fall back to a direct connection.** A task whose session held a proxy (`requestParams.proxy` is not null) must not run without one. At publish time, if the proxy row is gone (`proxyServerId` is null) give up with `NEEDS_PROXY`. If the row exists but is not usable right now (for example `UNREACHABLE` after a test), keep retrying until the limit, because it may recover during the wait. A task that never had a proxy (`needs.proxy` is `none` or `optional` with none picked) publishes without one, as today.
- **R-G A paused account does not run.** Pausing an account used to be checked only when a check was requested. With a wait of up to 15 minutes, `dispatch` re-reads the account of a task that `needs.account` and gives up with the new `CANCELLED` verdict when it is `DISABLED` (the repo rule is that automation skips paused accounts). A deleted account has already removed the session by cascade (rule R-D).
- **R-H Give-up verdicts and what they do to the account.** The `linkedin-login` hook maps verdicts to account states today, and an unknown verdict falls to `NEEDS_REAUTH`, which tells the owner to fix credentials after a check that never ran. For verdicts where nothing was tried: `NEEDS_PROXY` puts the account back to `PENDING` with the existing "Add a proxy to verify this account" message and clears `validationId`, so `requestIfWaiting` starts it when a proxy works; `NOT_QUEUED` and `UNKNOWN_TASK` give `ERROR` with the sentence; `CANCELLED` only clears `validationId` and leaves the status alone. `CANCELLED` is a new label in `RUNNER_VERDICTS` (a constant of labels, no schema change); the web app reads runner labels from the catalog call, so it needs no change. `pnpm --filter @automatedLinkedIn/contracts build:lib` before the brain tests.
- **R-I A row whose give-up keeps failing.** If `applyResult` throws because the task's hook throws, the row would be retried every run and the log would never be quiet. Give-up gets its own back-off, and after 3 failed give-ups the session is ended directly with `SpiderSessionService.fail` (no hook, one error line), and the row is deleted. A session never stays `IN_PROGRESS` because of a bug in a hook.
- **R-J Bounded work per run, no head-of-line blocking.** The job takes at most 20 rows, one after the other, and stops when its signal is aborted (the job's limit is 2 minutes, and each publish is limited to 5 seconds, the same limit as the inline one, which is below the 60 second lease so a slow publish cannot be taken over while in flight). The first transport failure (broker down) ends the run, since the other rows would fail the same way and each costs a connect timeout. A permanent failure (R-A, R-F) is handled per row and does not end the run, so one bad row never blocks the rest.
- **R-K Log per change, not per retry.** The job logs the first failure of a row, a publish that succeeded after a failure, and each give-up. Retries in between are silent. A long outage therefore writes a few lines, not one every 10 seconds (the staging idle checker counts non-noise lines as activity, and a retry loop would keep staging awake for nothing).
- **R-L `requested_at` is the session's `startedAt`, exactly.** Brain checks the files in a result against the folder it computes from `startedAt`, and the spider writes under `runPrefix` from `requested_at`. Building the command at publish time must use the stored `startedAt` (millisecond precision, as saved), never the time of the publish, or every file of the run would be dropped as outside its folder. A test pins it.
- **R-M After a long outage the backlog goes out at once.** Up to 20 rows per run, every 10 seconds, so a 15 minute backlog drains in a few runs and the spider takes them one at a time, with the account lease keeping one run per account. Nothing is reordered or dropped except by the age limit.

### Worker job (`worker/jobs/taskDispatch.ts`, one line in `worker/jobs/registry.ts`)

`everyMs` 10 s, `startAfterMs` 15 s, timeout 2 minutes. It calls `dispatchDue` and returns a summary only when it published or gave up something, so an empty table writes no log line (staging's idle checker counts log lines). Rows younger than 15 seconds are left alone, so the job does not race the inline publish; the lease makes a race harmless anyway.

### Health

The worker's `/health` gets `taskDispatch: { waiting, oldestSeconds }` (a count and the age of the oldest row). It is reported, not a readiness condition: a broker outage should not pull the pod out of service. A non-zero `waiting` that keeps growing is the signal to look at RabbitMQ.

## Approach

- [x] 0. Lock the plan (answers of 2026-10-16).
- [x] 1. Migration `add_task_dispatch` (additive; the back-relation on `SpiderSession` adds no column) and `db:generate`. `CANCELLED` in `RUNNER_VERDICTS`, `build:lib`.
- [x] 2. `TaskDispatchService`: SQL claim on the database clock (R-C), session check (R-D), command building (R-F, R-G, R-L), publish with a 5 second limit, delete, back-off, give-up through the claim (R-E) with the escalation (R-I), `dispatchDue` (R-J). Unit tests first.
- [x] 3. `request` validates the command before saving (R-A); `onRequest` gets `tx`; `startTask` takes an optional client and drops the retention delete (R-B); one transaction, then retention, then one inline dispatch. Update the hook, its tests and `request`'s tests (the old "could not be queued" tests change).
- [x] 4. `statusOf` and the `linkedin-login` hook handle the not-tried verdicts (R-H); tests pin each mapping, and that a newer check's `validationId` is not clobbered.
- [x] 5. `task-dispatch` job, registry line, quiet logging (R-K), health numbers.
- [x] 6. Integration test (real Postgres and RabbitMQ): publish fails then succeeds on the job; a crash after the commit is picked up by the job; give-up ends the session and clears the account's `validationId`; a hook that throws leaves no session and no row; a row for an already answered session is deleted without publishing; a paused account is cancelled; two publishers claim one row once; the command's `requested_at` matches the session.
- [x] 7. Spider duplicate guard: write `done.json` after publishing, skip a command whose marker exists (after the account lease). Unit tests with the in-memory store: skipped when done, runs when not, marker written after the publish, marker write failure does not fail the run, duplicate waits for the lease then skips.
- [x] 8. Local end to end with a real spider worker (as in the brain worker PR), including stopping RabbitMQ during a request, and sending the same command twice.
- [x] 9. `MEMORY.md`, `.github/copilot-instructions.md` line about `request`, this plan's Outcome.

## Edge cases and risks

- **Duplicate publish.** The lease and the conditional claim stop two publishers working on one row. A crash after the broker confirms but before the delete can still publish twice; the spider duplicate guard turns that second delivery into a skip. What remains is two deliveries running at the same moment for a task with no account (no lease), which is a harmless extra browser run, and a crash between the spider's publish and its marker write, which repeats a run (the safe direction).
- **Two requests at once for the same proxy.** `checkPolicy` runs before the transaction and is not atomic with it. This race exists today and is not made worse; the account lease in the spider still allows one run per account.
- **Credentials changed while waiting.** The command is built at publish time, so the newest credentials and proxy are used. A proxy removed or paused in between ends the task with a readable verdict.
- **Long broker outage.** Rows wait up to 15 minutes, then the sessions fail one by one through give-up. Each failure runs the task's hook, so accounts do not stay `PENDING`.
- **Worker down.** The API still publishes at once (P3), so tasks keep flowing. Only the retry of a failed first attempt waits for the worker.
- **API crash after commit.** The job publishes the row after about 15 seconds.
- **Rolling deploy.** The migration is brain's init container, so it runs before the new API. A new worker that starts before the migration fails its job runs until the table exists and logs them; nothing is lost. An old API without the outbox keeps the old behaviour. An old worker without the job leaves failed first attempts waiting (the API's inline publish still works).
- **Rollback.** Revert the code; the table stays unused. Rows that were waiting at that moment are never published and their sessions end as "No answer" after 30 minutes. If that matters, publish or clear them by hand before rolling back (documented in the PR).
- **Secrets.** The outbox holds only an id, counters, timestamps and a fixed error text. `lastError` is an error class or a fixed sentence, never an error message from the broker or the database.
- **Retention.** Rows are deleted on publish and on give-up. Deleting a session (30-day retention, user deletion) removes its row by cascade.
- **Staging idle shutdown.** The job logs only when it did something, so an empty table keeps staging idle-able.
- **Hook contract change.** `onRequest` gains `tx`. The only hook is `linkedin-login`. A hook must do database writes only through `tx`, as `onResult` already must.
- **Sessions already in progress at deploy.** They were published by the old code and have no outbox row; nothing is needed for them.
- **Broker blocked, not down.** A broker under a memory alarm accepts the connection but never confirms a publish. Every publish therefore has a 5 second limit (R-J). A publish that times out may still complete later; the lease (60 s) keeps another publisher away meanwhile, and if it did complete, the spider guard and the session check (R-D) absorb the duplicate.
- **Two outage endings.** A broker that comes back just before the limit publishes a task that is 14 minutes old; the task is still valid (a sign-in check does not expire), and the spider's own limits apply as usual. A task older than the limit is failed, never published late.
- **Idle shutdown of staging during an outage.** Rows only wait in Postgres, nothing is lost if the node stops; the first run after it wakes publishes them (or fails them if the limit passed while it was off, which is the honest answer).
- **A hook that is slow.** The transaction has Prisma's default limits (5 seconds). `onRequest` must stay a few quick writes; a hook that needs more is a design problem, not a reason to raise the limit.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root, every warning fixed.
- Unit: claim and lease, back-off, give-up through `applyResult`, command building (needs account or not, proxy gone), the job's quiet and loud runs, `request` atomicity (hook throws, session insert throws), inline dispatch never throwing.
- Integration (real Postgres and RabbitMQ): the cases listed in step 6.
- End to end: the brain worker and a real spider worker locally; ask for a `browser-detection` run with RabbitMQ stopped, start RabbitMQ, and watch the job publish it and the session finish. State what could not be run.

## Outcome

Shipped everything in the plan: the `TaskDispatch` table (migration `20261016200000_add_task_dispatch`, additive), `TaskDispatchService` with the rules R-A to R-M, `request` saving the session, the hook's effect and the row in one transaction and publishing once, the `task-dispatch` worker job with the `taskDispatch` numbers on `/health`, the hook mapping of not-tried verdicts, the `CANCELLED` label, and the spider duplicate guard.

Deviations:

- `applyResult` and the catalog read moved into `taskResult.ts` and `taskCatalog.ts` (the `TaskService` methods delegate), so `TaskDispatchService` can use them without an import cycle with `TaskService`.
- `giveUpFailures` is a column of its own, for the escalation in R-I.
- The guard is optional in the runner (`get` and `create` on the store); the devtools store has neither, so it skips nothing there.
- A small related fix: a refused broker connection arrives as an error with no message, so the consumer's reconnect line now shows the error name.

Verified: lint, `ts:check` (including `apps/body`), unit tests (brain 874, spider 591, contracts 99, body 254), build, the idle-checker tests, and brain integration tests against local Postgres (new `taskDispatch.integration.test.ts`: raw SQL claim on the database clock, transaction rollback when a hook throws, give-up with the hook, paused account, answered session, two publishers one row, `requested_at` to the millisecond). End to end locally with the compiled brain worker and a real spider worker: with RabbitMQ stopped a `browser-detection` request was accepted in 178 ms and kept an outbox row (attempts 1); after RabbitMQ came back the worker published it ("after 1 failed attempt"), the spider ran it, and the session ended `SUCCEEDED` / `NOT_DETECTED` with no row left.

Not verified: the spider duplicate guard against a real bucket (the local Google login for the bucket has expired, so the marker read and write failed and the run went on, which is the designed fallback; the guard is covered by unit tests), sending the same command twice, and a staging rollout.

Follow-ups: log in again for the local bucket (`CLOUDSDK_CONFIG=$HOME/.config/gcloud-spider gcloud auth application-default login`) and send one command twice to see the skip; a smaller worker environment.
