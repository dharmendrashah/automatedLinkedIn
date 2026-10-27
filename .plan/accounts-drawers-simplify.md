# LinkedIn accounts: one simple list, details in drawers; the account page shows the profile

- Status: done
- Created: 2026-10-27
- Locked by user: yes, 2026-10-27 (every decision above and the four proposed additions, as written)

## Goal

Make `/accounts` answer one question in one second: "does anything need me, and which account can take work?" One list, no tabs, one place for each critical action. Detail opens in a side drawer (one account) and a bottom drawer (activity of one account or one client). `/accounts/:id` shows the LinkedIn profile again; the browsing block moves to the drawers and the Analytics card is removed. No feature, number or action is deleted: what leaves the list or the page moves to a drawer, a menu or a switch.

Reviewed twice by the Agency Owner, GTM Engineer, Founder, Platform Admin and Sales Rep persona agents (first on the idea, then on this plan, with scores below).

## Requirements

Confirmed by the owner (2026-10-27):

- No tabs on `/accounts`; side drawers and a bottom drawer carry the detail.
- Nothing existing is removed: every column, action, number and view stays reachable (moved into a drawer, a menu or behind a switch). The one named exception: the Analytics card of the account page is removed.
- "Group by client" is off by default, with a switch.
- The limit names stay Safe, Moderate and Aggressive, each with its plain sentence. Test login, Visit now and Show code keep their names, with a one-line helper.
- The client roll-up (the old Activity tab) is built now, in the bottom drawer.
- Delete keeps the simple confirm dialog (no typing the email).
- "Show code" moves into the side drawer and hides itself after 30 seconds.
- `/accounts/:id` shows only profile detail, as it used to: the browsing block leaves its body, the Analytics card is removed for good. The strip keeps Test login, Visit now and Read profile; the two suggestion cards stay.

Proposed from the persona reviews, confirmed by the owner on 2026-10-27 ("lock it"): the summary banner, tools that appear only from 4 accounts, a Columns menu, Pause in the bulk bar and per client with a confirm.

Open questions (must be empty before locking): none. Answered yes, as proposed:

1. Summary banner and a "Ready" chip: one sentence at the top ("All 2 accounts are fine. Next check: tomorrow 02:55." or "2 of 12 accounts need you.") with a Fix button, and a Ready chip (signed in and able to start a session now). Proposed: yes.
2. Progressive disclosure: with 1 to 3 accounts the search, client select, group switch, chips and checkboxes are hidden (the list is short enough to read); from 4 accounts they all show. The threshold is one constant. Proposed: yes.
3. A Columns menu on the list so the old columns stay reachable: Last verified, Added, Credentials, Working hours now. Default columns are Account, Status, Browsing today, Daily visit. The choice is kept in this browser. Proposed: yes.
4. Pause and Resume in the bulk bar and a "Pause all" on a client's group header, each with a confirm that names the accounts and an Undo (Resume) toast; accounts that could not change are listed. Pause on one account (row menu or drawer) also asks first; Resume does not. Proposed: yes (this reverses the earlier "no bulk pause").

## Persona ranking of the plan (scores 1 to 10, average of the reviews that scored it)

| Rank | Feature | Score | Verdict | Why |
| --- | --- | --- | --- | --- |
| 1 | Status with a reason line | 9.2 | keep, add "what to do" and a Fix button | All five need it; the Sales Rep wants what it means for leads |
| 2 | Worst-first sort and Needs you chip | 8.8 | keep | The daily worklist for every reviewer |
| 3 | Side drawer: State and actions | 8.0 | keep, with helper text and the sentence "Nothing is posted or sent from here" | Where the Founder and Agency act |
| 4 | Danger zone, simple confirm | 7.5 | keep, confirm names what is lost | Delete apart from everything else |
| 5 | Browsing today column | 7.5 | keep, add minutes left | The capacity the GTM Engineer plans against |
| 6 | Row opens the drawer | 7.2 | change: a real button and a Profile link, not a whole-row-only target | Keyboard, screen readers, accidental opens |
| 7 | Side drawer: Daily limit | 7.0 | keep, open by default | Used per client |
| 8 | Account page: profile only | 6.8 | keep | Same data, less noise |
| 9 | Bulk bar | 6.8 | change: add Pause and Resume, hide under 4 accounts | Agency 9, Founder 2 |
| 10 | Empty state and helper sentences | 6.7 | keep | Calms the Founder; shown in the drawer, tooltips on the list |
| 11 | Chips (Full today, Near full, Idle, Not browsing) | 6.0 | change: All, Needs you, Ready, then a More menu; hidden under 4 accounts | Six chips were noisy |
| 12 | Search and client select | 6.0 | keep, hidden under 4 accounts | Agency searches by client |
| 13 | Sign-in details and Show code | 6.0 | change: collapsed, countdown, Keep showing, Copy, hides on tab hide | 30 seconds was too short for a phone call |
| 14 | Address state | 6.0 | keep | Shareable views; validate `open` against the owner's accounts |
| 15 | Group by client | 5.8 | keep, switch remembered in this browser | Agency would turn it on at once |
| 16 | Bottom drawer: client roll-up | 5.8 | keep, add CSV export | "What did Client X use" for invoices |
| 17 | Working hours (drawer) | 5.7 | keep, collapsed with a one-line summary | Rarely changed |
| 18 | Account settings button | 5.5 | keep | One drawer, one set of handlers |
| 19 | Bottom drawer: one account | 5.0 | keep, lazy-loaded, header names the account with a "Back to settings" button | A debugging view |
| 20 | Row menu | 5.0 | keep, 3 items | A duplicate of the drawer |
| 21 | Client field (drawer) | 4.5 | keep, collapsed | Founder has no clients |

Ranked additions from the reviews (what was missing), by how many reviewers asked and how much it helps:

| Rank | Addition | Asked by | Needs | Priority |
| --- | --- | --- | --- | --- |
| 1 | Summary banner with a Fix button | Founder, Admin, Sales | front end | P0 |
| 2 | Missing states: overview read fails, data loading or missing, action refused inline, account removed elsewhere, reveal fails | Admin | front end | P0 |
| 3 | Pause asks first; Pause in the bulk bar and per client | Agency, Sales | front end | P0 |
| 4 | Tools appear from 4 accounts; drawer sections collapsed with one-line summaries | Founder, Sales, GTM | front end | P0 |
| 5 | "Ready" verdict and chip, minutes left, hours status on the row (from `status` and `BrowseState`) | GTM, Agency | front end | P1 |
| 6 | Columns menu keeps old columns reachable | GTM, Agency | front end | P1 |
| 7 | Show code: countdown, Keep showing, Copy, hide on tab hide, key held in a ref | Agency, Founder, Admin | front end | P1 |
| 8 | Client roll-up CSV (formula-safe) | Agency | front end | P1 |
| 9 | Workflows and runs per account ("used by 3 workflows, last run 2 h ago") | GTM, Sales | brain endpoint | follow-up |
| 10 | Data cost per client this month | Agency | brain (owner usage) | follow-up |
| 11 | A client note (billing contact, reason paused) | Agency | brain field | follow-up |
| 12 | Change history, who changed what and when; audit of reveals | Agency, Admin, Sales | brain | follow-up |
| 13 | Alerts outside the app (email, badge) when an account needs you | Founder | brain | follow-up |
| 14 | Read-only role for reps | Sales | brain | follow-up |
| 15 | Failures in the last 7 days and the time of the last sign-in problem | GTM, Admin | brain | follow-up |
| 16 | Server-issued code so the key never reaches the browser | Admin | brain | follow-up |

## What exists today (checked in code, 2026-10-27)

- `/accounts` (`pages/Accounts.tsx`, `components/accounts/accounts-table.tsx`): a 9-column table, four filter counters (`browsing/overview-strip.tsx`), tabs Accounts and Activity (`browsing/activity-view.tsx` with group by client, select, `bulk-browse-bar.tsx` for limit, hours and client), a right drawer `browsing-drawer.tsx` around `browsing-panel.tsx` (today, daily limit, hours, client, heatmap, day sessions, Print).
- `/accounts/:id` (`pages/AccountProfile.tsx`): back link, account strip (Test login, Visit now, Read profile), `BrowsingPanel` card above the profile, the profile sections, a right rail with `AnalyticsCard` and two suggestion cards.
- Browsing rows already carry what "Ready" needs: `BrowseState` (OPEN, WAITING_FOR_SLOT, DAY_FULL, OUTSIDE_HOURS, NOT_BROWSING), `usedSeconds` and `mode` (minutes left), `nextAt`, `viewsLeft`, `hours`; `stateText` has the sentences; `bucketOf` gives the four counters. Account `status` and `statusMessage` come from `linkedInAccount.list`; `ineligibleReason` has a sentence per status.
- The handlers and dialogs (run a task, pause, delete, reveal, "ran too soon", "start anyway") are written twice, once per page.
- `components/ui/drawer` (vaul) supports bottom and nested drawers; `floating-drawer.ts` styles only the right one.

## UI and UX, exactly

Names stay (Test login, Visit now, Show code, Safe, Moderate, Aggressive, Full today, Near full, Idle, Not browsing). Pages stay full width (`grid w-full gap-4 px-4 lg:px-6`).

### 1. The list, `/accounts`

With 12 accounts:

```
LinkedIn accounts                                              [ + Add account ]
The LinkedIn logins this tool can act as.

+----------------------------------------------------------------------------+
| 2 of 12 accounts need you. Sign-in failed on sushi@x.com.   [ Fix it ]     |
+----------------------------------------------------------------------------+

[ Search accounts... ] [ All clients v ] Group by client [off]   [ Columns v ]
( All 12 ) ( Needs you 2 ) ( Ready 7 ) ( More v )     More: Full today, Near full,
                                                       Idle, Not browsing, Paused

 [ ] Account                  Status                     Browsing today       Daily visit
 [ ] sushi@x.com [internal]   Error                      Safe  =-------  6/90  Visited 24/10 23:06
     Profile                  Sign-in check failed.      min, 84 left         Next 28/10 05:05    ...
                              Visits are on hold. [Fix]
 [ ] tripti@x.com [internal]  Ready                      Safe  ===----  21/90 Visited 26/10 18:15
     Profile                  Checked 26/10              min, 69 left         Next 28/10 02:55    ...
```

With 1 to 3 accounts (no toolbar, no checkboxes):

```
LinkedIn accounts                                              [ + Add account ]
+----------------------------------------------------------------------------+
| All 2 accounts are fine. Nothing is posted or sent from here.              |
| Next check: tomorrow 02:55.                                                |
+----------------------------------------------------------------------------+
 Account                      Status          Browsing today        Daily visit
 tripti@x.com  Profile        Ready           Safe  ===---- 21/90   Visited 26/10 18:15 ...
```

- Header: title, one sentence, Add account (top right, never in a menu).
- Banner, always on: if any account needs you, the sentence names how many and the worst one, with a Fix button that opens that account's drawer at its State section. If none, "All n accounts are fine." plus the next check. A new account that was never checked says "Next step: press Test login on <email>" with the button.
- Toolbar (from 4 accounts): search (email or client), client select (hidden with no client), the Group by client switch (remembered in this browser), a Columns menu. Chips: All, Needs you, Ready, then a More menu holding Full today, Near full, Idle, Not browsing and Paused; each with a count and a tooltip with its exact rule. One chip is active at a time and is in the address. The four old counters keep their rules (`bucketOf`).
- Verdict of a row, from one pure function: Needs you (status not Active and not Paused), Paused, Full today, Outside hours, Waiting for a slot, Ready. The status cell shows the badge, one line of why in words with what it means ("Sign-in check failed. Visits are on hold."), a Fix button when it needs you (opens the drawer at State), and "Checked 26/10".
- Rows are sorted worst first (Needs you, Full, Near full, Outside hours, then the rest), then by email.
- Row columns (default): account (email as a real button that opens the drawer, a small Profile link, the client badge), status, browsing today (mode name, bar, "21 of 90 min, 69 left"), daily visit (Visited, Next, "by you" or "daily"), a row menu. Optional through Columns: Last verified, Added, Credentials (chips), Working hours now ("Inside hours" or "Opens 09:00"). Whole-row click also opens the drawer (a convenience for the mouse; the button is the accessible one).
- Row menu (three items): Open details, View profile, Pause or Resume. Pause opens a confirm: "Pause tripti@x.com? Daily visits and any planned posts stop until you resume." Resume has none. Test login, Visit now, Delete, Edit, Show code and every secret live only in the drawer.
- Group by client on: a header per client: "internal, 2 accounts, 27 of 180 min today, 1 needs you", a Select all checkbox, an Activity button (bottom drawer for the client), and Pause all (confirm naming the accounts, Undo toast). No client goes last under "No client"; groups that need attention come first.
- Selecting rows (from 4 accounts) shows a bar fixed at the bottom: "2 accounts selected. [Set daily limit] [Set hours] [Set client] [Pause] [Resume] [Clear]". Each says how many accounts and what changes, keeps the Undo toast, and ends with a result line: "2 changed, 1 skipped: <email> (<reason>)". No bulk delete and no bulk reveal.
- Empty (no account): one card, an icon, "No LinkedIn account yet", "Add the LinkedIn login this tool acts as. It browses a little each day, like you would. Nothing is posted or sent unless you set it up.", and Add account. No toolbar, no banner. No match for the filters: "No account matches. Clear the filters."
- The needs-proxy notice and the "Follow it in Sessions" line stay above the banner as today.

### 2. The side drawer (one account)

A floating right panel, `?open=<id>`, about 32rem, full width on narrow screens. One scroll with a sticky header. Sections are accordions with a one-line summary when closed; State, Browsing today and Daily limit are open, the rest closed (with 4 or more accounts and `Working hours` or `Client` already set, they stay closed too: the summary is enough).

```
+--------------------------------------------------+
| tripti@x.com  [internal]  (Active)          [ X ]|
| Added 18/10/2026   [ View profile ]              |
+--------------------------------------------------+
| STATE                                            |
|  Ready. A session can start now.                 |
|  Nothing is posted or sent from here.            |
|  Last verified 26/10/2026                        |
|  Daily visit: Visited 26/10 18:15, daily         |
|               Next 28/10/2026 02:55              |
|  [ Test login ]  Checks the saved sign-in works. |
|                  Posts and messages nothing.     |
|  [ Visit now  ]  Opens LinkedIn once, like the   |
|                  daily check-in.                 |
|  [ Pause account ]                               |
+--------------------------------------------------+
| BROWSING TODAY                                   |
|  21 of 90 min, 69 left   ======--------          |
|  About 15 profile views fit in what is left.     |
|  [ Open activity ]                               |
+--------------------------------------------------+
| DAILY LIMIT                                      |
|  (o) Safe 90 min a day  Light, steady use.       |
|  ( ) Moderate 120 ...   ( ) Aggressive 180 ...   |
+--------------------------------------------------+
| > WORKING HOURS   Mon to Sun, 01:00 to 23:00     |
| > CLIENT          internal                       |
| > SIGN-IN DETAILS Password, Two-step key         |
| > DANGER ZONE                                    |
+--------------------------------------------------+
```

Opened sections:

- Working hours: day buttons, from and to, zone, the live sentence, Save hours (a limit that does not fit is refused with the existing sentence).
- Client: the input.
- Sign-in details: chips, "Security code [Show code]" then "482 913, hides in 27 s [Keep showing] [Copy] [Hide]"; "Show saved details" and Edit.
- Danger zone (red border): "Delete this account. Its history and saved sign-in are removed." and Delete account, which opens the simple confirm dialog (it names what goes).

Behaviour:

- Test login and Visit now: one click starts it (they keep "ran too soon" and "start anyway"); a spinner and disabled while asked for; the line "Started. Follow it in Sessions" with a link; a refusal shows its sentence inline under the button, not only a toast.
- Daily limit and client save at once with the Undo toast; Aggressive keeps its warning.
- Show code: the key is read once through the existing reveal and held in a ref, not in the query cache. The code and its countdown show for 30 seconds; Keep showing adds 30 seconds (up to 2 minutes); Copy copies the six digits; it hides on Hide, on timeout, when the tab is hidden, when the drawer closes and when the account changes, and then says "Hidden for safety". A failed reveal says "Could not show the details" and leaves nothing in memory.
- Closing (X, Escape, click outside, Back) with Working hours changed and unsaved asks "Leave without saving?".
- The account removed elsewhere: the drawer closes with "This account was removed." and the address is cleaned.

### 3. The bottom drawer (activity)

About 70 percent of the screen height, over the side drawer when both are open; the header names the account and has a "Back to settings" button. Address: `?open=<id>&panel=activity` for an account, `?client=<label>&panel=activity` for a client. Loaded on demand.

One account:

```
Browsing activity: tripti@x.com   [ Back to settings ]   [ Print ]   [ X ]
[ Last 12 months v ]   1 h 2 min, 3 active days, busiest day 39 min
        Nov  Dec  Jan ... Oct
 Mon    . . . . . . ... . .       (heatmap, five steps, amber over the limit)
Pick a day: 26/10: 21 min in 2 sessions
   18:15  Daily visit   14 min   done
   02:40  Profile read   7 min   done
What it spent time on:  (the existing mix list)
```

One client:

```
Activity: internal (2 accounts, 27 of 180 min today)   [ Export CSV ] [ Print ] [ X ]
 Account        Browsing today       Last 30 days
 tripti@x.com   Safe 21 of 90 min    |.|.||.|  ... (30 small bars)      [ Open ]
 sushi@x.com    Safe  6 of 90 min    ...                                [ Open ]
```

Open switches to that account's view. Export CSV downloads the table (account, mode, minutes today, minutes in each of the last 30 days; cells that start with `=`, `+`, `-` or `@` get a leading quote, as the posts export does).

### 4. The account page, `/accounts/:id`

```
< LinkedIn accounts
[ profile header: photo, name, headline, location ]
 Account strip: email, status, last verified, read 3 hours ago
   [ Test login ] [ Visit now ] [ Read profile ] [ Account settings ]
[ Open to work ] [ About ] [ Contact ] [ Services ] [ Activity ] [ Experience ]
[ Education ] [ Projects ] [ Skills ] [ Recommendations ] [ Languages ] [ Interests ]
 right rail: People you may know, You might like
```

- Removed from the page: the browsing card (it lives in the side and bottom drawers) and the Analytics card (removed for good; the numbers stay in the stored profile). Everything else is as it was.
- New: Account settings opens the same side drawer (`?open=<id>`), so one component and one set of handlers serve both pages.

### 5. Address, history, focus and accessibility

- Address keeps `q`, `client`, `status` (chip), `group=client`, `open`, `panel`. Unknown values are ignored; `open` must be one of the owner's accounts, else "Account not found" with the same words as a missing one. A refresh restores the list, the drawers and the filters.
- Opening a drawer adds one history entry; Back closes the top drawer first; X closes the same way, or replaces the address when the page was opened with the drawer already in it.
- Focus: the drawer takes the focus, Escape closes the top layer first (confirm dialog, then bottom drawer, then side drawer), and the focus returns to the button or row that opened it.
- A real button inside each row, `aria-live` for "Started" and "Hidden for safety", an accessible name and a text summary for the heatmap and the 30-day bars, tooltips are never the only place a rule is written.
- Light and dark; on narrow screens the side drawer is the full width and the bottom drawer the full height.

### 6. States that must exist

- Overview read fails: the list still shows (from the accounts query) and a line says "Could not load browsing data. Retry."
- Browsing data loading: skeleton in the browsing cells; missing for an account: "No browsing data yet", never a zero.
- An action refused (Test login, Visit now, Save hours, bulk): the reason shows inline where the action is.
- Account deleted or changed elsewhere: see the drawer behaviour above; the list refreshes.
- Reveal fails or is rejected: see Show code.

## Scope and non-goals

- In scope: `pages/Accounts.tsx`, `pages/AccountProfile.tsx`, `components/accounts/*`, `components/browsing/*`, `components/account-profile/*` (strip, rail), tests for the pure parts, `MEMORY.md`. Brain is not changed: every number and action already exists. The bulk Pause and Resume loop over the existing `setPaused` call.
- Out of scope (follow-ups, all need brain): workflows and runs per account, data cost per client, a client note, change history and an audit of reveals, alerts outside the app, a read-only role, failure counts and the time of the last sign-in problem, a server-issued two-step code. Also out: proxy columns, the browsing budget rules, bulk delete, bulk reveal, the posting and network pages, virtualising the list (measure with 100 accounts first).

## Approach, in slices (each slice is checked and left working)

- [x] 0. Read what each existing component takes (`AccountsTable`, `VisitCell`, `BrowsingCell`, `BrowsingPanel`, `ActivityView`, `BulkBrowseBar`, `AccountStrip`, `TotpCode`, `RevealDialog`, `EditAccountDialog`) and list what is reused as it is. No feature is deleted; a component is deleted only when nothing uses it and its function lives elsewhere (the tabs, the four-card strip, the inline browsing card).
- [x] 1. Pure logic with tests first (`accounts/verdict.ts`, `accounts/toolbar.ts`, `accounts/address.ts`): the row verdict and its sentence, worst-first order, the chips and counts, search and client filter, grouping and group totals, the address parser (unknown values ignored), the 4 account threshold, the CSV of the roll-up, the code countdown (30 seconds, Keep showing up to 2 minutes, hide on tab hide).
- [x] 2. List: banner, toolbar, chips, Columns menu, rows, row menu with the Pause confirm, empty and missing states. (P0 and the list part of P1.)
- [x] 3. `useAccountActions` (run a task, pause, delete, reveal, the two dialogs) and the shared `AccountDrawer`: sections, accordions, Show code, Danger zone, the unsaved hours guard, the removed-elsewhere state.
- [x] 4. Selection and the bulk bar (reuse `BulkBrowseBar` and `useBrowseChange`, add Pause and Resume with the result line), Group by client and its header actions.
- [x] 5. Bottom drawer for one account and for one client (reuse `BrowsingHeatmap`, `useBrowseYear`, `useBrowseDay`, `useBrowseMix` and the old `Strip`), CSV and Print, lazy-loaded; a bottom style in `floating-drawer.ts` only if both drawers need it.
- [x] 6. Account page: remove the browsing card and the Analytics card (delete `AnalyticsCard` if nothing else uses it), add Account settings and the shared drawer.
- [x] 7. Verify (below), `MEMORY.md`, plan done.

## Edge cases and risks

- Few accounts: with 1 to 3 the tools are hidden; the banner and the list are the whole page. Many: one overview query, no per-row requests; group totals and filters are memoised and the search is debounced; measure at 100 accounts before any virtualising.
- Owner scope: `open`, `client` and every drawer read go through calls that are already owner-scoped; a foreign id is "Account not found", the same words as a missing one. A test with two owners covers the lists the drawers read (check whether one exists; add it if not).
- Secrets: the key lives in a ref and is cleared on hide, close, tab hide, account change and unmount; never in the address, history or query cache. Two drawers and a dialog stacked need one layer order (Radix with vaul): test that Escape closes the top one first.
- Unsaved Working hours on close: ask. Limit and client already save with Undo.
- Double clicks and conflicts: Test login, Visit now, Pause and bulk actions are disabled while asked for; "ran too soon" and "start anyway" stay.
- Bulk: the bar says how many accounts and what changes, and the result line lists skipped accounts and why; a partial failure never looks like success.
- Pause: it stops visits and planned posts of that login; the confirm says so. Undo is Resume.
- Main chunk is near the 500 kB limit: the bottom drawer is loaded on demand; check the build output.
- Layout changes without removals: Print and the heatmap go to the bottom drawer, the browsing card to the side drawer, the four counters to chips (Ready, Needs you and a More menu), the old columns to the Columns menu; the Analytics card is the one removal. Say so in the Outcome.
- Sample mode (`?browse=`, `?sample=`) keeps working on both pages.
- Rollback: front end only; revert the commit.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, all warnings fixed, for the whole monorepo.
- Tests that must exist: the sort, chips and counts; the verdict sentences; the address parser; the 30 second hide including hide on close and tab hide; the bulk result line and skipped list; the CSV; the Escape order across stacked layers (if a component test is not possible here, a pure layer-stack helper is tested).
- Walk-through in a browser: no account, one account, three, twelve; narrow and wide; light and dark; keyboard only; refresh with a drawer open; Back; `?browse=` samples. If the sign-in cannot be passed from the tool, say so and list what was not seen.

## Outcome

Built as planned (2026-10-27). `pnpm lint`, `pnpm ts:check`, `pnpm test:unit:run` and `pnpm build` pass for the whole monorepo; the main chunk is 446 kB (limit 500 kB). Brain and spider are unchanged.

Shipped: the list with the summary banner, chips (All, Needs you, Ready, More), search, client select, Group by client (remembered in this browser), Columns menu and the bulk bar with Pause and Resume (`pages/Accounts.tsx`, `components/accounts/*`); the side drawer with accordions and the Show code auto-hide; the bottom drawer for one account and for one client (CSV and Print); the account page without the browsing card and the Analytics card, with an Account settings button; one `useAccountActions` hook and one `AccountsDrawers` host for both pages. Pure parts with tests: `verdict`, `toolbar`, `address`, `columns`, `bulk`, `auto-hide`, `roll-up-csv`.

Deviations:

- The client roll-up address is `?activity=<client>` (the plan's `?client=` is the list's client filter); an account's activity is `?open=<id>&panel=activity`.
- The unsaved-hours question appears when the drawer is closed with X, Escape or a click outside; the browser's Back and a refresh cannot be intercepted and drop the edit.
- Nothing is cached for the key: it is held in component state of the Show code box only and the reveal mutation is reset at once (the plan said a ref).
- The Escape order across stacked layers rests on Radix's layer stack; no test covers it (no component tests in body).
- Removed code: the tabs, the four-card strip (the old counts are chips, the over-limit sentence stays as a note), the old table, `BrowsingPanel`, `BrowsingDrawer`, `ActivityView`, `BrowsingCell`, `VisitCell`, `TotpCode`, `clientGroups`, `sortByUse` and `AnalyticsCard`. Test login and Visit now left the rows for the drawer (the profile strip keeps them).
- The checkbox for Group by client stands in for a switch (no switch component exists).

Not done: a walk-through in a browser (the sign-in cannot be passed from the tool), so layout, the stacked drawers (vaul over vaul), focus return and the Back button were not seen. Follow-ups needing brain are listed under Scope.
