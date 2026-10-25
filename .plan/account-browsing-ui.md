# Browsing time UI: mode, today's meter and the yearly heatmap per account

- Status: locked <!-- draft | locked | in progress | done -->
- Created: 2026-10-25
- Locked by user: yes, 2026-10-25 (answers below; plan only, not built yet)

## Goal

Let the owner see, at a glance and without reading anything, how much each LinkedIn account has browsed (today and over a year) and change how much it may browse with one choice: Safe, Moderate or Aggressive. The numbers and rules behind it are in `.plan/account-browsing-budget.md`; this plan is only what the owner sees and does.

## What exists today (checked in code, 2026-10-25)

- `/accounts` (`pages/Accounts.tsx`, `components/accounts/accounts-table.tsx`) is a full width table with 7 columns (Account, Status, Credentials, Two-step code, Last verified, Daily visit, Added) and a row menu. `/accounts/:id` (`pages/AccountProfile.tsx`) is the account's own page: the profile as LinkedIn shows it, with an `AccountStrip` of status and buttons.
- `/sessions` lists every run with its result, action, account, proxy, start and duration; `?session=<id>` opens one.
- Building blocks in `apps/body`: shadcn `dialog`, `drawer`, `select`, `toggle-group`, `tooltip`, `accordion`, `alert`, `badge`, `skeleton`, `table`, a `FailureCard`, theme tokens `--success`, `--warning`, `--primary`, `--chart-*` with a dark mode, and `recharts` (not suited to a calendar grid). No chart is drawn today.
- Established patterns to keep: full width pages (`grid w-full gap-4 px-4 lg:px-6`), a `?sample=` switch on a page to look at invented data (`AccountProfile`), pure helpers with unit tests next to the component, a `blocker` string that says why a button is off, plain sentences for owners, no jargon.
- The accounts list is polled while a visit runs; `ViewPageDialog` and the "Select accounts" block both list the owner's accounts with the reason an account cannot be used (`accountChoices`).

## Who this is for and what they need

- **The owner or a GTM operator running several accounts.** They want to know "is this account safe to push today" and "are my accounts being used the way I set them". They do not want to read rules or do arithmetic.
- **What they will not read:** explanations. So: one number, one bar, one sentence; detail on hover or one click away.
- **Anxiety to calm:** "will this get my account restricted". The UI shows that the limit is protective and honest (the warning on Aggressive is plain, not scary).

## Proposal

### 0. An overview strip above the table (from the agency owner's review)

One line of four counts (and a client filter when any account has a client label), each a filter: **Full today** (at its limit or waiting for tomorrow), **Near full** (over 85 percent), **Idle** (nothing browsed on the last 3 working days) and **Not browsing** (paused, signed out, blocked). Click a count to filter the table; click again to clear. The table can be sorted by today's use, and a small note under the strip names accounts that went over their limit on 3 or more of the last 14 days. With many accounts this is the first thing read: "2 full, 1 near full, 3 idle".

### 1. Accounts table: a small "Browsing" cell that opens a drawer

The table keeps its columns. One narrow cell per account, one line plus a hairline bar, is the way in:

```
[Safe]  42 / 90 min      (thin bar under it, grows through the day)
```

- The whole cell is one button ("Browsing time for <email>") that opens the **Browsing drawer** (section 2). It turns amber at 85 percent and shows a lock when the day is full; a paused or signed-out account shows "Not browsing" with no bar (no false reassurance). Everything else (mode, hours, heatmap, mix of use, print) lives in the drawer, so the table does not get busier.
- A **client chip** (the account's client label, section 6) shows under the email when one is set.
- **Bulk:** select rows with the checkboxes (as on the profiles table); a bar appears with **Set mode** (the three cards in a small dialog, applied to all selected) and **Set working hours** (or "same hours as <account>"), with a plain count "Changing 12 accounts" and Undo.

### 2. The Browsing drawer (opens from the cell, a row of the Activity view, or the account page)

A right side drawer (full screen on a phone), the same pattern as the other detail drawers, closed with Escape or the X, with the account's email, status and client chip in its header and four blocks from top to bottom: **Today**, **Limit and hours**, **Activity**, **What used the time**, and a Print button in the footer. The same content also sits inline on the account page (`BrowsingPanel`, one component).

**Today:** the big "42 of 90 min", the bar, one sentence of when it can start next ("Next session about 11:20", "Day full, back tomorrow 09:00", "Outside working hours, opens 09:00"), and "About 12 profile views left today" (from the remaining minutes and a task's typical length, never above the 15 a day view limit).

**Limit and hours:** "How much may this account browse?" with three large option cards in a row (stacked on a narrow drawer), one selected:

| Card | Big text | One line |
| --- | --- | --- |
| Safe | 90 min a day | "Light, steady use. Best for accounts you rely on." |
| Moderate | 120 min a day | "More room for workflows and reads." |
| Aggressive | 180 min a day | "Most activity. Higher chance LinkedIn restricts the account." |

- Choosing a card saves at once (no Save button) with a toast "Moderate: 120 min a day" and Undo. Aggressive asks first: "Aggressive uses up to 3 hours a day. Accounts that browse a lot are more likely to be restricted by LinkedIn. Use Aggressive?" with the buttons Keep current and Use Aggressive.
- Under the cards, one line "Time already used today stays counted." and the **working hours always shown as one line** ("09:00 to 18:00, Mon to Fri, Asia/Kolkata", with Change), so a wrong window is noticed; Change opens the editor (progressive disclosure): time zone (searchable, preselected from the proxy's country with the sentence "From this account's proxy: Asia/Kolkata"), days (Mon to Fri toggles), start and end (30 minute steps). A live sentence under it says what it means: "Spread evenly from 09:00 to 18:00, Monday to Friday (Asia/Kolkata): about 10 minutes an hour." The save is refused, with the reason beside the field, when the window is shorter than the mode needs ("Safe needs at least 1 h 30 of working time").

### 3. Activity: the heatmap

**Component `BrowsingHeatmap`** (own SVG/CSS grid, no new library), used on the account page and on the Activity view.

- **Layout, like GitHub:** 53 week columns by 7 day rows (Monday first), month names above the first week of each month, weekday names Mon, Wed, Fri on the left, a legend "Less [5 squares] More" under it. Squares 11 px with 3 px gaps; the whole grid is horizontally scrollable on a narrow screen and opens scrolled to today.
- **Colour means share of the account's own limit**, not "busiest day": empty (no browsing), under 25, 50, 75 percent, 75 to 100 percent of the day's limit, and **over the limit** (a distinct amber with a ring so it is not only colour). So a dark square always means "this account was used to its limit that day". One hue (the app's LinkedIn blue, `--primary`) in five steps, with dark mode steps; the over-limit square is the amber `--warning`.
- **Working days stand out:** weekends and days outside the account's working days are drawn slightly smaller opacity with a diagonal hatch only when the account was used on them (so unexpected activity is visible).
- **Hover or keyboard focus tooltip:** "Tue 14 Oct: 74 min of 90 (82%), 9 sessions". Click or Enter opens a second, smaller layer over the drawer for that day listing its sessions (time, action, minutes, result) with a link to each in Sessions.
- **Header of the card:** the account email, the mode chip, "Last 12 months" with a year picker (this year, last year), and a summary line: "38 h this year · 41 active days · busiest day 96 min". A "Show as table" link under the grid gives the same days as a table for screen readers and for copying.
- **States:** loading shows a skeleton of the same size (no jump); an account that never browsed (every account, on the first day, because the history starts empty) shows an empty grid with "Nothing yet. The time this account browses will show up here, starting today."; a failed load shows the `FailureCard` with Try again; a paused account shows the grid with a note "Paused since 12 Oct".

### 4. Where it lives

- **Browsing drawer** from the accounts table cell, and the same `BrowsingPanel` inline on **`/accounts/:id`** above the profile.
- **Accounts page, a second view "Activity":** a tab next to the table (`Accounts | Activity`), with the same overview strip. **Compact:** one row per account (email, client chip, mode chip, today's meter, a 30 day strip of squares), sorted by today's use, so ten or thirty accounts stay one screen. A click on a row opens its Browsing drawer (the year heatmap is there). A search box, the strip's filters and a **Group by client** switch narrow and organise it. The tab is a query parameter (`?view=activity`) so it can be linked.
- **Print:** the drawer's **Print** button prints a clean page (account, client, mode, hours, the year heatmap, the mix of use, the date) to hand to a client; it is a print stylesheet, not a PDF export.
- **Everywhere an account is chosen** (the visit dialog, the "Select accounts" block, the daily visit button): the account's browsing state joins the reason line: "no browsing time left today" disables a click action (hard stop, as decided), and in a workflow it only adds the hint "scheduled for tomorrow".

### 5. Words (the contract with the owner)

Use "browsing time", "working hours", "today", "next session". Never "budget", "quota", "ledger", "reservation", "token". Numbers as "42 of 90 min", over an hour as "1 h 12 min". Refusals say the time it can start: "This account has used its browsing time for today. It can browse again tomorrow at 09:00."

### 6. Data the screens need (for the budget plan to provide)

- `linkedInAccount.list` and `get` gain a small `browse` object: mode, daily limit, used today, state (`OPEN`, `WAITING_FOR_SLOT`, `DAY_FULL`, `OUTSIDE_HOURS`, `NOT_BROWSING`), next start time, time zone, working hours. One grouped query for all accounts.
- `browse.overview()`: for every account, today's meter, the last 30 days (for the strip), the idle days and the over-limit days of the last 14, which feeds the overview strip and the compact rows.
- `browse.year({ accountId, year })`: `[{ day: 'YYYY-MM-DD', seconds, sessions, limitSeconds }]` for the account's own days (the server does the time zone, the browser only draws),. `browse.day({ accountId, day })` for the drawer. `browse.mix({ accountId, days: 30 })` for "What used the time".
- History starts empty on the day the feature ships (owner's choice); usage rows are kept 13 months. `linkedInAccount.list` and `get` also return the account's `clientLabel`.

### 6. Client labels

A free-text **client label** (up to 60 characters) on every LinkedIn account, new nullable `LinkedInAccount.clientLabel` (additive migration). It is set in the add and edit account forms (one optional field, "Client (optional)", with the owner's existing labels offered as suggestions, like the label field elsewhere), shown as a chip under the email in the table, the Activity rows and the drawer, and used as a filter in the overview strip and as the **Group by client** switch of the Activity view (a heading per client with its accounts and their total browsing today). Bulk **Set client** joins Set mode and Set working hours. The label is the owner's own note; it is not shown to anyone else and does not change any limit.

## Requirements

Confirmed (from your request): plan the UI for the browsing limits; a GitHub style heatmap per account for the period of a year so the owner can see how the accounts are working; the UI and UX should be top notch and very simple to use and understand.

Added from the agency owner persona review (2026-10-25): an overview strip with counts as filters, bulk set mode and hours, a compact Activity view with the year heatmap on click, working hours always visible, the split of today's use and "about N views left" on hover, and a print layout. What the review asked for and this plan does not do: grouping accounts by client (see question 9) and a per-client summary to send.

Answered by the owner on 2026-10-25:

1. **Table room.** Keep the columns; browsing details live in **their own drawer**, opened from a small cell.
2. **Heatmap look.** Colour is the share of the account's own daily limit, Monday first, in **the app's LinkedIn blue**.
3. **Activity view.** A tab on Accounts, compact rows with a 30 day strip, the year heatmap in the drawer; the same panel on the account page.
4. **Overview and bulk.** The overview strip with counts as filters, and bulk Set mode and Set working hours (Set client too).
5. **Aggressive, print, metric.** A confirmation dialog for Aggressive, a print layout, minutes on the heatmap with sessions in the tooltip.
6. **Past data.** Start the heatmap empty.
7. **Clients.** Add client labels now (section 6).

## Scope and non-goals

- In scope: the overview strip with its filters, the small table cell, the Browsing drawer and the inline `BrowsingPanel`, bulk set mode, hours and client, the mode picker with working hours, `BrowsingHeatmap`, the day layer, the mix of use and a print layout, the compact Activity view with group by client, client labels (column, form field, chip, filter), the account hint in the places that choose an account, the pure helpers and their tests, a `?sample=busy|sparse|empty|over` switch to look at the screens before the data exists, `MEMORY.md`.
- Out of scope: the limit rules and the counting (the budget plan), exporting the data (a file or PDF), per-client or team views beyond the label and the grouping, alerts or e-mails when an account is full, a list of workflow actions waiting for an account's next day, editing past days, comparing accounts side by side, a time-of-day (hour by hour) chart.

## Approach

- [x] 1. Lock this plan (answer the open questions).
- [x] 2. Pure helpers, tests first: `buildYear(days, today, weekStart)` (53 by 7 grid with blanks, month label positions), `levelOf(seconds, limit, working)` (the six levels), `formatMinutes`, the live working-hours sentence, the window check, the tooltip text.
- [x] 3. `BrowsingHeatmap` with sample data and `?sample=`: grid, legend, tooltip, keyboard (arrow keys move, Enter opens the day), table view, states (loading, empty, error, paused); checked in the browser in light and dark, at a narrow width, and with a screen reader pass.
- [x] 4. Browsing drawer and `BrowsingPanel`: Today block, mode cards with instant save and Undo, the Aggressive confirmation, the working hours line and editor with its live sentence and validation, the day layer, the mix of use, Print.
- [~] 5. (front end done on sample data; client labels in the database and form, the account hint in the pickers and row selection in the main table are left) Client labels (migration `add_account_client_label`, form field, chip), the small table cell, the overview strip and bulk actions, the compact Activity view with group by client, the inline panel on the account page; the account hint in `accountChoices` and the "Select accounts" picker.
- [x] 6. Wire to the real data once the budget plan's endpoints exist; the `?browse=` switch stays for looking at states.
- [ ] 7. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, all warnings fixed; `MEMORY.md`; plan done. A walk-through in the browser with you before it is called done.

## Edge cases and risks

- **Time zones.** The server decides which day a session belongs to in the account's zone; the browser never converts, so a viewer in another zone sees the account's days. The tooltip and the picker name the zone.
- **Over the limit.** A session may overshoot (decided), so a square can read 104 percent; it is drawn as "over", never clipped to full.
- **Empty start.** Every heatmap is empty on the first day; the empty state says it starts today so it does not look broken.
- **Many accounts.** The Activity view is one row per account with a 30 day strip, and a year grid opens on click (one small request), so thirty accounts stay usable; the overview strip and its filters carry the scanning.
- **Bulk changes.** One request changes the selected accounts in one transaction; accounts the owner does not own are ignored (owner scoped); the undo restores each account's previous mode and hours.
- **Narrow screens.** The picker's cards stack, the grid scrolls sideways, the table cell keeps its three lines.
- **Accessibility.** Not colour alone (the over-limit ring, the hatch, the numbers in the tooltip and the table view), visible focus, arrow-key movement in the grid with `role="grid"` and a label per cell, text contrast in both themes, the toast has an Undo that is reachable by keyboard; `ACCESSIBILITY.md` is followed.
- **Trust.** The picker never promises safety ("lower chance", not "safe from restriction"); the Aggressive text is the same everywhere it appears.
- **Performance.** The year query is one grouped query per account (a few hundred rows at most); the list adds one grouped query for all accounts.
- **Dev vs production, Docker, CI.** No new dependency, env var or image. Rollback: remove the column, the tab and the card; the data stays.
- **Not verifiable here.** Whether owners understand the three cards without help; the walk-through is the check.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- In the browser with `?sample=busy|sparse|empty|over`, in light and dark and at a phone width; then with the real data. State what could not be run.
- Metrics to watch after release: how many accounts leave the default mode, how many "no browsing time" refusals owners hit, and whether anyone opens the day drawer.

## Outcome

Front end built on sample data (2026-10-25), checks pass (lint, ts:check, unit tests, build). Deviations: the switch is `?browse=` (`?sample=` is taken by the account profile); bulk selection is in the Activity view, not in the main table; client labels exist only in the sample store. Not run: a browser walk-through (sign-in not available to the agent). Wired to brain the same day (2026-10-25): without `?browse=` the Accounts page, the drawer, the Activity view and the account page read `browse.overview`, `year`, `day`, `mix` and change through `browse.change` (with Undo). Left: the client field in the add and edit forms, the account hint in the pickers, row selection in the main table, and the browser walk-through.
