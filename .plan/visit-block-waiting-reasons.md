# Visit blocks: say why they are waiting, and stop waiting forever on a blocked task

- Status: built, waiting for a live re-run <!-- draft | locked | in progress | done -->
- Created: 2026-10-25
- Locked by user: yes, 2026-10-25 (all proposed defaults accepted)

## Goal

A workflow with a "Visit profile" or "Visit company" block started by an API call showed no browser session for 7 minutes. The block was waiting for something it could not name, and the Runs page said only "Waiting". Make the block say why it is waiting, and end it with a clear failure when the reason can never go away by waiting.

## What happened (checked in the local database, 2026-10-25)

- Run `01a16f8c-161b-76a3-a7a1-e3b97f9ef106` (workflow `test`, started by the API at 20:13:34 UTC with one profile). Steps `When called by API`, `Select accounts`, `Profiles` and `For each` finished within a second; `Visit profile` stayed `WAITING` with 0 visits asked (no `LinkedInProfileVisit` row, no spider session) for 7 minutes.
- At 20:20:49 the spider worker announced its tasks again (`TaskDefinition.seenAt` of `linkedin-view-profile` and `linkedin-view-company`, version 1). The old worker (`node dist/src/worker.js`, started the previous afternoon, before these tasks existed) had been replaced. At 20:20:59, ten seconds later, the engine asked the first visit (`LinkedInProfileVisit` ASKED, `SpiderSession` `linkedin-view-profile` IN_PROGRESS, account `dharmendrashaheagle+linkedin@gmail.com` ACTIVE, proxy ACTIVE).
- So the cause is the worker that was running: it had never announced `linkedin-view-profile`, and brain refuses a task the catalog does not hold (`TaskService.request` throws `TaskUnavailableError`, "This task is not available.").

## The bug in our code

`worker/engine/visitPages.ts` catches every `TaskRefusedError` the same way: "this account cannot act right now, try again next tick" (`unavailable.add(id)`, `waiting += 1`). That is right for a busy account, the 3 minute gap and the daily cap. It is wrong for refusals that waiting does not fix: the task is not announced (`TaskUnavailableError`), the account has no working proxy (`TaskNeedsProxyError`), the account is not signed in (the visit hook's `TaskRefusedError`). Those also wait silently:

- the step keeps no message while waiting (the engine only writes it when the step finishes), so the Runs page shows "Waiting" with 0 in and 0 out;
- nothing is logged;
- the block waits until its 8 hour limit measured from the run's start.

## Proposal

1. **Name the reason.** Give each refusal its own type so no message is read: `TaskUnavailableError` and `TaskNeedsProxyError` exist; add `AccountNotReadyError` (thrown by the visit hook) and keep `TaskBusyError`, `TaskRecentError` and `PageVisitRefusedError` (`CAP`). One small pure function maps a refusal to `{ kind: 'later' | 'blocked', text }` with a fixed sentence, for example: later: "an account is busy", "an account is in its 3 minute gap", "an account reached its 15 visits a day"; blocked: "the browser worker has not announced Visit profile yet; start or restart it", "an account has no working proxy", "an account is not signed in".
2. **Show it.** While the block waits it saves one note on its step (`WorkflowStepRun.message`, shown in the Runs table's Note column): "Waiting to visit 1 of 1: the browser worker has not announced Visit profile yet; start or restart it." It is rewritten only when the text changes, one log line per change (so staging's idle checker is not kept awake), and replaced by the usual result when the step ends.
3. **Stop waiting forever on a blocked task.** A block whose every chosen account is blocked, for a reason that waiting does not fix, ends `FAILED` after a time limit with the same sentence (default 10 minutes), so a Task result or Retry after it can act and the run does not hang for 8 hours. Waiting reasons (busy, gap, cap) keep waiting up to the 8 hour limit, as now.
4. **A start time for steps.** New nullable column `WorkflowStepRun.startedAt`, set on the step's first claim (additive migration). The 8 hour limit and the 10 minute blocked limit count from it instead of from the run's start, and Wait can say how long it waited.
5. **Local development.** `MEMORY.md` gets the gotcha: after pulling new tasks, restart the spider worker (a stale worker looks exactly like this); the block now says so.

## Requirements

Confirmed (from your request): find why the API run showed no browser session and plan a proper fix.

Answered by the owner on 2026-10-25 (all defaults):

1. **Blocked limit.** End a block as failed after 10 minutes when every chosen account is blocked for a reason waiting does not fix (default), or only show the reason and keep waiting up to 8 hours?
2. **Which refusals are "blocked".** Task not announced, no working proxy, account not signed in (default). An account that is paused (`DISABLED`) or restricted (`BLOCKED`) is already left out of the usable accounts and the block fails at once when none is usable.
3. **Where the reason shows.** The step's Note in the Runs table (default), plus a line in the run's own summary when the run ends. Nothing on the canvas.
4. **Start time.** Add `startedAt` to steps (default), or measure the limits from the run's start as now.

## Scope and non-goals

- In scope: the typed refusals and the reason sentences, the note on the waiting visit step, the blocked-time limit, the `startedAt` column and migration, tests, `MEMORY.md`.
- Out of scope: starting or restarting the spider worker for you, checking the worker at run start and refusing the run, changing any account limit (3 minutes, 15 a day, 30 days), other blocks.

## Approach

- [x] 1. Lock this plan (answer the open questions).
- [x] 2. Tests first: the reason mapping (each refusal to `later` or `blocked` with its sentence); the visit block writes the note once and again only when it changes; a blocked reason past the limit ends the step `FAILED` with the sentence; a waiting reason does not; the note is cleared when a visit is asked.
- [x] 3. Typed refusals (`AccountNotReadyError`), the mapping, `WorkflowRunService.setNote` and `startedAt` (migration `add_step_started_at`, create-only, folder name sorts last, read the SQL, apply to both local databases).
- [x] 4. The visit block: collect the reasons of a tick, save the note, log on change, end blocked blocks after the limit, count the limits from `startedAt`.
- [x] 5. Integration test with Postgres through the engine: a task the catalog does not hold keeps the step waiting with the note, then fails after the limit; once the task exists the visit is asked and the note is gone.
- [ ] 6. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, all warnings fixed, brain integration tests; `MEMORY.md`; plan done. Re-run your API call on the fixed code with a worker deliberately stopped to see the note, with your go-ahead.

## Edge cases and risks

- **A refusal that is both.** An account refused for a blocked reason may be blocked only for now (a proxy being tested, a sign-in check running). The 10 minute limit gives it that time; a failed step can be retried by the owner (Retry block or a new run).
- **Mixed accounts.** If one chosen account is busy and another is not signed in, the block is waiting (not blocked): it only ends early when no account is waiting for a reason that clears by itself.
- **Several people.** The note counts people ("Waiting to visit 3 of 5"); people skipped (do-not-contact, viewed lately) are not counted as waiting.
- **Idempotency.** The note and `startedAt` are plain writes; a step taken again after a crash writes the same text again (only when it differs) and keeps its first `startedAt`.
- **Existing runs.** A run already waiting has no `startedAt`; the limits fall back to the run's start for it, so nothing changes for old rows.
- **Compliance.** No change to what is visited or how often; this only reports and ends a wait.
- **Dev vs production, Docker, CI.** No new env var or dependency; additive migration. Rollback: remove the note and the limit; the column stays unused.
- **Not verifiable here.** How the Runs page reads on a real staging run with the worker stopped.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; brain integration tests with Postgres.
- Re-run the same API call with the spider worker stopped, then started: the Note names the cause, and the visit starts once the worker is up.

## Outcome

Built on `fix/visit-block-waiting-reasons` (on top of `feat/select-accounts-block`). Shipped: `AccountNotReadyError` (thrown by the visit hook) beside the existing typed refusals; `worker/engine/visitRefusal.ts` (`refusalOf`: busy, the 3 minute gap and the daily cap are "later"; task not announced, no working proxy and account not signed in are "blocked"); the visit block now saves a note on its waiting step ("Waiting to visit 1 of 1: the browser worker has not announced this action yet; start or restart it."), writes it only when it changes, logs one line per change and clears it when a visit is asked; a block whose every chosen account is blocked ends `FAILED` with "Visits stopped: ..." after 10 minutes; `WorkflowStepRun.startedAt` (migration `add_step_started_at`, set on the step's first take) so the 8 hour and 10 minute limits count from the step's own start (a step without one counts from the run's start); `WorkflowRunService.setNote` and `markStarted`.

Deviations: when no chosen account is signed in the block no longer counts each person as failed; it waits and says so (and ends after 10 minutes like any blocked reason). The Wait block's message still does not say how long it waited (kept out of this fix).

Checks: see the pull request. Not run: the same API call on the fixed code with the spider worker stopped, to read the note on the Runs page.
