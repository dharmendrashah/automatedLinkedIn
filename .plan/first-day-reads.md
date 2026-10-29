# First day of a new account: read its profile, connections, messages and connection requests

- Status: done (staging run left to the owner)
- Created: 2026-10-30
- Locked by user: yes, 2026-10-30

## Goal

When a LinkedIn account is added and its first sign-in succeeds, the platform reads, the same day and without the owner pressing anything, the account's own profile, its connections, all its messages and its connection requests. It does it the way a person would: one thing at a time, inside the account's working hours, with rests in between, within its daily browsing budget, and it carries on the next day for whatever did not fit, until everything is read once.

## What exists (read from the code, 2026-10-30)

- First sign-in: `linkedInLogin.hooks.ts` `onResult` sets `status: 'ACTIVE'` and `lastVerifiedAt` on a `VALID` verdict. `lastVerifiedAt` is null until the first good sign-in.
- The worker job `account-daily` (`worker/jobs/accountDaily.ts`, `database/accountDailyJob.ts`) wakes every 10 minutes and, per ACTIVE account, asks for what is due by four times: `nextCheckAt` (daily sign-in check), `nextBrowseAt` (daily visit), `nextMessagesAt` (messages every 2 hours) and `nextInvitationsAt` (connection requests once a day). A new account has them all null, so it is due for all four at the first pass after the sign-in.
- Already automatic from day one:
  - **Messages**: `linkedin-messages`; the first read goes through the whole inbox in batches, at most `MAX_FIRST_READS_A_DAY = 5` a day, 30 minutes apart (`BATCH_PAUSE_MS`), and `messagesBackfilledAt` is set when it is done.
  - **Connection requests**: `linkedin-invitations`, once a day, `invitationsReadAt`.
- Not automatic:
  - **Own profile**: `linkedin-profile`, asked only by `AccountProfileService.open()` when the owner first opens the account's profile page (`profileAskedAt` null).
  - **Connections**: `linkedin-connections`, asked only by `LinkedInConnectionService.refresh()` (Read connections button); `connectionsReadAt` null until the first read is stored.
- Pacing that already holds every task (`TaskService.request`):
  - One task at a time per account (`TaskBusyError`).
  - Browse budget (`BrowseBudgetService.reserve`, on when `BROWSE_BUDGET` is set, which is production): only inside the account's working hours (`officeDays`, `officeStartMinute` 09:00, `officeEndMinute` 18:00, time zone of the proxy's country), within the daily minutes of its `browseMode` (SAFE by default), background tasks at most 40 % of them, and a rest of about 10 minutes between sessions.
  - A refused task is retried by the next pass of the job (10 minutes), not dropped.
- The cron monitor (`/jobs`) lists every account the job asked for or left, with a fixed reason (`items`).

## Design (proposal)

### What runs on the first day, in this order

The job already asks in passes; it gets a fixed order for an account that has not been read once yet, shortest and most useful first, the long one last:

1. **Own profile** (a few minutes): the account's name and picture show everywhere at once.
2. **Connection requests** (a few minutes): requests waiting to be accepted or ignored show on My network.
3. **Connections** (up to about 25 minutes, one read of the list LinkedIn shows).
4. **Messages**: the first read of the whole inbox, in its existing batches (at most 5 a day, 30 minutes apart). A big inbox finishes on the next days.

The daily visit (browse) and the daily sign-in check go on as today; the first sign-in counts as the day's check (`RECENT_SIGN_IN_MS`).

### How it is not aggressive

- One task at a time for the account, in order, never two at once (existing rule).
- Within its daily browsing budget (existing rule). Working hours apply to everything except the four first-day reads in the first 24 hours after the first good sign-in (confirmed), so a new account's data comes the same day; after that, and for every other task, working hours hold.
- A rest of at least 10 minutes between two tasks (existing rule), plus a random 0 to 20 minutes before each first-day read so the start times differ from account to account and from day to day.
- Each first-day read happens once; afterwards connections are read once a week and the own profile once a month, at a random time inside working hours (`nextConnectionsAt`, `nextProfileAt`, additive nullable columns, moved like the job's other times). Messages and requests keep their existing rhythm.
- What does not fit in the day (budget used, working hours over) waits for the next working day and goes on from where it stopped; nothing is retried in a tight loop (the job's 10-minute pass is the only retry).

### How the job knows what is still to do

No new table. "Read once" is already on the account:

| Read | Done when |
| --- | --- |
| Own profile | `profileAskedAt` is set |
| Connections | `connectionsReadAt` is set |
| Messages | `messagesBackfilledAt` is set (existing first read) |
| Connection requests | `invitationsReadAt` is set |

`account-daily` gets two new due actions for an ACTIVE account that has signed in (`lastVerifiedAt` set): `profile-read` while `profileAskedAt` is null, `connections-read` while `connectionsReadAt` is null and no connections read is running. They go through `TaskService.request` with `trigger: 'automatic'`, so the busy rule, the budget and working hours apply as to every other task. The order above is the order the job tries them in for one account in one pass; the first one that is asked for ends the pass for that account (the rest would be refused as busy anyway). The cron monitor shows the two new actions with fixed reasons, and `describe.ts` gets their labels.

### What the owner sees

On the account's page (accounts list and drawer): "First day: profile read, requests read, connections reading, messages waiting" with each state, and when the rest will go on if the day is over ("Goes on tomorrow at 09:10, inside working hours"). No new button: the existing Read buttons still work and count as done.

## Requirements

Confirmed:

- After the first good sign-in of a new account, schedule on that day: own profile, connections, all messages, connection requests (2026-10-30).
- Secure and private, not aggressive, and in the end all the data is read (2026-10-30).
- Working hours: the first-day reads start right after the first good sign-in, even outside working hours (2026-10-30). Only these four reads, only in the first 24 hours after the first good sign-in, are let through outside working hours; the daily budget, one task at a time and the rest between sessions still apply. Every other task keeps working hours.
- Budget: the normal daily budget; a big inbox finishes over a few days (2026-10-30).
- Accounts already active that were never read get the same reads from their next working day, inside working hours (no outside-hours start for them) (2026-10-30).
- Afterwards: connections are read again once a week and the own profile once a month, inside working hours, at a random time of the day (2026-10-30).
- Order: profile, requests, connections, messages (2026-10-30).

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: the first-day order and the two new due actions in `account-daily` (profile, connections), the outside-hours allowance for the first 24 hours (a flag `TaskService.request` passes to `BrowseBudgetService.reserve`, set only by the job for these reads), the weekly connections and monthly profile reads, the random start delay, the cron monitor labels, the first-day status on the account page, tests.
- Out of scope: new spider tasks or changes to how a read works on LinkedIn; accepting or ignoring requests automatically (the owner decides, as today); any read of other people's profiles; changing the budget amounts or modes.

## Approach

- [x] Brain, test first (integration, `accountDailyJob`): a newly signed-in account gets profile, then requests, then connections, then messages asked in separate passes, never two at once; an account outside working hours or out of budget is left with the fixed reason and asked again on a later pass; a read already done is not asked again; a paused, signed-out or proxy-less account gets nothing; another owner's account is untouched.
- [x] Brain: the two due actions in `accountDailyJob.ts` (profile through the same request `AccountProfileService.open` uses, so `profileAskedAt` is set once; connections through `LinkedInConnectionService` with `trigger: 'automatic'`), the order, the random delay (a `nextFirstReadAt` time on the account, additive nullable column, or reuse of an existing time: decided in the test).
- [x] Brain: cron monitor `items` for the new actions (`profile-read`, `connections-read`) with fixed reasons; labels in `apps/body/src/components/jobs/describe.ts`.
- [x] Page: the first-day line on the account drawer from the four "done" fields and the next time.
- [x] Brain, test first (`browseBudget`): the first-day allowance lets a first-day read through outside working hours only within 24 hours of the first good sign-in (`lastVerifiedAt` first set, kept as `firstSignedInAt`, additive nullable column, back-filled from `lastVerifiedAt` is not done: existing accounts get no allowance), still refuses it over budget or while resting, and never lets any other task through.
- [x] Brain, test first: weekly connections and monthly profile reads after the first, at a random time inside working hours.
- [ ] A real run on staging with a newly added account (needs the owner). Definition of done and `MEMORY.md` done.

## Edge cases and risks

- First sign-in outside working hours or at the weekend: the four reads start anyway within the first 24 hours (confirmed), still one at a time, with rests and within the budget; after 24 hours whatever is left waits for working hours. Risk: reading at night is less like a person; limited to one account's own data once, and noted in `MEMORY.md`.
- The sign-in check fails later (signed out, two-step code): the account is not ACTIVE, so no first-day read is asked; they resume after the next good sign-in.
- The owner opens the profile page or presses Read connections first: that read counts as done; the job does not ask it again.
- A read fails (LinkedIn layout, timeout): `profileAskedAt` is set when it is asked, so a failed profile read is not retried by the job (the owner can press Read profile); for connections, `connectionsReadAt` stays null, so it is asked again on the next working day, at most once a day (a `nextFirstReadAt` or a daily guard keeps it from retrying every 10 minutes).
- Many accounts added at once (an agency): each account is paced on its own; the job takes at most 100 accounts a pass (existing); the random delay spreads the starts.
- Two worker replicas: the job already moves times with a conditional update, so one account is asked once; the new actions use the same `move`.
- Proxy: no read is asked without an active proxy (existing check); the account waits.
- Security: no new secrets, no new places for data; tasks use the account's stored session, device and proxy as every task does; nothing is sent or clicked on LinkedIn beyond reading (no accept, no message).
- Privacy: the data read is the owner's own account data and is stored where it is today (profile, connections, conversations, requests), shown only to the owner, deleted with the account; logs and the cron monitor carry ids and fixed sentences only, never names or message text.
- LinkedIn's limits: the reads are the same as the owner pressing the four buttons once, spread over the working day; the most a first day can do is bounded by the existing daily budget. Not verified against LinkedIn's unpublished thresholds; noted in `MEMORY.md`.
- Migration: at most one additive nullable column; existing accounts keep working; rollback is removing the two actions (the column can stay).
- Dev vs production: in development `BROWSE_BUDGET` is off, so the reads follow each other with only the busy rule and the rest; tests set the budget on where they check it.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; brain integration tests for `accountDailyJob` (in the daytime, see the working-hours gotcha in `MEMORY.md`).
- Staging: add an account, sign in, watch `/jobs` and Sessions through the day: one task at a time, in order, inside working hours, and the four "done" fields set.

## Outcome

Shipped on branch `feat/first-day-reads`:

- Migration `20261030090000_add_first_day_reads`: `firstSignedInAt`, `nextFirstReadAt`, `nextConnectionsAt`, `nextProfileAt` on `LinkedInAccount` (nullable, additive).
- The sign-in hook notes `firstSignedInAt` once, on the first good sign-in that applied.
- `account-daily` (`accountDailyJob.ts`): for a signed-in account, the first reads in order (own profile, connection requests, connections), each after a random 0 to 20 minutes (`nextFirstReadAt`), one per pass, nothing else of the account asked meanwhile; a read tried in the last day that did not finish is left for the next day so a failing read is not asked every pass. Then the first read of the messages starts at once (not at a drawn time) through the existing 2-hour read and its batches. After the first reads: connections every 7 days and the own profile every 30 days, at a random time (`nextConnectionsAt`, `nextProfileAt`). The shared `askFor` replaced the copies of the request code for the visit and the requests.
- The first-day allowance: `TaskService.request({ firstDay })` (automatic only) lets `BrowseBudgetService.reserve` pass `anyHour` to `allowance`, which then skips only the working-hours check and the even release (measured against the office window); the gap, the day's cap and the background share still hold. Only within 24 hours of `firstSignedInAt`.
- The monitor: actions `profile-read` and `connections-read` labelled; counts `firstReads`, `repeatReads`.
- Page: the account drawer shows "First reads" (four lines, done or to come) until all are done; `linkedInAccount.list` sends `profileAskedAt`, `invitationsReadAt`, `connectionsReadAt`, `messagesBackfilledAt`.

Deviations: the first-day status shows what is done and what is to come, not the time the next one starts (the time depends on the budget answer at the moment it is asked).

Not verified: a real first day on staging. Local integration: the RabbitMQ queue-count test fails while a local worker runs (known); `accountProfile.service.integration.test.ts` failed once in a full run and passed on the rerun (it imports every pending profile import of the shared test database, so leftovers of other files can change it).
