# Replies wait for the account's rest and say when they will start

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-28
- Locked by user: yes, 2026-10-28 (the owner asked twice: "never see this message if the account is resting, always queued with the time" and "the same for files, photos and audio")

## Goal

On staging a reply ended "The reply did not go. This account is resting between two sessions. It can start again at 17:53. Your reply is kept ... Retry / Dismiss". The browsing budget (`BrowseBudgetService.reserve`) refused the reply's run, and `LinkedInReplyService.dispatchNext` turned every `TaskRefusedError` into `FAILED`. A reply must never fail for that: it stays queued, the page says it is queued and when it can start, and it sends by itself, so nothing is typed again. Replies with files, photos, video and audio take the same path (`send` -> `QUEUED` -> `dispatchNext`), so the same fix covers them.

## Requirements

Confirmed:

- C1 A refusal of the browsing budget (resting between two sessions, working hours, day full, spread through the day) keeps the reply `QUEUED`; it is never `FAILED` and never shown as "did not go".
- C2 The bubble of a queued reply says it is queued, that it need not be sent again, why it waits and when it can start (the viewer's time, with the account's zone when it differs), as the Posting page does for a queued post.
- C3 The same for a reply with attachments of any kind (image, video, audio, file).

My defaults (change on request):

- D1 The reason and time are saved on the reply (`waitReason`, `waitUntil`, `waitZone`, as `PostPublication` has) and shown in the viewer's time with `waitingText`.
- D2 A reply that waits for the budget is not asked again before its `waitUntil`; the order stays first asked, first sent per account.
- D3 A queued reply ends as "could not start in time" only 15 minutes after its `waitUntil` (or 15 minutes after it was asked when it never had one), not 15 minutes after it was asked.
- D4 The page keeps following a queued reply for as long as it is queued (a slower poll while it waits), and shows a queued reply older than a day.

Open questions: none.

## Scope and non-goals

- In scope: `LinkedInReplyService`, `conversationReply`, the reply wait columns (additive migration), the Unibox bubble and its source, tests, `MEMORY.md`.
- Out of scope: cancelling a queued reply, changing the browsing budget, reordering, other refusals (not signed in, no proxy: they still end as failed with their sentence).

## Approach

- [x] 1. Migration `20261028030000_add_reply_wait`: `LinkedInReply.waitReason`, `waitUntil`, `waitZone` (additive).
- [x] 2. Brain tests first, then `dispatchNext` (a `BrowseBudgetError` keeps the replies of the account queued and writes the wait on all of them; a reply whose `waitUntil` is ahead is not asked again), expiry from `waitUntil`, `get` and `latestReplies` carry the wait (a queued reply is shown whatever its age).
- [x] 3. Body tests first, then the wait through `replyOf`, `follow` (never gives up while queued, polls every 10 s then, reports the wait), the `WAITING` action and the bubble line.
- [x] 4. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` pass; the reply and conversation integration tests pass with the migration applied.
- [x] 5. `MEMORY.md`, plan done, PR.

## Edge cases and risks

- Files wait under `uploads/` while the reply waits, and the bucket rule deletes `uploads/` after one day: a reply whose wait passes a day (a weekend outside the working hours) may find its files gone; the task then ends it as failed with its own sentence, nothing sent. Accepted, noted in `MEMORY.md`; the fix is a longer rule on `uploads/`.
- `reserve` adds a random jitter to long waits, so `waitUntil` is the earliest, not a promise; the line says "can start".
- Two brain processes: the claim is unchanged (conditional update in the task's transaction plus the one `SENDING` index).
- A reply behind a waiting one has no wait of its own; it shows "queued behind another reply" without a time.
- A conversation with a reply queued for more than a day still shows it (queued replies are exempt from the one-day window of `latestReplies`).
- Old rows have no wait columns (null): they behave as before.
- Migration is additive; rollback is the previous image (the columns are ignored).

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; brain integration test for the reply service with the migration applied.

## Outcome

Shipped as designed. A reply the account cannot start now (resting between two sessions, outside its working hours, out of browsing time) stays `QUEUED`, never `FAILED`; the bubble says "Queued. You do not need to send it again.", why, and when it can start (the viewer's time), and it sends by itself. Replies with photos, video, audio and files take the same path and are covered by an integration test (photo and audio). Deviation: the wait is written on every queued reply of the account (not only the first), so a reply behind another shows the same time, and the 15 minute expiry counts from that time.

Not run live on staging. The first reply sent while an account rests is the proof. Known edge: files wait under `uploads/`, which the bucket rule deletes after a day, so a reply that waits more than a day with files may find them gone and end as failed with nothing sent.
