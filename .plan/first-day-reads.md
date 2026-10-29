# First day of a new account: read its profile, connections, messages and connection requests

- Status: done (phase 1 and phase 2; staging run left to the owner)
- Created: 2026-10-30
- Locked by user: phase 1 yes, 2026-10-30; phase 2 yes, 2026-10-30

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

## Phase 2: Profile loading and progress bar (locked 2026-10-30)

Same PR (#134). The first-day reads are shown to the owner as "Profile loading": a progress bar from 0 to 100 % on the LinkedIn accounts page, and, once the own profile is read, the account's LinkedIn name and picture in its row.

### Weights (from the owner, 2026-10-30)

| Step | Weight | Done when (from data that exists) |
| --- | --- | --- |
| Account sign-in | 10 % | the first good sign-in (`firstSignedInAt`, or `lastVerifiedAt` for accounts older than this change) |
| Own profile | 10 % | the profile is stored (`LinkedInAccountProfile` row), not only asked (`profileAskedAt`) |
| Connections | 20 % | `connectionsReadAt` |
| Connection requests | 20 % | `invitationsReadAt` |
| Messages | 40 % | `messagesBackfilledAt` (the whole inbox read once) |

The percentage is the sum of the steps that are done. Steps are counted as done once and never go back: a later weekly or monthly read, a sign-out or a failed read do not lower it.

### What the row shows

- Before the profile is read: the login email, as today, and the bar.
- After the profile is read: the LinkedIn picture and name (from PR #131 the profile read sets `displayName` and `imageUrl`), the email under it, and the bar.
- The bar: a thin bar with the percentage in words next to it ("Profile loading 50 %") and, on hover or focus, the five steps with done, running, waiting (with why and when) or failed. At 100 % the bar shows once as "Profile loaded" in green and then is no longer shown (open question 4).
- Colour by progress, going red, white, yellow, blue, green: 0 to 19 % red, 20 to 39 % white (with a grey border so it shows on a white page), 40 to 59 % yellow, 60 to 99 % blue, 100 % green. The words and the percentage always say the same, so the colour is never the only signal (colour-blind owners, screen readers: `role="progressbar"`, `aria-valuenow`).
- The same bar and steps replace the "First reads" list in the account drawer (one way to show it, not two).

### What makes it move, and what stops it

- Running: the step whose task is in progress shows "Reading..."; the page already refreshes the accounts list, so the bar moves without a reload (check the refresh rate; at most once a minute).
- Waiting: a step that the budget, working hours, the rest between sessions or a missing proxy holds shows why and from when, in the account's words ("Goes on tomorrow at 09:10").
- Failed: a step tried today that did not finish shows "Did not finish, tried again tomorrow" with a button to try now where the page already has one (Read profile, Read connections, Read requests, Read messages).
- Stuck at 0 %: sign-in failed (wrong password, two-step key, checkpoint): the bar is red at 0 % and says the sign-in problem (the status badge already does); nothing else is read until a sign-in works.
- Paused account: the bar stays where it is and says "Paused".
- Messages are the biggest step and can take days: within it, the bar does not move until the whole inbox is read (no partial count exists today; open question 2).

### Phase 2 requirements

Confirmed (2026-10-30):

- Name "Profile loading"; a progress bar 0 to 100 %; weights 10 sign-in, 10 own profile, 20 connections, 20 connection requests, 40 messages.
- Shown on the LinkedIn accounts page; once the profile is read, the account's name and picture with the bar.
- Colours from red to white to yellow to blue to green as it grows.
- In the same PR (#134).

Open questions (must be empty before locking): see below, after the reviewers.

### Review (2026-10-30: Agency Owner, Founder, Platform Admin, GTM Engineer), ranked

Taken into the plan (proposed; confirm with the lock):

1. **Health wins over the bar** (all four): an account that is signed out, needs its code, is paused, restricted or has no proxy shows that problem in words with one action ("LinkedIn wants your code again. Enter it."), not "loading 70 %"; the bar stays below, greyed, at its value. A real failure looks different from loading: an icon, the words, no colour ramp.
2. **Own profile done means stored, and it is retried** (three, a real bug in phase 1): the job asks the profile read again once a day, up to 3 times, while no profile is stored (not only while `profileAskedAt` is null); after 3 it shows "Did not finish. Press Read profile." Otherwise a failed read leaves the bar at 90 % for good.
3. **Ready labels** (GTM Engineer): under the bar, "Ready for workflows" once the own profile and connections are read, and "Ready for the Unibox" once the messages are read; what the account can be used for, not only a number.
4. **Say the step and the reason in words under the bar**, not only on hover (works on a phone): "Reading connections now", "Messages: 340 conversations read so far, goes on tomorrow", "Waiting for working hours, goes on tomorrow". The reason and the day, never a clock time we cannot promise.
5. **Empty accounts reach 100 %**: a read that finds no connections, no requests or an empty inbox still marks its step done; one test per step.
6. **A summary line on the accounts page**: "4 loaded, 1 loading, 1 needs you", and the accounts that need the owner first.
7. **"Loaded" stays as a small green tick**, instead of a green bar that shows once and hides (no per-browser memory, the same for every member of the team).
8. **"Reading..." ends**: a step whose run is older than the task's time limit shows as did not finish, not "Reading..." forever.
9. **One line of trust under the bar**: "We only read. Nothing is posted, sent or accepted. It uses the account's browsing time, no credits."
10. **Refresh at most once a minute** while a bar is moving; on opening the page otherwise.
11. **Checks for the operator** (Platform Admin): on `/jobs`, accounts whose bar has not moved in 3 working days, with the reason; the arithmetic that each first read fits the background share of each browsing mode (connections about 25 minutes against 40 % of SAFE), with a test.
12. **A sign-in problem during the first day** stops the remaining first-day reads and ends the night allowance (the job already asks only for ACTIVE accounts and the allowance needs ACTIVE; a test proves it).

Left out, with the reason:

- A warning in the workflow account picker ("still loading"): useful, but another screen; later.
- Try-now buttons inside the hover: the drawer and the account page already have the Read buttons; the words point there.
- Deletion while a read runs and erased people coming back with the weekly read: existing behaviour of every read today, not new here; noted in `MEMORY.md` as open items for their own plan.

Open questions (must be empty before locking):

- None. Answered 2026-10-30:
  1. **Colours**: softer tones of the same ramp: light red (0 to 19 %), light grey (20 to 39 %), yellow (40 to 59 %), blue (60 to 99 %), green (100 %). A real problem is shown apart (icon and words), not by the ramp.
  2. **Messages**: the bar moves inside the step by the conversations stored so far, as an estimate that grows toward the step's end but never reaches it until the whole inbox is read: `40 % × n / (n + 150)` for `n` stored conversations (100 conversations show about 16 of the 40, 600 about 32), shown as "about"; the words say "340 conversations read so far". Exactly 40 when `messagesBackfilledAt` is set.
  3. **Re-added account**: the login is remembered for 30 days after the account is deleted (owner and a SHA-256 hash of the lowercased login email, additive table `FirstDayUsed`, swept by retention after 30 days); an account added again with the same login in that time gets the first reads but no night allowance.
  4. **Proxy at night**: no extra limit per proxy; each account has its own proxy or proxies (owner, 2026-10-30).
  5. **Name**: "Getting your LinkedIn ready" on the page (the plan and code may still say first-day reads).

### Phase 2 approach

- [x] Brain, test first: `loadingOf(account)` (one server-side function): the five steps with done, reading, waiting or did not finish, the percentage with the messages estimate, the ready labels; older accounts with only `lastVerifiedAt`; empty reads reach 100 %; a not-ACTIVE account carries its problem. Sent with `linkedInAccount.list`.
- [x] Brain, test first: the own profile counts as done only when stored, retried once a day up to 3 times; a sign-in problem stops the first reads and the night allowance.
- [x] Brain, test first: `FirstDayUsed` (migration, additive), written when an account is deleted after its first sign-in, read before the night allowance, swept after 30 days.
- [x] Brain: `/jobs` flags accounts whose loading has not moved in 3 working days; a test that each first read's estimate fits the background share of each browsing mode.
- [x] Page, test first: the colour of a percentage, the words under the bar, the summary line; then the row (picture, name, email, bar, words, ready labels, green tick at 100 %) and the drawer (the same bar and steps instead of "First reads"); refresh at most once a minute while loading.
- [x] Definition of done, `MEMORY.md`, PR #134 updated. A real first day on staging is left to the owner.

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

Phase 2 (same branch and PR #134):

- `accountLoading.ts` (`loadingOf`, pure) and `accountLoading.service.ts` (`loadingsOf`, four queries for all accounts): `linkedInAccount.list` gives each account `loading` (percent, the five steps as DONE, READING, WAITING, NOT_FINISHED or GIVEN_UP, conversations read, ready for workflows, ready for the Unibox). Messages grow as `40 × n / (n + 150)`, at most 39 until the inbox is read.
- The own profile counts once stored (`LinkedInAccountProfile`), not once asked; the job asks it again on a later day up to `PROFILE_TRIES = 3`, then leaves it to the owner (GIVEN_UP).
- `FirstDayUsed` (migration `20261030100000_add_first_day_used`, SHA-256 of the lowercased login, kept 30 days, swept by retention): written when an account that had its first sign-in is deleted; the job gives that login no night allowance.
- The monitor: `getting-ready` items for an account still not ready 3 days after its first sign-in.
- Page: the row shows the LinkedIn picture and name over the login and the bar with one line under it (`getting-ready.tsx`, `loading.ts`: tones light red, light grey, yellow, blue, green; words for reading, not finished, given up, messages so far, what is next; a greyed bar and "Waits..." for a paused or signed-out account); "Ready" with a tick at 100 %. The drawer shows the steps, their weights and the trust line instead of "First reads". The accounts page says "Getting your LinkedIn ready: N ready, N getting ready, N need you" and refreshes once a minute while a bar moves.

Phase 2 deviations: "stalled" is 3 calendar days, not working days; the budget arithmetic was checked by hand (the four first reads estimate 120 to 600 seconds each, far under 40 % of SAFE's 90 minutes) rather than in a test, because the estimates live in the spider's task definitions, which brain does not import. The "Ready for workflows" warning in the workflow account picker stays out of scope.