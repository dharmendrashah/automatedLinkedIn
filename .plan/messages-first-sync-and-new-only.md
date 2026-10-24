# Messages: read the whole inbox once, then only what is new

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-24
- Locked by user: yes, 2026-10-24 ("lock it and push the code in the same PR", PR #89; the defaults below stand as written, the daily sweep included)

## Goal

The first time an account's messages are read, every conversation of its inbox is read, in batches, until the end of the list. After that, the 2-hourly read looks only for what is new: it opens the conversations that changed and leaves the rest alone. Replaces "newest 50 once, then newest 20 every 2 hours" (`.plan/unibox-read-every-2h.md`) and builds on `.plan/messages-resume.md` (PR #89, not merged yet) and the unbuilt "incremental by design" cursor of `.plan/linkedin-messages.md`.

## What exists today (checked in code and staging logs, 2026-10-24)

- Spider `linkedin-messages` v2 walks list positions `skip .. skip + limit - 1` (`limit` 1 to 50, `skip` 0 to 5000), opens each row by a click, scrolls the thread to its first message, and stops after 20 minutes or 3 failures in a row. A list that ends early is `DONE`.
- Brain asks `{ limit: 50 }` the first time and `{ limit: 20 }` after (`messagesInput`), from `AccountDailyJob` (every 2 hours per account; the pass runs every 10 minutes) and from a manual refresh. PR #89 adds a pending batch (`messagesResumeSkip/Until`) so a partly read batch goes on.
- Nothing ever reads past position 50, so an inbox with more is never fully read; and a 2-hourly run reopens the newest 20 even when nothing changed. Opening a conversation marks it read on LinkedIn and the sender sees "seen" (accepted, Q1 of `.plan/linkedin-messages.md`); merely loading `/messaging/` also opens the newest conversation by itself.
- A list row has no address. The spider only knows, before opening: `title`, `when` (clock-dependent: "5:18 PM", "Mon", "Jan 16"), `snippet` (the last message's text) and `unread`. The conversation id appears only after the click. The spider has no database; it can only know what the input tells it (task input is limited to 8 KB).
- A run with no conversation read is `FAILED` ("No conversation of the messages could be opened"), so "nothing new" has no way to be a success today. The importer already finishes a run that has no messages file.
- Staging logs: about 1 in 4 conversations did not open on the first click; fixed by a retry in PR #89.

## Requirements

Confirmed by the request of 2026-10-24:

- C1 The first read of an account goes through its whole inbox, batch after batch, with no one asking, until the list ends.
- C2 After that, every 2 hours the read finds only new messages and shows them; it does not read all the conversations again.

## Design

### State of an account (additive migration)

- `LinkedInAccount.messagesBackfilledAt DateTime?`: when the whole inbox had been read once. Null means the first read is still going.
- The pending-batch columns of PR #89 are reused as the place the first read goes on from (`messagesResumeSkip`); `messagesResumeUntil` is no longer needed for it (it stays for a batch in the 2-hourly read, see below). If PR #89 is merged first, this is one more additive migration; if not, it is folded into that unmerged migration.

### Spider: two ways to walk, one task

New optional input, both with a default that keeps today's behaviour:

- `known`: up to 100 short hashes (8 hex characters) of `title + snippet` of conversations brain already has. A row whose hash is in the set is a conversation with nothing new; it is not opened. The spider makes every hash (`rowHash` in `messageReader.ts`) and writes it in each conversation of its file; brain stores it (`LinkedInConversation.rowHash`) and hands the newest 100 back, so brain never has to match its stored message text against the words a row shows (a row can add "You:" or cut the text).
- `stopAfterKnown`: stop the walk after this many known rows in a row (the newest-first list means everything below is older and unchanged). Not set in the first read, which walks past known rows to the end of the list.
- The result says whether the list ended (`listEnded`), and `next` (the place after the last conversation read, from PR #89). Both go in the report, read by the hook through shared labels in `packages/contracts` (as `MESSAGES_NEXT_SKIP_LABEL` today).
- A walk that saw rows but found all of them known is `DONE` with 0 conversations ("Nothing new"), not `FAILED`. No rows at all after the wait (list not drawn) stays `FAILED`/empty as today, so a broken page is not mistaken for "nothing new".
- Rows are opened when unread or when their hash is not known; a known unread row is opened too (the owner accepted that unread conversations get opened).

### Brain: which kind of read to ask

`messagesInput(account)`:

- First read (`messagesBackfilledAt` null): `{ skip: messagesResumeSkip ?? 0, limit: 50, known }`, no `stopAfterKnown`.
- After: `{ limit: 50, known, stopAfterKnown: 3 }`, from the top.
- `known` = hashes of title and last-message text of the account's 100 most recently active stored conversations (hashed in brain, so the command carries no names or words).

`linkedInMessagesHooks.onResult`:

- First read, list ended: set `messagesBackfilledAt`, clear the place. List not ended (a full batch or `PARTIAL`): save the place the next batch starts from and set `nextMessagesAt` to the pause below.
- After the first read: `PARTIAL` still saves a go-on place (PR #89); `DONE` clears it.

### Pace (defaults to confirm)

- First read: batches of 50, started by the 10-minute pass with at least 30 minutes between two batches, and at most 5 batches (250 conversations opened) in 24 hours per account. That is near the 240 opens a day the owner already accepted for the 2-hourly read. A 1,000-conversation inbox takes about 4 days.
- The 2-hourly schedule is paused for an account while its first read is going (the first read takes its turns).
- A manual refresh in the first read asks the next batch now, without the daily cap (the owner chose it).

### Unibox

- No new screen. The "last read" the Unibox already shows keeps working. A progress line ("Reading older conversations, N stored so far") is left out unless asked.

## Scope and non-goals

- In scope: the above, tests (unit, one brain integration chain, spider walk), `MEMORY.md`.
- Out of scope: reading only the new messages inside a conversation (a changed conversation is read from its first message again; the importer already stores each message once), message requests, InMail, sponsored and filtered views, attachments other than pictures, a progress page, quiet hours.

## Defaults (locked as written)

1. How deep is "all": the whole inbox, to the end of the list. The spider's `skip` limit is 5,000; an inbox deeper than that stops there.
2. Pace of the first read: 50 per batch, 30 minutes apart, 250 conversations a day at most.
3. Safety sweep: once a day the newest 20 are read whatever their hashes say, so a message missed by the "nothing new" check (see risks) is found within a day. Default: yes, one extra column `messagesSweptAt`.
4. Existing accounts (such as Tripti's, which read only 50 and 20): they start the first read from the top, skipping the conversations whose hashes brain already has, so what is stored is not opened again.
5. A progress line in the Unibox: not now.

## Approach

- [x] 1. Contracts: input fields `known` and `stopAfterKnown`, the report labels for "list ended"; schema tests.
- [x] 2. Spider: `known` and `stopAfterKnown` in `read.ts` (hash of a row, skip known rows, stop after N known in a row, nothing new is `DONE`); `answerFor` reports `listEnded`; tests first.
- [x] 3. Migration and schema: `messagesBackfilledAt` (and `messagesSweptAt` if confirmed).
- [x] 4. Brain: hash of a conversation, `messagesInput` with the two kinds of read, hook sets and clears the state, `AccountDailyJob` pace and daily cap and sweep; unit tests.
- [x] 5. Integration test of the hook against Postgres: partial, ended, then incremental; verify; `MEMORY.md`; plan done.

## Edge cases and risks

- **Missed change (the main risk):** a row is judged by `title + snippet`. Two identical last messages in a row from the same person ("ok", "sent an attachment") give the same hash, so a new one is not seen until the owner marks it unread or the daily sweep runs. Unread rows are always opened, which covers a message the owner has not read on LinkedIn. Adding `when` to the hash was rejected: it changes with the clock for an unchanged conversation and would reopen everything each day.
- **Two people with the same name and snippet:** same hash, one is treated as known. Rare; the sweep covers it.
- **Group conversations and renamed ones:** their title changes, so they look new and are read once more; harmless.
- **Positions move while the first read goes on:** a conversation that gets a message moves to the top and pushes the rest down, so one may be read twice (harmless) or passed over; a passed one is found when it changes, or by the sweep.
- **Seen marks:** the first read of a large inbox marks every conversation read on LinkedIn, so contacts see "seen" on messages the owner never opened. This is the known cost of reading through the page (Q1 of `.plan/linkedin-messages.md`), larger here than with 20 a time. Worth stating to the owner before locking.
- **Volume and detection:** the daily cap keeps the first read near the accepted 240 opens a day; the retry from PR #89 adds a second click on a failed row, bounded by the 20 minute budget. If LinkedIn signs the account out, the run ends `SIGNED_OUT` and the sign-in check runs as today; the first read goes on after the account is back.
- **A very large inbox:** more than 5,000 conversations stops at 5,000; nothing loops (the walk ends at the cap and the account is marked backfilled).
- **Command size:** `known` is 100 x about 12 bytes, far under the 8 KB limit; hashes carry no names or words.
- **A failing page:** a list that never draws is `FAILED` (not "nothing new") and leaves the state as it is; the first read is tried again at its next turn. Each batch moves the place on by at least one conversation, so the first read always ends; the daily cap bounds the load while a proxy is sick.
- **Two runs at once:** one task at a time per account; the hook sets absolute values, so a redelivered result gives the same state.
- **Old spider or brain pods during a rolling deploy:** an old spider ignores `known` and `stopAfterKnown` (it validates input strictly today; new fields are optional and the brain must not send them until the spider that knows them runs: ship the spider and contracts first, or have brain tolerate a refusal). To settle in step 1.
- **Existing data and rollback:** nullable columns, no backfill of data; rollback is the previous image (it reads 20 as before). An account marked backfilled keeps its mark.
- **Secrets and privacy:** two integers, a date and 8-character hashes; no names or message text in logs, results or the command.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests with the migration applied.
- Spider walk tests: known rows skipped, stop after N known, nothing new is `DONE`, an undrawn list is still `FAILED`.
- Integration test: a first read that ends in three batches sets `messagesBackfilledAt` and then asks the incremental input; a hash set of stored conversations leaves them unopened.
- Not run against live LinkedIn; first live check on one staging account with `snapshots` on.

## Outcome

Shipped in PR #89 together with `.plan/messages-resume.md`. The first read (no `messagesBackfilledAt`) walks the whole inbox in batches of 50 places from the saved place (`messagesResumeSkip`), at most 5 batches a day, 30 minutes apart, until the spider says it reached the end of the list (`finished`); then it sets `messagesBackfilledAt` and `messagesSweptAt`. Later reads start at the top with `known` (the newest 100 stored row hashes) and `stopAfterKnown: 3`, open only unread or unknown rows, answer "Nothing new to read" as a success when every row was known, and go on at once from where they stopped when they did not reach known rows. Once a day, when nothing is pending, a sweep reads the newest 20 whatever their rows say. A manual refresh follows the same state (no daily cap). The task is version 3; brain sends the new input only when the worker has announced version 3 or later, so a rolling deploy never sends `known` to an old spider.

Deviations from the plan:

- The row hash is made by the spider and stored per conversation, not computed by brain from its stored message text (the row's words are not the message text). So conversations stored before this change have no hash: an existing account (Tripti's) starts the first read from the top and opens its conversations once more (the importer stores each message once), instead of skipping the stored ones (default 4).
- The report carries `finished` (end of list or first known rows) in place of a separate `listEnded`, and the spider's `next` is the place after the last row gone through (read or left alone), so the place never moves past a failed row in the middle by mistake and never skips ahead of what was gone through.
- A conversation that did not open is tried once more from a fresh list (from the staging logs of runs 56c66a47 and 59288ee4: about 6 of 20 failed the first click).
- `LinkedInAccount.messagesResumeUntil` (added by `messages-resume`) is no longer used (the read says itself when it is finished); it is left in place and can be dropped by a later migration.
- The backfill daily cap counts automatic `linkedin-messages` sessions of the last 24 hours (failed ones too), not conversations opened.

Verified: lint, `ts:check`, unit tests (brain 1139, body 528, spider 872, contracts 157), brain integration tests (150, with migration `20261024230000_add_messages_backfill` applied: a first read in three batches, then a later read, a sweep and the stored hashes), build. Not run against live LinkedIn; first live check on one staging account, with `snapshots` on for a run if rows do not behave.

Follow-ups: a progress line in the Unibox; drop `messagesResumeUntil`; read only the new messages inside a changed conversation; an empty inbox never gets marked as backfilled (its read is `FAILED`, at most 5 a day), find a better signal if it matters.
