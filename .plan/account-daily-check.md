# Daily account check at a random time, with light browsing after sign-in

- Status: done
- Created: 2026-10-19
- Locked by user: yes, 2026-10-19

## Goal

Every connected LinkedIn account is checked at least once a day, at a different time each day. The check signs in (the existing `linkedin-login` task), so a broken session or changed credentials show up on the account as "Needs your attention" for the owner to fix. After a good sign-in the browser does what a person does: reads down the feed, opens one or two posts and the profile of who posted them, and opens the own profile.

## What exists (2026-10-19)

- `linkedin-login` (spider) signs in with the stored token or password, then `browseAfterLogin` scrolls the feed 4 times, opens `/in/me/` and stays 15 to 20 s. Time limit 3 min.
- Brain: `LinkedInAccountValidationService.request` asks for the task (`trigger: 'automatic' | 'manual' | 'retry'`); `linkedInLogin.hooks.ts` maps the verdict onto `LinkedInAccount.status` (VALID to ACTIVE, NEEDS_REAUTH, BLOCKED, ERROR) and sets `lastVerifiedAt`. One run per account at a time.
- Brain worker scheduled jobs: `defineJob` file plus a line in `worker/jobs/registry.ts`. No job checks accounts today; the only recurring task is the browser check per proxy (`automatic: proxy.active`, 24 h, fixed).
- No notification to the owner beyond the account's status badge.

## Proposal

Two separate daily runs per account, each at its own random time: the sign-in check (the existing `linkedin-login`) and a new browse task (`linkedin-browse`). The browse task only runs when the account's last sign-in was VALID within the last 24 h.

1. **Schedule (brain).**
   - New nullable columns `LinkedInAccount.nextCheckAt` and `nextBrowseAt` (additive migration).
   - A worker job `account-daily` runs every 10 min:
      - Sign-in: for each ACTIVE or ERROR account whose `nextCheckAt` has passed (or is null), request `linkedin-login` (`trigger: 'automatic'`) and draw the next time.
      - Browse: for each ACTIVE account whose `nextBrowseAt` has passed (or is null) and whose `lastVerifiedAt` is within 24 h, request `linkedin-browse` and draw the next time. Without a recent VALID sign-in the browse of that day is skipped and the next day drawn.
   - Next time: a random moment between 08:00 and 22:00 of the next calendar day in the account's timezone (the device identity's pinned timezone, else UTC); null draws one for today if the window is still open, else tomorrow.
   - A request refused because a run is in progress or no proxy is free keeps the time, so it is tried on the next pass.
2. **The browse task (spider, `linkedin-browse`).**
   - Needs the account and a proxy; starts from the saved session only (no credentials, never types a password).
   - Opens the feed; if LinkedIn asks for a sign-in, it stops with SIGNED_OUT.
   - Scrolls the feed with varied distance and pauses; opens 1 or 2 random posts, reads, opens each author's profile, scrolls, stays; opens the own profile (`/in/me/`), scrolls, stays.
   - Nothing is read, stored or reacted to (no likes, comments, follows, invitations, messages). The session cookies are kept afterwards, as after a sign-in.
   - Verdicts: DONE, SIGNED_OUT, ERROR. Time limit 6 min.
   - Brain hook: SIGNED_OUT sets `nextCheckAt` to now, so the sign-in check runs on the next pass and its verdict updates the account. DONE and ERROR change nothing on the account.
3. **Unchanged:** `linkedin-login` keeps its short browse after sign-in; the owner's "Verify" works as today; the status badge is the only alert.

## Requirements

Confirmed:

- At least one check per account per day, at a random time, never fixed.
- After sign-in: scroll the feed, open one or two random posts and their authors' profiles, open the own profile.
- Problems surface on the account so the owner fixes the credentials.
- The browsing is a separate task; it needs a VALID sign-in within 24 h and runs at its own random time (answered 2026-10-19).
- Opening 1 or 2 post authors' profiles a day is fine, although they see the visit.
- Times between 08:00 and 22:00 in the account's timezone.
- Staging may miss a day while its pool is scaled to zero; accepted.
- The status badge is the only alert for now; the sign-in task keeps its short browse.

Open questions: none.

## Scope and non-goals

- In scope: the columns and migration, the brain worker job and its tests, the next-time draw, the `linkedin-browse` task (spider) and its brain hook, MEMORY.md.
- Out of scope: notifications, any action on other people's content, scraping what is viewed, more than one sign-in and one browse a day, changes to `linkedin-login`.

## Approach

- [x] 1. Lock this plan.
- [x] 2. Tests first: the next-time draw (next calendar day, 08:00 to 22:00, account's timezone, random); the job (due accounts requested, statuses and the 24 h rule, a refused request keeps the time); the browse task (posts and authors opened, own profile, SIGNED_OUT, a failed visit is not a failure); the hook (SIGNED_OUT brings the sign-in forward).
- [x] 3. Migration (additive), job, spider task, hook.
- [x] 4. Gates, the brain integration test for the job (Postgres), a local devtools run of `linkedin-login` to watch the browsing, MEMORY.md, Outcome, PR.

## Edge cases and risks

- **Compliance:** this signs in to the owner's own account once a day and only views pages. It reacts to nothing and stores nothing from other members. LinkedIn's User Agreement restricts automated use; volume is kept at one short visit a day per account and every rate limit and block page is respected, as the spider already does.
- **Many accounts on one proxy:** checks of different accounts spread over the day; the existing per-account lock and proxy pick apply.
- **Job runs twice (two workers or a restart):** the request is guarded by the account's one-at-a-time rule and `nextCheckAt` is moved in the same transaction as the request, so an account is not asked for twice.
- **Clock and timezone:** an unknown or bad timezone falls back to UTC; daylight-saving days still get one check.
- **Existing accounts:** the migration leaves `nextCheckAt` null; the job treats null as "draw a time now", so every current account gets its first time on the first pass.
- **Longer runs:** about 6 min per account a day on the worker; with one worker that fits about 200 accounts a day.
- **Rollback:** remove the job line; the column stays (additive), browsing change is a revert.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; the brain integration test for the job.
- A local devtools `linkedin-login` run with the recording on, to watch the feed, posts, authors and own profile.

## Outcome

- Shipped:
   - Migration `account_daily_times` (two nullable columns, additive).
   - `core/dailyTime.ts`: `dailyTime` (random minute 08:00 to 22:00, today or tomorrow, clock changes handled with `Intl`) and `timezoneOfCountry`.
   - `AccountDailyJob` (`database/accountDailyJob.ts`) plus the worker job `account-daily` (every 10 min).
   - `linkedin-browse` (spider, `tasks/linkedinBrowse`): feed, own profile, 1 or 2 posts and their authors, from the saved session; DONE keeps the session.
   - `linkedInBrowse.hooks.ts`: SIGNED_OUT sets `nextCheckAt` to now.
- Deviations:
   - Brain does not know the device's pinned timezone (the spider keeps it in the bucket), so the day is the timezone of the primary ACTIVE proxy's country (`detectedCountryCode`, one main zone per country, UTC when unknown).
   - A good sign-in within 12 h (the owner's own check, say) counts as the day's check: the job draws tomorrow instead of signing in again.
   - Posts and authors are read from the page HTML (`pageHtml`): post links `/feed/update/urn:li:(activity|share|ugcPost):<id>`, and the author is the first `/in/` or `/company/` link on the post page that is not the own profile. This is a guess about LinkedIn's markup; a miss only logs "The post links to no author".
- Follow-ups:
   - Watch the first real runs (recordings) to confirm the post and author links on real LinkedIn pages.
   - Owner alerts (separate plan).
   - The spider pipeline integration tests time out while a local dev spider worker consumes the same RabbitMQ; stop `pnpm dev` before running them.
