# Unibox: keep showing a reply that is being sent after the page is reloaded

- Status: done
- Created: 2026-10-24
- Locked by user: yes, 2026-10-24 (answers to Q1 to Q3)

## Goal

A reply takes minutes (the spider opens a browser through the account's proxy, attaches the files and presses Send). While it is on its way the owner must see that, also after a reload, in another tab, or on another device, and the page must settle by itself when it ends: the message shows in the thread, or the failure shows with its sentence.

## What exists

- Page: the reply being sent exists only in memory. `useUnibox.send` holds it 5 seconds (Undo), then `settle` awaits `source.send`, which uploads the files, calls `unibox.send` and polls `unibox.reply` every 2 seconds (up to 3 minutes, 10 with files). The sending bubble (`conversation.sending`) and its upload progress live in the reducer. A reload drops all of it: the bubble, the progress and the follow-up. The composer is free again, and the sent message appears only when the next read of the messages imports it.
- Brain: the reply is a `LinkedInReply` row (`SENDING`, then `SENT`, `FAILED` or `UNKNOWN`), with its text and files; the `reply-sweep` job ends one that is older than 15 minutes as `UNKNOWN`. Nothing in `unibox.conversations` or `unibox.conversation` says a conversation has a reply in flight.
- The spider publishes only the final answer of a run, no steps in between, so brain knows only that the reply is `SENDING`.
- After `SENT`, brain queues a message import (job every 30 seconds); the real message arrives in the database after that.

## Proposal

### Brain

- `unibox.conversations` and `unibox.conversation` add, for a conversation with a reply in flight, `sending: { id, text, files: [{ name, kind, bytes }], since }` (from the `SENDING` row of the owner; at most one per account by the unique index).
- Optional (Q1): the latest reply that ended as `FAILED` or `UNKNOWN` in the last 24 hours and was not dismissed, as `failed`, so the failure card survives a reload; dismissing it is a call (`unibox.dismissReply`) that sets a new `dismissedAt` column (additive migration).

### Page

- The source gets `follow(replyId)`, the polling loop taken out of `send` (so `send` is: upload, start, `follow`). One loop, one place.
- On load, a conversation with `sending` from the server shows the sending bubble as it is now, without Undo and without a file preview (only names), and `useUnibox` starts `follow` for it. It ends as today: `SENT`, or the failure card.
- Status line in the bubble, with no invented percent: "Uploading files" with the real percent while the page uploads, then "Waiting for LinkedIn" with the time since the reply started ("1 min ago") and a moving (indeterminate) bar, so a long wait looks alive.
- After `SENT` the page reads the conversation again after a few seconds and until the new message is there (up to 90 seconds, the import runs every 30), then drops the bubble. Where the local message was added before (`SENT` action), it is replaced by the stored one, so it is not shown twice.
- Another tab or device shows the same bubble, since it comes from brain.

### Not in this plan

- Real stages from the spider (opened the page, attached, pressed Send): the spider would have to report while it runs, a larger change; the bubble says waiting, not which step.
- Making a reply faster (the browser session is the time).

## Requirements

Confirmed (your words):

- After refreshing the page, a reply that is still being sent must show its progress.

Answered by the owner on 2026-10-24:

- Q1. Yes: a reply that ended as failed or unsure survives a reload, for 24 hours or until dismissed (new `dismissedAt` column, `unibox.dismissReply`).
- Q2. Yes: "Waiting for LinkedIn", the time since it started and a moving bar are enough for now; real stages from the spider are for later.
- Q3. Yes: after `SENT` the bubble stays, saying the message is being shown, until the stored message is there (up to 90 seconds).

Open questions: none.

## Scope and non-goals

- In scope: `sending` (and optionally `failed`) from brain, `follow` in the source, bubble status, follow after load, re-read of the conversation after `SENT`, tests.
- Out of scope: see "Not in this plan".

## Approach

- [x] 1. Lock the questions above.
- [x] 2. Brain tests first (a conversation with a `SENDING` reply says so, another owner's does not; optional failed and dismiss), then code.
- [x] 3. Body tests first (`follow` ends on each state, the loop is shared by `send`; the store keeps a server `sending`; the re-read after `SENT`), then code and the bubble.
- [x] 4. `MEMORY.md`, Outcome, gates, and a live check on staging by the owner (reload during a send): gates done, live check is the owner's.

## Edge cases and risks

- **Reload during the 5 second Undo hold:** nothing was sent yet, so nothing is shown (the draft is kept as today).
- **Reload during the upload:** brain has no reply yet; the files are in `uploads/` and the reply is never started. The page shows nothing; the files are removed by the one day rule. The owner attaches again. (Closing the tab mid-upload loses it.)
- **Two tabs:** both follow the same reply; both end the same way. A second Send is refused by brain (one `SENDING` per account) with its sentence.
- **A reply that is lost:** `reply-sweep` ends it as `UNKNOWN` after 15 minutes; the page shows the unsure card.
- **Polling cost:** one cheap query every 2 seconds per reply in flight, stopped at the end; for a reply loaded from the server the stop is the same 15 minutes.
- **Time since:** taken from the server (`createdAt`), so it is true after a reload; the clock of the page only shows it.
- **Import lag:** until the message is stored the bubble stays; if it never arrives the bubble ends after 90 seconds and the next read shows it (no duplicate: the local message is not added when the stored one is there).
- **Data:** the reply text is the owner's own, already stored; no new personal data. The optional column is additive.
- **Rollback:** revert; the old behaviour returns.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests.
- Live on staging (not runnable by me): send a reply, reload the page while "Waiting for LinkedIn" shows, and see the bubble come back and settle.

## Outcome

Shipped (not committed, not run live):

- Brain: `reply` on `unibox.conversations` and `unibox.conversation` (via `latestReplies`), `LinkedInReply.dismissedAt` (additive migration `20261024004000_add_reply_dismissed`), `unibox.dismissReply`.
- Page: `source.follow` shared with `send` (`POLL_TIMES = 460`, one limit for words and files, since the 15 minute sweep is the real end); `SendEvents` (`started`, `progress`); the store keeps a server reply and marks it done on `SENT`, then waits for the stored message (90 s); `SendingBubble` with a real percent while uploading and "Waiting for LinkedIn" with elapsed time and a moving bar after; failed card survives reload, can be dismissed, and offers no Retry when its files are lost.
- Deviation: the polling limit is no longer 3 minutes (10 with files) but 15 minutes for all, to match brain's sweep.
- Verified: lint, `ts:check`, unit tests, build and brain integration tests pass (one `messageImport` test flakes only while a local dev worker runs; it passes alone).
- Follow-up: live check on staging (send, reload during the wait, the bubble returns and settles); the `uploads/` one day lifecycle rule may still be unapplied.
