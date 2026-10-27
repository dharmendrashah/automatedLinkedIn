# Accounts: a "Today" checklist per account (what is done, what is pending, what comes next)

- Status: done
- Created: 2026-10-27
- Locked by user: yes, 2026-10-27 (all seven proposals, as written)

## Goal

On `/accounts` each account shows what the tool did for it today and what is still to come, in four items: Check login, Daily visit, Check messages, Check my network. Each item has when it last ran with its result, when it is expected next, and a manual Run now. The list shows them in a compact Today cell in place of the Browsing today column; the full checklist, with timestamps and the manual actions, is the first section of the account's side drawer. A person can tell at a glance what is done, what is pending and what to expect.

Reviewed by the GTM Engineer, Agency Owner, Founder and Platform Admin persona agents; their findings changed the plan (below).

## Requirements

Confirmed (request of 2026-10-27):

- Four items per account: Check login, Daily visit, Check messages, Check my network.
- Each with the last time it ran and its status, and the next expected time, as proper chips (the Done and In Process chips of the Sessions page).
- The Browsing today column leaves the list and this takes its place; the detail lives in a drawer, with a manual action to trigger each item.

Open questions (must be empty before locking): none. All seven answered yes, as proposed:

1. List density: the Today cell is compact from 4 accounts (four small icon chips on one line plus "2 of 3 daily checks done"), and shows the full chips with times for 1 to 3 accounts and when "Detail" is switched on in the Columns menu (kept in this browser). It keeps one muted line "21 of 90 min" so the browsing budget stays visible. The Browsing today and Daily visit columns move to the Columns menu (off by default); the Browsing today section stays in the drawer. Proposed: yes.
2. Test login and Visit now leave the drawer's State section and become the Run now of their rows (each action once). The account page strip keeps its own. Proposed: yes.
3. Run now on Check messages asks first, because a read marks conversations read on LinkedIn and the other person sees it. The other three run on one click. Proposed: yes.
4. "Today" is the account's own day (the time zone of its working hours). Proposed: yes.
5. One new brain read, `linkedInAccount.today` (additive, no migration, no change to any task or schedule). The job log's skip reasons are not used in this round. Proposed: yes.
6. Filtering and the page sentence: a "Failed" chip joins All, Needs you and Ready; "Pending today" and "Due now" go in More; the banner says how many daily checks are done and the next one ("All 3 accounts are fine. 7 of 9 daily checks done today. Next: messages 14:00."). Proposed: yes.
7. An "Export today" button writes the checklist of the accounts shown to a spreadsheet (account, client, item, last run, result, next), built in the browser, for the owner's own report to a client. Proposed: yes.

## Persona findings and what changed

- All four: the plan was right to put Last, Next, result and Run now on one row in the drawer.
- Chip noise at 40 accounts and tall rows (Agency 5 out of 10): the compact cell, "Detail" switch and filter chips above.
- Messages run every 2 hours, so "Done 12:00" looks the same at 12:05 and 13:50 (GTM): messages are not counted as a daily check; they show the age of the last read ("read 1 h 50 min ago") and turn amber only when late by more than one interval.
- A failure from days ago looks like today's problem (GTM): a failed newest run stays failed until a later run works, always with its date ("failed 3 days ago") and a link to the last good run.
- Pending today must not look like a warning (Agency): grey for later today; amber only for "waiting to start" and "late".
- Plain words (Founder): "Due" becomes "Waiting to start", "On hold" becomes "Paused" or "Waiting for sign-in" with the reason in the chip text, not only a tooltip; the drawer starts with "These run by themselves within safe limits. You never need to press anything."; the messages confirmation says "Nothing is sent or accepted. Checking messages marks them as read on LinkedIn."
- Browsing today leaving hurts the GTM Engineer (minutes left decide if an account has room): the Today cell keeps the "21 of 90 min" line.
- Platform Admin checked the claims against the code (see What exists): the job-log skip reasons are dropped (no index, no timestamp, retries logged as skipped, 500 items a run cap), a manual messages or network run does not move their next time, the login check also exists as old rows without a task, a stuck IN_PROGRESS session is never ended by a sweep (the body shows "No answer" after 30 minutes), the other tasks can set the check due "now" when they find the account signed out.
- Asked for and left for later (need brain): workflows per account, counts a read found, failures in the last 7 days, a 30-day history per account, a morning alert, a bulk Run now (risky: many reads marking messages as read), the skip reasons from the job log.

## What exists today (checked in code, 2026-10-27)

- The brain worker job `account-daily` (`database/accountDailyJob.ts`) schedules these four, each with a next time on `LinkedInAccount`: sign-in check `nextCheckAt` (daily, random time of the account's day; for ACTIVE and ERROR accounts; let go when signed in within 12 hours, which counts as the check), visit `nextBrowseAt` (daily), messages `nextMessagesAt` (every 2 hours), connection requests `nextInvitationsAt` (daily). The last three run only for an ACTIVE account that signed in within the last day. PENDING, DISABLED, NEEDS_REAUTH and BLOCKED accounts get nothing scheduled.
- A manual Visit moves `nextBrowseAt` to tomorrow when it is asked. A manual login check, messages read or requests read leaves their next time alone (a finished messages read sets `nextMessagesAt`). A task that finds the account signed out sets `nextCheckAt` to now, so "Next" can change to due without a visible reason.
- Every run is a `SpiderSession` (`task`, `status` IN_PROGRESS, SUCCEEDED or FAILED, `verdict`, `trigger` automatic, manual or retry, `startedAt`, `finishedAt`; a `dispatch` row while it waits to be published). Tasks: `linkedin-login` (older rows have `kind` VALIDATE_ACCOUNT and no task), `linkedin-browse`, `linkedin-messages`, `linkedin-invitations`. Sessions older than 30 days are deleted. Only invitations, replies and posts have a sweep for stuck runs; nothing ends a stuck session of the others.
- `linkedInAccount.list` returns `lastVisit` and `nextBrowseAt` only; the other next times are not in `metadataSelect`. It is polled every 3 seconds only while a visit runs.
- Manual calls for all four exist: `task.run` for the login check and the visit (with the "ran too soon" and "start anyway" dialogs), `unibox.refresh({ accountIds })` for the messages (answers `started` and `skipped[{ reason }]`; no override), `network.refresh({ accountIds, startAnyway })` for the requests (skipped with `budget` when the owner may go past it).
- Body: `SessionStatusBadge` and `resultOf` give the chip label and tone from the worker's verdict labels; `visitBlocker` and `loginTestBlocker` say why a run cannot start; `dayInZone` gives the account's day.

## UI and UX, exactly

### The list: the Today cell

Compact (4 or more accounts):

```
 Account                  Status               Today
 tripti@x.com  Profile    Active               (v)(v)(~)(o)  2 of 3 daily checks done
                          Checked 26/10        Messages read 1 h 50 min ago, 21 of 90 min today
 sushi@x.com   Profile    Error                (!)(-)(-)(-)  Login failed 26/10 09:12
                          Sign-in check failed.
```

The four icons are, in order, Login, Visit, Messages, Network; each is a small round chip whose tooltip gives the sentence for that item. With Detail on, or with 1 to 3 accounts, the cell shows the full chips:

```
 Today
 [v Login 09:12] [v Visit 02:40] [~ Messages 12:00, next 14:00] [o Network 19:30]
 2 of 3 daily checks done. 21 of 90 min today.
```

States of an item, from one pure function:

| State | Icon and colour | Text |
| --- | --- | --- |
| Done | check, green | `Login 09:12` (last good run today) |
| Running | spinner, grey | `Visit in process` |
| Waiting to start | clock, amber | `Visit waiting to start` (its time passed, nothing started yet) or `queued` |
| Failed | cross, red | `Login failed 09:12`; an older one reads `failed 3 days ago` |
| Pending today | clock, grey outline | `Network 19:30` (next time later today; not a warning) |
| Later | clock, muted | `Network tomorrow` or the date |
| On schedule (messages) | arrows, green | `Messages read 1 h 50 min ago` |
| Late (messages) | arrows, amber | `Messages late: read 5 h ago` |
| Counted | check, muted green | `Login counted: signed in 09:12` (signed in within 12 hours counts as the check) |
| Paused | pause, muted | `Paused by you` |
| Waiting for sign-in | minus, muted | `Waiting for the sign-in check` or `Press Test login first` for a new account |
| No answer | question, amber | `No answer after 30 min` (a run that never reported back) |

A chip is a button that opens the drawer on the checklist. Pending today and Later are never amber.

### The drawer: Today's checklist (first section, open)

```
TODAY'S CHECKLIST                     2 of 3 daily checks done. Messages on schedule.
These run by themselves within safe limits. You never need to press anything.

 v Check login      Last 26/10 09:12 [Done]                Next tomorrow 09:05          [ Run now ]
   Signs in once to check the saved login works. Posts and messages nothing.
 v Daily visit      Last 26/10 18:15 [Visited]             Next 28/10 02:55             [ Run now ]
   Opens LinkedIn once, like the daily check-in.
 ~ Check messages   Last 26/10 12:00 [Done] 1 h 50 min ago  Next today 14:00 (every 2 h)  [ Run now ]
   Reads new conversations. The first read is still going on, in batches.
 o Check my network Last: no run in the last 30 days        Next today 19:30             [ Run now ]
   Reads the connection requests you received. Accepts or ignores nothing.
```

- Row: state icon, item name, Last (date and time; the date always when not today) with the Sessions chip and a link to that session, Next with a chip ("today 14:00", "tomorrow 09:05", "waiting to start", "paused", "after the sign-in"), a helper sentence, Run now. A failed newest run shows its red chip, its date, and "Last good: 25/10 09:10" with a link.
- Run now: one click starts it, spinner and disabled while asked, then the row shows In Process and updates by itself (polled every 3 seconds while anything runs, else every minute). A refusal shows its sentence under the row: paused, needs a proxy, too soon (the existing dialog), "may not browse now" (the existing start anyway tick box).
- Check messages asks first: "Check the messages now? Nothing is sent or accepted. Checking messages marks them as read on LinkedIn, and the other person sees it. The account does this by itself every 2 hours." Buttons Not now and Check now.
- A manual messages or requests run does not change the "Next" time (the schedule goes on); the row shows the real run's state.
- State keeps the verdict line, Last verified and Pause or Resume. "Browsing today" (minutes, bar, Open activity) stays below the checklist.

### Above the list

- The banner adds today's progress: "All 3 accounts are fine. 7 of 9 daily checks done today. Next: messages 14:00." With a failed item the worst one is named with its Fix it button as today.
- Filter chips: All, Needs you, Ready, Failed (an item failed and not yet worked since), and in More: Pending today, Due now (plus the existing Full today, Near full, Idle, Not browsing, Paused). Counts and tooltips as before.
- Columns menu: Detail (full chips), Browsing today, Daily visit (off), Last verified, Added, Credentials, Working hours now.
- "Export today": a spreadsheet of the accounts shown, one row per account and item: account, client, item, last run, result, next. Cells that start with `=`, `+`, `-` or `@` are kept as text.

## Data: one new brain read

`linkedInAccount.today` (owner only, no input, additive). For each of the owner's accounts: `{ accountId, firstRead, items: [{ item, next, last, lastOk, queued }] }` for `login`, `visit`, `messages`, `network`:

- `next`: `nextCheckAt`, `nextBrowseAt`, `nextMessagesAt`, `nextInvitationsAt` (ISO or null).
- `last`: the newest `SpiderSession` of that task for the account in the last 30 days, `{ id, status, verdict, trigger, startedAt, finishedAt }`; for the login also sessions of kind VALIDATE_ACCOUNT with no task. `lastOk`: the newest SUCCEEDED one. `queued`: the newest session still has a `dispatch` row.
- `firstRead`: `messagesBackfilledAt` is null.
- Three queries for all accounts (accounts with the next times, the newest session of each task, the newest successful one), bounded by owner, account ids and the 30 day window; never one query per account. If a measure at 100 accounts is slow, the two session reads become one `DISTINCT ON` raw query.

The body derives every state with one pure function, `itemState`, written test first, and shows "No run in the last 30 days" instead of "never".

## Scope and non-goals

- In scope: brain `linkedInAccount.today` with tests; body `components/accounts/*` (today cell, chips, checklist, run-now actions, filters, banner, Columns menu, export), `use-account-actions.ts`, polling, tests of the pure parts, `MEMORY.md`.
- Out of scope: any change to when or how the tasks are scheduled or run, the browsing budget, new items beyond the four, notifications, a history of past days, the job log's skip reasons, a bulk Run now, workflows per account.

## Approach, in slices

- [x] 1. Brain: `LinkedInAccountService.today`, resolver `linkedInAccount.today`, unit tests, an integration test with two owners.
- [x] 2. Body pure logic, tests first: `itemState` (every state in the table, the account's day boundary, daily versus recurring items, an old failure, a stuck IN_PROGRESS run, never-signed-in and paused accounts), the daily-checks count, the next-item sentence for the banner, the chip and tooltip wording, the filter chips (`failed`, `pending`, `due`), the export CSV.
- [x] 3. Body: `useToday` (the query, polling), the Today cell in compact and detailed form, the Columns menu change, the filter chips, the banner sentence.
- [x] 4. Body: the checklist section of the drawer and Run now through `task.run`, `unibox.refresh` and `network.refresh` with their refusals, dialogs and the messages confirmation; remove Test login and Visit now from the State section.
- [x] 5. Export today.
- [x] 6. Verify (below), `MEMORY.md`, plan done.

## Edge cases and risks

- Day boundary: an account with no known zone falls back to the browser's; midnight in another zone is tested.
- A run that never reported back: the body calls it "No answer" after 30 minutes (the sessions page does the same); nothing ends the session in brain.
- Race between a manual run and the schedule: a manual messages or requests run does not move their next time, so the job may start another read soon after; the row always shows the real newest session, not an inference from the next time. A manual visit moves its next time to tomorrow, even if that run then fails (existing behaviour).
- Eligibility: PENDING, DISABLED, NEEDS_REAUTH and BLOCKED accounts have nothing scheduled; their rows say why instead of a time. Items other than the login also wait for a sign-in within the last day.
- Next can jump to "waiting to start" when another task found the account signed out; the chip says only what is known.
- Retention: sessions are kept 30 days, so a quiet account shows "No run in the last 30 days".
- Owner scope and cost: one owner-scoped read of three queries; a two-owner test; polling every 3 seconds only while something runs, else every minute.
- Compliance: no new automatic action and no limit changed; a manual run counts against the browsing budget as before; the messages read warns that it marks conversations read.
- Rollback: an additive brain read plus front end; revert the commit.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, all warnings fixed, for the whole monorepo; the brain integration test with Postgres.
- Tests that must exist: the two-owner scope; a paused account and a new account that never ran; a stale failure with a later success; a manual visit versus a manual messages run (only the visit moves its next time); the day boundary; a stuck IN_PROGRESS run; the query count stays three with 100 accounts; every state of `itemState`.
- Browser: all four done, one failed, one running, a paused account, a new account never checked; compact and detailed; light and dark; narrow and wide; Run now on each item. If the sign-in cannot be passed from the tool, say so.

## Outcome

Built as planned (2026-10-27). `pnpm lint`, `pnpm ts:check`, `pnpm test:unit:run` and `pnpm build` pass for the whole monorepo (main chunk 460 kB, limit 500 kB); the brain integration test for `today` (two owners, an old login row with no task, a run past 30 days, an owner with no account) passes against local Postgres.

Shipped: brain `linkedInAccount.today` (`database/accountToday.service.ts`, three queries for all accounts, additive, no migration; `LOGIN_TASK` is now exported from the validation service). Body: `today.ts` (`itemState` and the progress sentences, pure, tested), `use-today.ts` (3 second polling while a run goes on, else 1 minute; states worked out again every 30 seconds in each account's own day), the Today cell (compact icons or full chips), the checklist in the drawer with Run now on all four items (login and visit through `task.run`, messages through `unibox.refresh` behind a confirmation, network through `network.refresh` with its start-anyway dialog), the Failed, Pending today and Due now chips, the banner sentence with the day's progress or the failed check, the Columns menu (Today: show details, Browsing today and Daily visit now optional and off by default) and Export today.

Deviations and notes:

- "The account's own day" is the time zone of its working hours (the proxy's country when no office zone is set, as brain stores it); with no browsing data the browser's zone is used.
- Login counts as done today by a good run or by a sign-in in the last 12 hours ("Login counted"); the other two daily items need a good run today. Messages are never "done": On schedule, or Late after two missed intervals (4 hours). Changed on 2026-10-28 at the owner's request: progress reads "N of 4 checks done", and messages read on schedule count as done; each check has its own icon (`item-icons.ts`) beside its name and on its Run now button.
- `useAccountActions` now keeps what to do after a confirmation as a closure (`again`), so the same dialogs serve `task.run` and the network read.
- `SessionStatusBadge` exports `ToneBadge`, the chip the checklist reuses.
- Skip reasons from the job log are not used (planned).
- Not seen in a browser (the sign-in cannot be passed from the tool): the compact and detailed cells, tooltips, the drawer's checklist and the Run now flows were not looked at; messages and network manual reads were not run for real.

Follow-ups (need brain): workflows per account, counts a read found, failures in the last 7 days, a 30-day history per account, alerts outside the app, a bulk Run now, skip reasons.
