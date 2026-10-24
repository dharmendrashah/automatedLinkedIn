# Messages read: a partly read batch goes on by itself until it is fully read

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-24
- Locked by user: yes, 2026-10-24 (the request settles the goal; the numbers below are my defaults, easy to change)

## Goal

When a `linkedin-messages` run ends as "Partly read" (it read 14 of the 50 conversations asked for), the next run starts after the conversations already read and reads the rest, again and again until the batch is fully read. Today the owner is told to set `skip` by hand, and nothing does.

## What exists today (checked in code, 2026-10-24)

- Spider `readMessages` walks `skip .. skip + limit - 1` of the inbox list. It stops early (`PARTIAL`) after 20 minutes or after 3 conversations in a row that came to nothing; a list that ends early is `DONE`. It tells the owner `set skip to <skip + conversations read>` (`answerFor`).
- Brain asks for `{ limit }` only (`messagesInput`: 50 the first time, else 20), never a `skip`, from `AccountDailyJob` (every 2 h) and `MessagesRefresh` (manual). The hook `linkedInMessagesHooks.onResult` queues the import for `DONE` and `PARTIAL`.
- The daily job runs every 10 minutes and sends a read when `nextMessagesAt` is due; the reply hook already uses `nextMessagesAt = now` to ask for an early read.

## Requirements

Confirmed by the request of 2026-10-24:

- C1 After a partly read run, the next read skips the conversations already read and goes on.
- C2 It repeats until a run ends as fully read.

My defaults (change on request):

- D1 "Fully read" means the batch that was asked for: the 50 of the first read or the 20 of a later one. It does not mean the whole inbox; reading older conversations beyond that is a separate feature.
- D2 The next run starts at the next pass of the daily job (within 10 minutes), which is also the pause between runs. It is a normal automatic read of the account: same rules (account `ACTIVE`, signed in within the last day, one task at a time).
- D3 A manual refresh goes on with the pending batch too, so there is one rule for both.
- D4 A run that reads nothing (`FAILED`, signed out) leaves the pending batch as it is; the next read, at the next 2-hourly time, goes on from the same place.
- D5 The "Partly read" sentence now says the rest is read in the next run.

## Design

- Database (migration `add_messages_resume`, additive): `LinkedInAccount.messagesResumeSkip Int?` and `messagesResumeUntil Int?` (the position where the batch ends, `skip + limit` of the batch). Both null means nothing pending.
- `linkedInMessagesHooks.onResult`, in the transaction that finishes the run:
  - `PARTIAL`: the run's input (`skip`, `limit`, from `SpiderSession.requestParams`) gives `until = skip + limit`; the report gives the position to go on from (the place after the last conversation read, `next` of the spider's result, the item the spider already writes). Save both and set `nextMessagesAt = now` so the next pass sends it. A report that cannot be read clears the pending batch (never loops on a guess).
  - `DONE`: clear the pending batch.
  - Other verdicts: change nothing.
- `messagesInput(messagesReadAt, resume)`: with a pending batch it asks `{ skip, limit: until - skip }`; otherwise as today. `AccountDailyJob` and `MessagesRefresh` pass the account's columns.
- `packages/contracts`: the report label `To read the next ones, set skip to` becomes a shared constant so the spider writes it and the hook reads it from one place.
- Progress is guaranteed: a `PARTIAL` run read at least one conversation (none read is `FAILED`), so `skip` rises and `limit` falls on every run and the batch ends in at most `limit` runs.
- Spider (added 2026-10-24 after reading the staging logs of runs 56c66a47 and 59288ee4): the runs were partial because single conversations did not open (about 6 of 20, "The page stayed on the conversation before"), never 3 in a row and never the 20 minutes. `skip + conversations read` is then a wrong place (it ignores the gaps), so the spider reports `next` = place after the last conversation read, and a conversation that did not open is tried once more from a fresh list before it counts as failed. A failed one in the middle is not retried by the batch; the 2-hourly read of the newest 20 covers it.

## Scope and non-goals

- In scope: the above, tests, `MEMORY.md`.
- Out of scope: reading the whole inbox beyond the batch, a pause setting, showing the pending batch on a page, a cap on the number of continuations.

## Approach

- [x] 1. Migration and schema.
- [x] 2. Contracts constant; spider `answerFor` uses it and the new sentence; test.
- [x] 3. Hook sets and clears the pending batch; unit tests.
- [x] 4. `messagesInput`, `AccountDailyJob`, `MessagesRefresh` use it; unit tests.
- [x] 5. Integration test of the hook against Postgres; verify; `MEMORY.md`; plan done.

## Edge cases and risks

- Positions drift: a new message moves its conversation to the top and pushes the rest down one place, so a go-on position can land on a conversation already read (read twice, harmless: messages are stored once by id). A conversation deleted on LinkedIn pulls the rest up one place, so one conversation can be passed over; the next 2-hourly read of the newest ones or its next activity covers it. Accepted.
- A conversation that never opens: failures in a row stop a run, but the go-on position moves past what was read, so the next run starts further down; a run that reads nothing leaves the batch and is tried again at the next 2-hourly time. No tight loop.
- Many runs of one conversation each on a sick proxy: at most `limit` runs, each at least 10 minutes apart, and the total conversations opened stays within the batch asked for (no more "seen" marks than one full read). No cap column; revisit if staging shows it.
- Two runs at once: not possible (one task at a time per account); the hook sets absolute values, so a redelivered result gives the same state.
- Account no longer `ACTIVE`, paused or signed out: the daily job skips it; the pending batch waits and goes on when the account is back. A stale batch after a long wait only changes where it starts; reading twice is harmless.
- Run again of an old run from the session dialog uses that run's input; its result sets or clears the batch from that input. Rare; accepted.
- Messages that arrive while a batch is pending are read by the batch only if they sit past the go-on position; otherwise by the next read of the newest ones after the batch ends. Accepted.
- Existing data: columns are nullable, nothing to backfill; migration additive; rollback is the previous image (old code ignores the columns).
- No secrets or message text are stored: two integers.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests with the migration applied.
- Integration test: a `PARTIAL` result saved through the hook sets the pending batch and `nextMessagesAt`, `messagesInput` asks for the rest, a `DONE` clears it.
- Not run against live LinkedIn.

## Outcome

Shipped as designed. A `PARTIAL` read saves where the batch goes on (`LinkedInAccount.messagesResumeSkip`) and where it ends (`messagesResumeUntil`) and sets `nextMessagesAt = now`; the next pass of the daily job (and a manual refresh) asks `{ skip, limit: until - skip }`; a `DONE` run clears it. A report that cannot be read, or a go-on position outside the batch, clears the batch rather than guessing. The spider's "Partly read" sentence is now "the rest is read in the next run", and the report label is the shared `MESSAGES_NEXT_SKIP_LABEL`.

Verified: lint, `ts:check`, unit tests (brain 1132, body 528, spider 863, contracts 157), brain integration tests (148, including a partial, partial, done chain against Postgres), build. Not run against live LinkedIn.

Follow-ups: if staging shows a sick proxy producing many short runs, add a cap on continuations. The Tripti stop was read from the staging logs afterwards (see Design, last bullet): single conversations that did not open, so the spider now retries once and reports the place after the last conversation read. Why a click on a row sometimes does nothing is not known (no screenshots were kept; turn `snapshots` on for a run to study it).
