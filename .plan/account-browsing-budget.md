# Browsing time budget per LinkedIn account (safe, moderate, aggressive)

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-10-25
- Locked by user: yes, 2026-10-25 (answers below; plan only, not built yet)

## Goal

Every LinkedIn account gets a daily browsing-time limit set by a mode the owner picks: **safe** 90 minutes, **moderate** 120, **aggressive** 180. Browser sessions of the account are only started while the account has time left, in office hours, spread across the day and never back to back. Time is counted from what each session really used (the length of its video), once the session ends, whatever the result. The limit is on the account, not the proxy.

## What exists today (checked in code, 2026-10-25)

- Every browser run is a task started by `TaskService.request` (`apps/brain/src/database/task.service.ts`): visit blocks, profile reads, messages reads and replies, the account's daily job, sign-in checks and the "Run" buttons all go through it. It already checks one policy per task and scope (`cooldown_ms`, `one_at_a_time`) in `checkPolicy`, then saves the session and a dispatch row in one transaction. That transaction is the one place where a new account-level check fits.
- A finished run, a failed one and one that never started all reach `TaskService.applyResult` / the dispatch give-up path, which end the `SpiderSession` (`status`, `startedAt`, `finishedAt`, `durationMs`, `recordingPrefix`). `durationMs` is the whole task, including waiting; it is not browser time.
- The spider records a run only when `SPIDER_RECORDING` is `failures` or `always` (code default `off`; `always` on staging and in compose); the video (`video.webm`) is uploaded with the run and listed as an artifact with its size (`bytes`), never its length. A video made by Playwright's ffmpeg carries its duration: a local recording read as `Duration: 00:02:32.24`, and the worker image already holds that ffmpeg.
- The spider pins each account's time zone from its proxy's exit (`identity/lookupExit.ts`, `identities/<account>/identity.json` in the bucket). Brain has no time zone, working hours or mode for an account (`LinkedInAccount` has `status`, `nextMessagesAt`, `profileAskedAt`, ...).
- Other pacing that stays: 3 minute gap and one at a time per task and account, 15 profile or company views a day, 30 days per page, the messages read every 2 hours, the daily job.
- A visit block already understands a refusal that "clears by itself" (`worker/engine/visitRefusal.ts`) and waits with a note; a budget refusal slots in there.
- The mix of today's sessions (screenshot of Sessions) shows how fast time goes: a messages read is 2 to 4 minutes, about 12 a day, so background reads alone can take 25 to 50 minutes of a 90 minute safe day.

## Proposal

### Modes and numbers

`SAFE` 90, `MODERATE` 120, `AGGRESSIVE` 180 minutes a day (constants in `packages/contracts`). New column `LinkedInAccount.browseMode`, default `SAFE`. The owner sets it per account on the accounts page.

### The day, the office hours and the spread

- A day is the calendar day in the account's time zone. Office hours default to 09:00 to 18:00 on Monday to Friday (account columns `officeTimeZone`, `officeStartMinute`, `officeEndMinute`, with these defaults; see questions 1 and 2).
- Time is released evenly through the office window: at a moment `t` the account may have used at most `cap x (time elapsed in the office window / window length) + burst`, where `burst` is one session's worth (default 10 minutes) so a click is not held for an hour. A session starts only if `used + reserved + its estimate` fits under that line. Outside office hours nothing starts.
- Never continuously: at least a gap between the end of one session and the start of the next, whatever the task (default 10 minutes), on top of the per-task gaps.

### Counting (session based)

1. **Before a session starts** (inside `TaskService.request`'s transaction, with the account row locked so two requests cannot both pass): compute what is left and whether it is office time and past the gap; if not, refuse with a new `BrowseBudgetError` (a `TaskRefusedError` with a reason: `OUTSIDE_OFFICE`, `DAY_FULL`, `TOO_SOON`, `GAP`, and the time it may be asked again). If yes, save a **reservation** row for the session with the task's estimated seconds.
2. **After the session ends, whatever the result:** replace the estimate with what was used. Source order: the video's length, then the browser-open time the spider measured, then (only when the browser never opened: not queued, cancelled, no proxy) zero.
3. **Never ended** (worker died): the reservation counts at its estimate until the session is closed by the existing give-up path, which then settles it.

New table `BrowseUsage` (one row per session: account, session id unique, day, seconds, source `ESTIMATED | VIDEO | MEASURED | NONE`, class, settled time). The account's used time for a day is the sum of its rows; nothing is derived from proxies.

### Measuring a run (spider)

After the browser context closes (the video is complete only then), the worker reads the video's length with the ffmpeg Playwright already installed and puts it in the result (new optional fields: `seconds` on the video artifact and `browser_seconds` on the result, additive, old workers simply omit them). It always measures the browser-open time as well (context created to closed), which is the fallback when a video is not made. For this to be the one measure, the worker records a video for the length even when `SPIDER_RECORDING` would keep nothing: the file is read and then dropped, not uploaded (question 5).

### What the check applies to

Every task goes through the same check, so tasks added later (send an invite, and so on) are covered with no code of their own. Each task's manifest gets a small `budget` entry: an estimated length and a class: `ACTION` (asked by the owner or a workflow), `BACKGROUND` (reads the system schedules: messages, profile, daily visit), `SYSTEM` (sign-in checks: counted, never refused, because an account that is not signed in can do nothing else).

### What the owner sees

- Accounts page: a mode selector per account (with a short warning on Aggressive), and "used today 42 of 90 min" with the next time a session can start.
- A refused request says why in plain words ("This account has used its browsing time for today. It can browse again at 09:00 tomorrow."). A visit block waits with that note (it clears by itself, so it stays under its 8 hour limit and the rest is left for the next run).
- Sessions page: each session shows the minutes it counted.

### When there is no time left

- **The owner clicks an action** (View a profile, Run, Test login, a reply): a hard stop with the sentence above and the time it can start; no override.
- **A workflow asks** (a visit block, and later blocks): the work is scheduled for the next time the account may browse, not dropped and not tried again every few seconds. A refusal that says the day is full or it is outside office hours carries `until` (the next office start, plus a small random minute count so many accounts do not start together); the block gives its step back with `WorkflowStepRun.waitUntil = until` (the engine already holds a step until then) and the note "Scheduled for tomorrow 09:12: this account has used its browsing time for today." Short refusals (gap, too soon, a few minutes) keep the short wait. The block's own 8 hour limit counts from the later of its start and the end of its last deferral, so a night in between does not use it up.
- A run can therefore stay RUNNING over a night or a weekend; the Runs page shows the note and the owner can stop it.

## Requirements

Confirmed (from your request): three modes with 90, 120 and 180 minutes a day per account; the limit is spread evenly over office hours and is never used continuously; the owner sets the mode per account; it is session based: before a task the account is checked for time left, after it the video length is booked, whatever the result; the limit is on the account, not the proxy.

Answered by the owner on 2026-10-25:

1. **Office hours.** 09:00 to 18:00, Monday to Friday, set per account.
2. **Whose time zone.** Per account, defaulting to the zone of its proxy's exit country, editable.
3. **How evenly.** Released evenly over office hours, with a 10 minute burst and a 10 minute gap between sessions.
4. **Background reads.** Messages read, profile read and the daily visit may take at most 40 percent of the cap.
5. **Measure.** Video length as the book, browser-open time as the fallback; the worker measures even when recording is off (the video is read, not uploaded).
6. **Owner clicks.** Hard stop, no override. *A workflow's request is scheduled for tomorrow* (see "When there is no time left").
7. **Overshoot.** Allowed, no carry-over to the next day.
8. **Existing accounts.** All start on Safe.
9. **Sign-in checks.** Counted, never refused.

## Scope and non-goals

- In scope: the mode and office columns, `BrowseUsage`, the check and reservation inside `TaskService.request`, settlement at the end of every session, the spider's measuring and the contract fields, the task `budget` manifest entry, error mapping to the owner, the visit block's refusal text, the accounts page selector and meter, tests, `MEMORY.md`.
- Out of scope: per-proxy limits, limits per client or workspace, changing the existing per-task gaps and the 15 a day view cap, rest days or holidays, randomised office hours, billing.

## Approach

- [x] 1. Lock this plan (answer the open questions).
- [x] 2. Contracts, tests first: the three limits, `BrowseMode`, the optional result fields, the manifest `budget` entry.
- [x] 3. Pure allowance function, tests first (office window and zone, weekday, evenly released line, burst, gap, day full, next time it can start), then the migration (create-only, folder name sorts last, read the SQL) for `browseMode`, office columns and `BrowseUsage`.
- [x] 4. `BrowseBudgetService`: reserve inside `TaskService.request` with the account row locked, settle in `applyResult` and the give-up path, a daily sum for the page; unit and integration tests (two requests at once cannot both pass, a failed run still books, a run that never opened books zero).
- [x] 5. Spider: measure the video and the browser-open time, report them; tests with a real short video and a run with no video.
- [x] 6. Refusal mapping (router error text with the time), the workflow side: a refusal with `until` becomes the step's `waitUntil` and its note, the visit step's 8 hour clock restarts after a deferral, tested through the engine (a full day defers to the next office start; a short gap waits minutes).
- [x] 7. Body: mode selector, usage meter and next time on the accounts page, minutes on the Sessions page; helpers tested first.
- [~] 8. (checks pass; the live check with a test account is left) `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, all warnings fixed, brain integration tests; `MEMORY.md`; plan done. A live check with a test account and a short window, with your go-ahead.

## Edge cases and risks

- **Rollout order.** Brain must accept the new optional result fields before a new worker sends them (results are strict objects). Brain first, then the spider, as for other contract changes.
- **A rule that starves the account.** Background reads could eat the day; the 40 percent ceiling for them keeps the rest for actions. An office window too short for the mode's minutes is refused when saved (the window must be at least as long as the cap, so safe needs 90 minutes of office).
- **Concurrency.** Two requests for one account at once: the account row is locked for the check and the reservation, so the second sees the first. Settling is idempotent (the usage row's session id is unique).
- **Crashes.** A session whose result never arrives keeps its reservation at the estimate until the existing 15 minute give-up closes it; the reservation then settles to zero (the browser never opened) or to the measured time.
- **Clock and zone.** The day and window use the account's IANA time zone; daylight saving changes shorten or lengthen a day by an hour, which only moves the line. An invalid zone falls back to UTC with a visible note.
- **Mode changes.** Switching mode applies at once; time already used stays used. Lowering the mode below what was used stops more sessions for the day.
- **Existing data.** Additive migration; all accounts start Safe with default office hours; old sessions have no usage rows (their time is not counted for the past).
- **Compliance.** This only reduces and spaces the automation of the owner's own accounts, in line with the project's rule to follow LinkedIn's limits. Aggressive is a choice the owner makes with a warning; no mode removes the existing action caps. The limits are conservative targets, not a guarantee against LinkedIn restrictions.
- **Privacy and security.** Usage rows hold account id, session id, seconds and a class only; no page content. The mode is changed only by the account's owner (owner-scoped procedure).
- **Dev vs production, Docker, CI.** `ffmpeg` already ships with the worker image; the local worker needs Playwright's ffmpeg (already needed for video). No new env var except possibly one to switch the check off in development.
- **Not verifiable here.** What daily time LinkedIn really tolerates; the numbers are the owner's.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; brain integration tests with Postgres.
- One live check with a test account on a small window (with your go-ahead): sessions start only inside the window, spaced, and the booked minutes match the videos.

## Outcome

Built 2026-10-25 on branch `feat/browsing-ui`. Contracts (`packages/contracts/src/browse.ts`, optional `browser_seconds` on the result and `budget` on the catalog entry), migration `20261025010000_add_browse_budget` (`browseMode`, office columns, `clientLabel`, `BrowseUsage`), `database/browseAllowance.ts` (pure), `browseBudget.service.ts` (reserve inside `TaskService.request` with the account row locked, settle in `applyTaskResult`, release in `SpiderSessionService.fail`), `browse.service.ts` and router `browse` (overview, year, day, mix, change), the visit block puts itself off until the accounts are back (`visitRefusal.deferralOf`, `waitUntil`, its 8 hours restart), spider `budget` on every task and `browser_seconds` in the runner, 13 month retention of `BrowseUsage`. The check is `BROWSE_BUDGET` (on in production, off in development and tests).

Deviations: (1) the measure is the time the browser stayed open (context opened to closed), not the length of the video read with ffmpeg; the two are the same in practice because the video records the context, and it needs no ffmpeg, no extra file and works with recording off. (2) A result from a worker without `browser_seconds` is booked at the run's own time (source `ESTIMATED`). (3) Without a zone of its own, an account follows the main zone of its proxy's detected country (`browseZone.ts`), UTC when none. (4) Past days of the year graph show the account's current limit, because the limit of each day is not kept. (5) A scheduled read by the owner's own click counts as an action; only `automatic` background tasks count towards the 40 percent.

Rollout: brain first, then the spider (results are strict objects). On staging `BROWSE_BUDGET` is on by default: every account starts Safe, 09:00 to 18:00 Monday to Friday in its proxy's zone, so visits and reads outside those hours wait. Left: the live check with a test account on a short window, and an owner field in the add and edit forms for the client label (it can be set from the Accounts drawer and the Activity view).
