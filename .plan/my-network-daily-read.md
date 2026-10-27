# My network: read the connection requests once a day, automatically

- Status: built and tested 2026-10-27; waits for a real run on staging (step 8) and the merge
- Created: 2026-10-27
- Locked by user: yes, 2026-10-27
- Builds on: `.plan/my-network-invitations.md` (the page, the task `linkedin-invitations`, brain tables and job). That plan locked "read on demand only"; this one changes it on the owner's request of 2026-10-27.

## Goal

Every account that is signed in has its received connection requests read once a day by itself, at its own random time, the way `linkedin-browse` is (`account-daily` job, `nextBrowseAt`), so My network is current when the owner opens it and a request that was withdrawn drops out without a click. The daily run only reads: it never accepts or ignores anything (answers stay manual, as locked).

## What the code does today (checked 2026-10-27)

- `AccountDailyJob.runDue` (`apps/brain/src/database/accountDailyJob.ts`), called by the worker job `account-daily` every 10 minutes, finds accounts whose `nextCheckAt`, `nextBrowseAt` or `nextMessagesAt` is null or past. A null time is only drawn (`dailyTime`, a random time later today in the account's own day, from its proxy's country). A due time asks the task with `trigger: 'automatic'`, then moves the time to tomorrow's draw (compare and set, so two workers never both ask). A refusal (`TaskRefusedError`: busy, budget, not signed in) leaves the time, so the next pass tries again. Accounts without a good sign-in in the last 24 hours are let go for the day.
- `linkedin-browse` is `budget.class: 'BACKGROUND'`; `classOf` turns that into `ACTION` for any manual request, so only the system's own runs count against the background share (40% of the day's browsing time, `BACKGROUND_SHARE`) and the owner's clicks do not.
- `linkedInBrowseHooks.onRequest` moves `nextBrowseAt` to tomorrow when the owner asks by hand (it counts as the day's visit).
- The task `linkedin-invitations` is `budget.class: 'ACTION'`, `policy.oneAtATime: 'account'`, `cooldownMs: 0`. The brain hook only checks the account is ACTIVE. The cron monitor lists the daily job's items by `action` with labels in `apps/body/src/components/jobs/describe.ts`.

## Requirements

Confirmed by the owner, 2026-10-27:

- Read only, once a day, never answering; this replaces the locked "no scheduled read" of the first plan.
- Every ACTIVE account is read (the same as the daily visit), not only the accounts whose owner has opened My network.
- A read the owner clicks does NOT count as the day's read: the daily read runs anyway at its own time.
- The empty manager page was unseen; the owner ran the task on an account with no pending requests (run 411f526d) and step 0 is done.
- Asked on 2026-10-27 after seeing My network on staging: a written line at the top of My network, and the same on Unibox, says when the next automatic check is. With several accounts (each has its own random time) it shows the earliest next time, in the browser's time zone, e.g. "Next check: tomorrow at 08:42", and says how many accounts it is the earliest of. On Unibox the messages are read every 2 hours, so the line says that rhythm and the earliest next read, e.g. "Next read: in about 1 hour 20 minutes".

Open questions: none.

## Scope and non-goals

- In scope: a daily automatic read for accounts that are signed in, at a random time of the account's day, with the same gates as the visit and the message read; the budget class; the empty page; the cron monitor label; tests.
- Out of scope: answering anything automatically (auto-accept rules stay out), notifications when a new request arrives, reading more than once a day, a read of the Sent tab, retention of sender data (still an open item), a setting for the owner to turn it off per account (can follow if wanted).

## Approach

- [x] 0. Done 2026-10-27 on `dharmendrashaheagle+linkedin` (run 411f526d, ERROR before the fix): the empty manager page draws the tabs Received and Sent, a single dropdown "Focused (0)" (not the chips "All (N)" of the other account), and inside the same `[data-testid="lazy-column"]` a paragraph "No new invitations" followed by "Suggestions for you" (listitems that are not requests). The reader now takes that paragraph as `empty` (no rows, and the words in the list), the task answers `DONE` with an empty complete list without scrolling, and a request asked for on such a page is `GONE`. Fixture and tests added. Not seen: a populated page on this layout ("Focused (N)" may leave out an "Other" group of requests), the words in another language.
- [x] 1. Schema: `LinkedInAccount.nextInvitationsAt DateTime?` (additive migration, nullable, so existing accounts get a first draw on the next pass).
- [x] 2. Spider: `linkedin-invitations` `budget.class` becomes `'BACKGROUND'` (a manual request is still `ACTION` through `classOf`); keep `estimateS: 120`. The worker announces the new catalog on restart.
- [x] 3. Brain `accountDailyJob.ts`: `Field` gains `nextInvitationsAt`; `findDue` and its `select` gain it; `requestInvitations(account)` asks `INVITATIONS_TASK` with `trigger: 'automatic'` and `input: { answers: [] }` like `requestVisit` (refusal: `retry`, other error logged and `retry`); `daily('nextInvitationsAt', 'invitations-read', ...)` runs after the visit, once a day (a new `every` is not used), with the same `signedInToday` gate; the result counts `invitationReads` and the summary line says it only when one was asked for.
- [ ] 4. Dropped: the owner chose that a read clicked by hand does not move the daily time, so the brain hook needs no change.
- [x] 5. Job text: `accountDaily` `purpose` and summary mention the invitation read; `apps/body/src/components/jobs/describe.ts` gets the label for `invitations-read`.
- [x] 6. The next-check line: brain returns `nextCheckAt` for each account of `network.list` (`nextInvitationsAt`) and `nextMessagesAt` for each account of `unibox.accounts`; the body has one pure module (`next-check.ts`, tested) that turns the times of the accounts shown into the sentence (earliest of the signed-in accounts; "today at", "tomorrow at" or the date; "due now" when the time has passed; "being scheduled" when no account has a time yet; the count of accounts when more than one), used by a small component at the top of My network and at the top of Unibox; the sample views carry times so the line can be looked at.
- [x] 7. Tests first: `accountDailyJob.unit.test.ts` (due and drawn; asked once a day and the time moves; refusal keeps the time; not signed in is let go; item `invitations-read`), `linkedInInvitation.hooks.unit.test.ts` is unchanged, reader test for the empty page, and an integration case in `linkedInInvitation.service.integration.test.ts` for a read of an account with nothing.
- [ ] 8. Gate (`pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`), then a real run: leave one staging account due and watch the monitor show `invitations-read` ASKED and the session DONE.
- [ ] 9. Plan `done` with Outcome; `MEMORY.md` updated; the `my-network-invitations.md` requirement "no scheduled read" marked superseded.

## Edge cases and risks

- Accounts with no requests: handled by step 0 (the page's "No new invitations" is an empty list, `DONE`). A page that shows neither requests nor those words still ends `ERROR`.
- Account not signed in, or no good sign-in in the last 24 hours: let go for the day (the same sentence as the visit); `SIGNED_OUT` from the run asks for a sign-in check through the existing hook.
- The account is busy (an answer run, a message read, another read): `TaskBusyError`, so `retry`; the time stays and the next pass (10 minutes) tries again. A refusal by the browse budget (outside office hours, the day, the 40% background share) behaves the same and clears when the account's hours open.
- A daily read near a read the owner clicked: they are not tied (the owner's choice), so two reads can run within minutes of each other. The one-run-per-account policy serialises them, and a read is idempotent and passive, so the cost is about a minute of the background share.
- A daily read while the owner's answers are queued: the one-run-per-account policy refuses it (`retry`); the owner's run is never delayed by a daily one.
- Concurrency: `move()` is a compare and set on the old time, so two brain workers never both ask; a worker that dies between asking and moving at worst asks twice in one day (the busy policy and the task's own limits keep it harmless, and a read is idempotent).
- Reads are idempotent: `store` applies a file again with no change; a read that is not complete (more than 100 requests, or a row it could not read) never marks the others gone.
- Passive on LinkedIn: opening the manager page changes nothing for the senders (unlike opening a message thread). One page view a day per account.
- Budget: a read is about 20 to 60 s of browser time against `estimateS: 120`; with the class `BACKGROUND` it uses the background share with the visit, the message reads and the profile, so it can push a busy account into `BACKGROUND_FULL` earlier. The visit is the first thing in the day to run into it; this adds about 2 minutes a day.
- Stored data grows: names, headlines, notes and photo addresses of every sender, for every account, with no retention (the owner's earlier choice), and reading daily for every account (the owner's choice of 2026-10-27) widens it. A retention policy stays the open item before real users.
- Rollout order: the migration is additive and nullable. Until the spider worker restarts with the new catalog the read is classed `ACTION` (harmless). A brain without the new job column cannot start, so migrate first (the init container does).
- A task that fails every day (the page changes): the item shows `ASKED` and the session `FAILED` in the monitor and Sessions; no alert exists. Known limit.
- Rollback: remove the `daily(...)` call; the column and rows stay; nothing else depends on them.
- Staging idle shutdown counts log lines as activity: only an asked read writes a line, like the visit.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- `pnpm --filter @automatedLinkedIn/brain exec vitest run src/database/linkedInInvitation.service.integration.test.ts` (needs Postgres).
- A real run on staging: an account with `nextInvitationsAt` in the past gets a session of `linkedin-invitations` with `trigger: automatic` within 10 minutes, the monitor lists `invitations-read`, the page shows the new "Last read" time, and an account with no requests ends `DONE`.

## Outcome

Built 2026-10-27, gate green (`pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`), the Postgres service test and the daily job test pass. NOT run on staging yet (step 8) and the new lines were not seen in a browser. Brain: `LinkedInAccount.nextInvitationsAt` (migration `20261027152854_add_next_invitations_at`, nullable), `AccountDailyJob` asks `linkedin-invitations` (input `answers: []`, trigger `automatic`) once a day at the account's own random time with the same gates as the visit (item `invitations-read`, counted as `invitationReads`), job text and the monitor label updated. Spider: the task budget class is `BACKGROUND` (a manual request is still `ACTION`). The next-check line (asked on staging 2026-10-27): `network.list` returns `nextCheckAt` for each account and `unibox.accounts` returns `nextMessagesAt`; the body has one pure sentence maker (`lib/next-check.ts`, tested) and one line component (`components/next-check-line.tsx`) used at the top of My network ("Read automatically once a day. Next checks: tomorrow between 06:30 and 17:40, each account at its own time.") and of the Unibox ("Messages are read automatically every 2 hours. Next read: in about 35 minutes. It is the earliest of 2 accounts."), for the accounts shown that are signed in, in the viewer's time zone. Deviations: the Unibox reads every 2 hours already, so its line says that, not "once a day"; step 4 was dropped as planned. Follow-ups: the line shows only accounts that are signed in; an account with no drawn time yet is counted as "not scheduled yet" for the daily line; a real run on staging to see `invitations-read` ASKED in the monitor and the session DONE.
