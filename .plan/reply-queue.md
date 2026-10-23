# Reply queue: a reply asked while another is going waits its turn, and the owner never sees "already running"

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-24
- Locked by user: yes, 2026-10-24 (the request settles the goal; the numbers below are my defaults, easy to change)

## Goal

When the owner sends a reply from an account that is still sending another one, the new reply is accepted and goes out after the earlier one, instead of being refused with "The reply did not go. A linkedin reply is already running." (seen in the Unibox, 2026-10-24).

## What exists today (checked in code, 2026-10-24)

- `LinkedInReplyService.send` (`apps/brain/src/database/linkedInReply.service.ts`) checks the limits, then asks `TaskService.request` to start the `linkedin-reply` task and creates the `LinkedInReply` row in the same transaction (`onStart`). Everything that cannot start now is refused at once with a sentence:
  - `TaskService.checkPolicy` refuses with "A linkedin reply is already running." when the account's last `linkedin-reply` session is still in progress (policy `one_at_a_time: account`; the message is built from the task title).
  - `checkLimits` refuses "Wait N seconds before the next reply from this account." (30 s between replies) and "This account has sent 40 replies in 24 hours".
  - A partial unique index allows one `SENDING` reply per account, and a second one gives "A reply is already being sent from this account."
- The Unibox follows a reply by asking brain every 2 seconds for up to about 15 minutes (`trpcSource.ts`, `follow`), and shows a conversation's `SENDING` reply after a reload (`conversationReply.ts`, `latestReplies`).
- The spider already queues work for a busy account (its own lease), so only brain's policy refuses.

## Requirements

Confirmed by the request of 2026-10-24:

- C1 A reply asked while another reply of the account is in progress is queued and sent after it, automatically.
- C2 The owner does not see the "already running" refusal.

My defaults (change on request):

- D1 Order: first asked, first sent, per account. Replies of different accounts do not wait for each other.
- D2 The 30 second quiet time between two replies of one account stays, but as a wait in the queue, not a refusal.
- D3 Still refused at once, with a sentence, because waiting cannot help: more than 40 replies in 24 hours (counting the queued ones), and more than 5 replies already waiting on the account ("Too many replies are waiting...").
- D4 A reply that cannot start (account not signed in, no proxy) ends as `FAILED` with that sentence, shown on the page as for any failure; one that has waited 15 minutes without starting ends as `FAILED` ("It could not start in time. Nothing was sent."). Nothing is ever sent twice.
- D5 The page treats a queued reply as one being sent: its bubble is shown after a reload and the page keeps following it.

Open questions: none.

## Design

- Database (migration `add_reply_queue`, additive): enum value `QUEUED`; `LinkedInReply.sessionId` becomes nullable (a queued reply has no run yet); new `startedAt` (when its run was asked for, backfilled with `createdAt`); an index on `(accountId, startedAt)`. The partial unique index for one `SENDING` reply per account stays.
- `send`: validates the owner, the account (signed in), the limits (D3), the files; creates the reply as `QUEUED`; then tries `dispatchNext(account)` at once, so the common case starts as fast as before; answers `{ id }`.
- `dispatchNext(accountId)`: nothing while a reply of the account is `SENDING` or one was started less than 30 s ago; otherwise takes the oldest `QUEUED` reply and asks `TaskService.request` for its run, setting it to `SENDING` with the session in the same transaction (`onStart`; a lost race or the unique index means "someone else has it", it stays queued). A new `TaskBusyError` (a `TaskRefusedError`, the "already running" case) and `TaskUnavailableError` (the worker has not announced the task) keep it queued; any other refusal ends it as `FAILED` with the sentence.
- New worker job `reply-send` (every 10 s): `dispatchNext` for each account with a queued reply, and ends queued replies older than 15 minutes. Recorded by the cron monitor like every job.
- `keepFiles` leaves the files of a queued reply where they are (as it does for a sending one); `latestReplies` shows queued ones; `checkLimits` counts them.
- Body: `QUEUED` is read as "sending" in `trpcSource.ts`; no new screen.

## Scope and non-goals

- In scope: the above, tests, `MEMORY.md`.
- Out of scope: cancelling a queued reply (the 5 second Undo before sending stays), reordering, a visible queue list, queueing other tasks (daily visit, reads).

## Approach

- [x] 1. Migration and schema; `TaskBusyError`.
- [x] 2. `LinkedInReplyService`: `send` creates a queued reply, `dispatchNext`, `expireQueued`, limits without the gap, `keepFiles` and `latestReplies` for `QUEUED`; unit and integration tests.
- [x] 3. Job `reply-send` and its registry line; test.
- [x] 4. Body: read `QUEUED` as sending; test.
- [x] 5. Verify, `MEMORY.md`, set this plan to done, PR.

## Edge cases and risks

- Two brain or worker processes dispatching at once: the claim is the conditional update inside the task's transaction plus the one-`SENDING` index; the loser changes nothing.
- A run that never answers: the existing `endStale` ends a `SENDING` reply after 15 minutes as unsure, which frees the account's turn; the queue then continues.
- A reply `SENDING` whose run is slow keeps the queue waiting; the replies behind it wait up to their 15 minutes and then fail with nothing sent. Accepted.
- Files of a queued reply stay under `uploads/` until it ends; a lifecycle rule on `uploads/` must be longer than 15 minutes (the deploy notes say one day).
- The same words queued twice by a double click: both are sent (as the owner asked twice); the page's own hold and Undo are unchanged.
- Brain restarts: queued rows are in the database and the job picks them up; nothing is lost.
- Old pods during a rolling deploy create `SENDING` rows with a session as before; the new code reads both.
- Migration is additive; rollback is the previous image (a `QUEUED` row would then be ignored by old code and ended by nothing; the 15 minute expiry is in the new job only: acceptable for a short rollback window).

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests with the migration applied.
- A real run locally against Postgres: two replies asked at once for one account start one after the other, at least 30 seconds apart, with the second's page showing it as sending the whole time.

## Outcome

Shipped as designed. A reply asked while the account is sending another is saved as `QUEUED` and sent in order by `dispatchNext` (at once when the account is free, else by the `reply-send` job every 10 s); the "already running" refusal is gone for the owner. Deviation: `send` checks that the account is signed in itself, because the task's `onRequest` now runs later, at dispatch.

Verified: lint, `ts:check`, unit tests (brain 1121, body 528, spider 863, contracts 157), brain integration tests (147, with the migration applied to the test database), build. The `messageImport` integration test flaked once while a dev worker was running, and passed on rerun. Not run against live LinkedIn; the two-at-once run on a real account is still to be seen on staging.

Follow-ups: none planned (cancel, reorder and a visible queue stay out of scope).
