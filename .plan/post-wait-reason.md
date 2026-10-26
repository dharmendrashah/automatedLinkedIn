# Say why a post is waiting, and when it can start

- Status: done, not seen in a browser <!-- draft | locked | in progress | done -->
- Created: 2026-10-26
- Locked by user: yes, 2026-10-26 ("make the Posting list show this reason and time ... 17:58 IST (local time) within 3 min. do this")

## Goal

A post that shows "Waiting to start" on the Posting page says why it waits and when it can start: in the viewer's own time, in the account's working-hours zone, and as "in about N min". Today it only says "Waiting to start", so the owner has to open the account panel to learn that the account is spaced out until 08:28 New York.

## What exists today (checked in code, 2026-10-26)

- `PostPublicationService.dispatchNext` leaves a queued post alone when the account is busy, was posted from less than an hour ago, or `TaskService.request` refuses (`TaskBusyError`, `TaskUnavailableError`, `BrowseBudgetError`). It never says which. The `post-send` job asks again every 10 seconds.
- `BrowseBudgetError` already carries the reason (`OUTSIDE_OFFICE`, `DAY_FULL`, `BACKGROUND_FULL`, `TOO_SOON`, `GAP`) and `until` (the instant the account may be asked again); the account panel shows the same time.
- The Posting list (`publications-list.tsx`) shows the state as one badge, and polls while a post is active.

## Requirements

Confirmed (from your request): show the reason and the time, in local time and in the account's zone, within a few minutes.

Decisions inside that (say if you want any different):

- Only a post in `QUEUED` shows it. It is saved by brain each time it asks and is told to wait, and cleared when the post starts or ends, so the list reads it with the post and no new call is needed.
- Fixed sentences only, no free text from errors: the account's next slot (spread and rest rules), its working hours, its browsing time for today, another task on the account, the hour between two posts, or the browser worker not being ready. Only the slot and hour reasons have a time.
- The time is shown as "17:58 your time (08:28 America/New_York), in about 3 min". The account's zone is the office zone brain already uses for that account.
- Nothing is promised: it is the earliest brain will ask again, not a guarantee the post starts then.

## Scope and non-goals

- In scope: three nullable columns on `PostPublication` (additive migration), the dispatch code that sets and clears them, the list, tests, `MEMORY.md`.
- Out of scope: the same note on workflow blocks' steps (they already show their own waiting note), changing any limit or rule, notifications.

## Approach

- [x] 1. Brain, tests first: columns and migration; `dispatchNext` sets reason, time and zone when it leaves a post waiting, and clears them when it starts it; the view returns them for a queued post only.
- [x] 2. Body, tests first: a pure sentence builder (reason, local time, account zone, minutes), and the list shows it under the badge.
- [x] 3. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests, `MEMORY.md`.

## Edge cases and risks

- A post that waits with no known time (another task running, worker not ready): the sentence has no time.
- The time passes while the page is open: the list polls while a post is active and the minutes are recomputed on each render; a time in the past reads "any moment now".
- Old rows and rolling deploys: columns are nullable, an old row shows plain "Waiting to start".
- The note can be a few seconds stale: it is written by the job every 10 seconds.
- Zone names are shown as saved (`America/New_York`); an unknown zone falls back to local time only.
- Rollback: the columns can stay unused.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; brain integration tests. Looked at in a browser with a queued post.

## Outcome

Shipped: three nullable columns on `PostPublication` (`waitReason`, `waitUntil`, `waitZone`; migration `add_post_wait_reason`); `dispatchNext` saves why a queued post is left waiting (the account's next slot, working hours, browsing time, another task, the account's other post, the hour between two posts, the browser worker) and when it may start, only when it changed, and clears them when the post starts; `BrowseBudgetError` carries the account's zone; the publication view returns `waiting` for a queued post; the Posting list shows it with a countdown that renews every 30 seconds (`waitingText`: viewer's time, account's zone, "in about N min"). Deviation: the post's own sending state and the hour between posts are covered too, since they are the other reasons `dispatchNext` waits. Checks: lint, ts:check, unit tests, build and brain integration tests. Follow-up: look at it in a browser with a queued post; staging needs the migration.
