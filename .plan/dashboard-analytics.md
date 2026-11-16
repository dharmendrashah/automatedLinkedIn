# Dashboard: real analytics in the layout of the shadcn dashboard block

- Status: locked (building)
- Created: 2026-11-15
- Locked by user: yes, 2026-11-16 ("continue" after the review loop, with the six defaults in "Open questions" taken as answered)

## Goal

The `/dashboard` page keeps the look the owner chose ([cards and chart](dashboard-analytics-screenshots/cards-and-chart.png), [table](dashboard-analytics-screenshots/table.png), kept in this folder and committed with the plan) and shows the owner's real outreach numbers, so the first screen answers: how much is in the pipeline, are invites going out and being accepted, are my accounts healthy, and what needs me.

### Problem

`/dashboard` is the shadcn `dashboard-01` sample: four cards, an area chart and a table, all made-up numbers (`apps/body/src/components/section-cards.tsx`, `chart-area-interactive.tsx`, `data-table.tsx`, `apps/body/src/pages/dashboard-data.json`). The owner's first screen tells them nothing true.

### Success criteria

- Signed in, the page shows only real numbers of the owner's campaigns and accounts in the same cards, chart and tabbed table.
- An owner with nothing yet sees zeros, dashes and a way to start; nothing is invented; every number says what it counts.
- Ten timed loads of `dashboard.overview` on staging (its own request in the browser network tab, a hard reload on warm staging after one earlier load) have a median under 1.5 seconds and a slowest load under 3 seconds. The numbers are written in the Outcome with the count of campaigns, accounts and people they were measured on. The plan is `done` once the numbers are written, also when staging holds fewer than 10 running campaigns with an Invite workflow (the Outcome then says the result is not representative of the worst case); a miss starts the follow-ups named in "Edge cases and risks", in that order.

## Requirements

The confirmed requirements and the Design section below are both binding: Design holds the rules that make the confirmed requirements concrete (windows, statuses, sentences), and the tests in Verification check them.

Confirmed by the owner (2026-11-15):

- Keep the look of the screenshots: gradient stat cards with a badge, one area chart with a range toggle, a tabbed rounded table with a column menu and pagination.
- Four cards: Revenue pipeline, Qualified leads, Invites sent, Active accounts.
- Chart: all four series (found, qualified, invited, accepted).
- Table tabs: Campaigns, Accounts, Recent runs, Needs attention.
- Table extras: no drag handle; checkboxes stay and give bulk Pause and Resume on the Campaigns tab; "Add Section" becomes "New campaign".

Open questions (each has a proposed default; the owner answers before locking, and the list is then emptied; the tags show which Design text each answer changes):

1. Do the cards compare the last 30 complete days with the 30 before, fixed (not following the chart range)? Default: yes. (Design: Days and totals rule, Cards)
2. Does Pause from the dashboard keep queued work (`stopQueued: false`, the campaign page's default), say so ("Work already queued keeps going out") in the confirm dialog for several campaigns and in the toast for one, and leave cancelling queued work to the campaign page? Default: yes. (Design: Campaigns tab)
3. Does Needs attention also list "drafts waiting for you" and, for the admin only, "data wallet below its floor" (the wallet is one platform-wide row)? Default: yes. (Design: Needs attention tab)
4. Does the Invites card show "Accepted: N" and not a replied count (the per-day replied value double counts when summed; the campaign list does sum it on purpose, with its own comment)? Default: yes. (Design: Cards)
5. Is a failed read shown as an error card with Retry (after a failed refetch the previous data stays, with the card above it), with drafts, the admin wallet row, the wallet flag, the capacity read for statuses, run alerts, recent runs, reply change, room and waiting counts failing soft? Default: yes. (Design: the failure table and Error and loading)
6. Are a median under 1.5 seconds and a slowest load under 3 seconds the right targets for the first screen? Default: yes (a first guess with no existing baseline, to be revised after the first staging measurement). (Success criteria)

## Scope and non-goals

- In scope: the page below, `DashboardService`, the `dashboard` router, contracts types and rules, small changes to `FleetHealthService`, `PositiveReplyService`, `CampaignTrendService`, `status-badge.tsx`, `TrpcProvider.tsx` (the overview request is sent on its own, not batched with the header's calls) and the stale comment in `App.tsx`, the new body components and pure modules in the file list, tests, `MEMORY.md`, removing the sample data and the `@dnd-kit` dependencies (`apps/body/package.json` and `pnpm-lock.yaml`).
- Out of scope (non-goals): per-campaign pages, revenue by day, admin or per-client views, drag to reorder, editing from the table other than Pause and Resume, the header bell, new charts, standalone workflows with no campaign (their people and invites are not in `CampaignDay`; the page says "from campaigns"), a new index, table or migration, a server cache, dismissing a failed-run alert from the dashboard, a seeded 50-campaign fixture on staging (one integration test seeds 50 locally), refactoring `CampaignListService`.
- Sections Current state, Alternatives considered and Design are extras beyond the template spine. The spider-task checklist does not apply (no spider change).

## Current state

- `pages/Dashboard.tsx` renders `SectionCards`, `ChartAreaInteractive` and `DataTable data={dashboard-data.json}`. `data-table.tsx` (712 lines) holds one `useTable` (features `columnFilteringFeature`, `columnVisibilityFeature`, `rowPaginationFeature`, `rowSelectionFeature`, `rowSortingFeature` through `tableFeatures`, columns through `createColumnHelper<typeof features, Row>()`; `@tanstack/react-table` v9), one zod row schema, drag and drop (`@dnd-kit/*`, used only there), a row drawer `TableCellViewer`, four template tabs, a column menu, Add Section, a rows-per-page select (10 to 50) and "Page X of N". `chart-area-interactive.tsx` has two series, a `ToggleGroup` (90 days default, 7 on mobile; a `Select` on mobile) and gradient fills. `@tabler/icons-react` is also used by `people-table.tsx` and `key-facts.tsx`, so it stays. The page root is a fragment, and `section-cards.tsx`, the chart wrapper in `Dashboard.tsx` and `data-table.tsx` each carry their own `px-4 lg:px-6`; the project convention for pages is `grid w-full gap-4 px-4 lg:px-6` on the root.
- The header (`site-header.tsx`) has `PendingAlerts`, `RunAlerts` (from `WorkflowService.alerts`: FAILED, MAIN, not PREVIEW, not dismissed, finished within 7 days, plus hook alerts, at most 20, using `Date.now()`; each item is `{ runId, workflowId, workflowName, message, finishedAt: Date | null }` and a hook alert's `message` is free text), `ThemeMenu`, `TakeoverBell`; it stays.
- `CampaignDay` (key `(campaignId, day)`, relation `campaign`, no `userId`): found, qualified, invited, accepted, messaged, replied, aiCostMicros, rewritten for the last 2 days by `CampaignRollupService`. Each count is bucketed by its own event date: found and qualified by when a person was first seen, with `qualified` meaning STRONG fit at the time the day was last rewritten and a person carrying two campaign labels counted in both; invited by `invitedAt`; accepted by `acceptedAt`; only invites planned by a campaign's workflows count.
- `campaignTrend.ts`: `INCOMPLETE_DAYS = 2` (not exported), `cutoffOf(now): string` (a day key, today minus 2), `historyDays(count, endDate: Date): string[]` (day keys ending at `endDate`, oldest first), `windowDays(now)`, `sinceOf`, `trendDays` (states `counted`, `noData`, `beforeHistory`, `pending`, `notStarted`), `shareOf`; a day with no row is never shown as zero. The rollup writes a row for every campaign for each of the last two days, so a `noData` day is rare.
- `campaignList.ts` exports the pure `listRowOf({ campaign, owner, now, firstRowDay, rows })` (`rows` holds the existing six-field `CampaignCounts`: found, qualified, invited, accepted, messaged, replied); `CampaignListService.list` wraps it with its own reads, takes no injected inputs and returns neither the wallet flag nor capacity. `CampaignService.list` returns `id, name, label, pausedAt, createdAt, workflows`, newest first. `CampaignTrendService.insights` computes `capacity.waiting` (`Person` rows with the campaign `label`, `connectedAt` null, `inviteState` NONE, `doNotContact` false; GIN index on `Person.labels`; it does not check fit); it builds its 7 and 30 day periods with `historyDays(N, now)`, which end today, not at the cutoff. `LinkedInInviteService.usableCapacityOf(userId, now)` gives `{ perDay, perWeek, usableAccounts }`.
- `PositiveReplyService.pipeline` (3 reads: per campaign `replies`, `replyValueUsd`, `pipelineUsd`; `totalUsd` adds priced campaigns, null when none has a worth; `unassigned`). `DraftService.counts(userId)` (4 queries, `waiting` used). `WalletService.belowFloor()` (one platform row, shown to admins on `/usage`). `RoomTodayService.forAccounts(userId, accountIds, 'invite')` gives each account's `left` (the planner's own numbers, weekly limit and pending pause included).
- `FleetHealthService.forUser` returns `accountId, name, status (string), health (a word from `healthOf`), reasons (fixed sentences), invites{limit,used}, pending`, ordered by account `createdAt`. `healthOf` gives PAUSED for DISABLED, BLOCKED, any invite stop and pending requests at the pause level, and WARNING for PENDING, NEEDS_REAUTH, ERROR, an engagement-only stop, pending requests at the notice level, a recent sign-out, trouble acts and a drop in accepts. `windowDays(now)` is the 14 complete days of the gate (`CAMPAIGN_TREND_GATE.completeDays`). Inside the service `stoppedNow(at, until, lastVerifiedAt, now)` decides a stop (open-ended when `until` is null: it lasts until the next sign-in). Its consumers are `campaignStats.service.ts` (the campaign overview's accounts and its `needsYou` list, which uses plain `health !== 'HEALTHY'`) and the `campaign.fleet` procedure, which no body page calls.
- `WorkflowRun`: `userId`, `workflowId`, `status` (QUEUED, RUNNING, SUCCEEDED, PARTIAL, FAILED, STOPPED), `kind` (MAIN, HOOK), `trigger` (PREVIEW among them), `qualified`, `maybe`, `discarded`, `costMicros`, `startedAt`, `finishedAt`, `alertDismissedAt`, and a large `graph` Json; no `found`; indexes `[workflowId, startedAt]`, `[status]`, `[parentRunId]`, `[kind, status]`. `Workflow` has `name`, `stage`, `campaignId` and no per-owner cap.
- `PrismaService` uses the `pg` pool defaults (about 10 connections); queries beyond that queue.
- Reusable in the body: `STATE_META` and `acceptLabel` (clamps at 100%, a dash for null) in `components/campaigns/campaign-list-format.ts`, `formatPipelineUsd` in `pipeline-format.ts`, `formatUsd` and `runStatuses` (Waiting its turn, Running, Done, ...) in `components/workflows/types.ts`, `STAGE_LABELS` and `rateOf` in contracts, `components/accounts/status-badge.tsx` (a private `statuses` map: Pending, Active, Needs re-auth, Error, Paused, Blocked; only `StatusBadge` is exported), `components/table/use-hidden-columns.ts` and `columns-menu.tsx` (its button reads "Columns"), `hooks/use-mobile.ts`, `ui/skeleton`, `sonner` toasts.
- Body tests: `vitest` runs only `src/**/*.unit.test.ts` with no DOM and no tsconfig-paths, so body logic that must be tested is written as pure modules that import relatively (type-only `@/` imports are fine).
- Not present: an owner-wide daily series, a recent-runs read, an attention list, a date-ranged count of positive replies, `ACCOUNT_STATUSES` or `RUN_STATUSES` in contracts (the statuses are Prisma enums in brain; contracts has no Prisma dependency).

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| Compose the existing procedures on the client | The client link already batches calls made in one tick into one HTTP request, so the cost is not round trips: it is that there is still no owner-wide daily sum, the client would repeat the day rules of `campaignTrend.ts`, and each procedure would repeat the campaign and account reads server-side. |
| One procedure per widget | Four to six procedures that each repeat the campaign and account reads server-side (the batched link hides the round trips, not the queries), and a partial page whose numbers can disagree with each other. |
| An owner-level daily rollup table | A migration and a job to keep at most 50 campaigns x 90 rows (4,500) that one read does cheaply. |
| Sum the days in SQL (`groupBy day`) instead of in memory | The like-for-like and per-day state rules (`trendDays`) need each campaign's rows, so the rows are read anyway; the sum in memory is at most 4,500 rows. |
| A server cache (60 s) | An extra moving part (invalidation, per-owner keys) before any timing shows a problem; the third follow-up if the median misses 1.5 s. |
| One grouped `waiting` read (raw SQL over the label array) | Replaces up to 50 counts with one query, but needs raw SQL and its own tests; the fourth follow-up. |
| A `staleTime` of zero (always refetch on mount) | Navigating back to the page would repeat about 100 queries; 60 s keeps numbers current to the minute. |
| Load the Needs attention tab (the `waiting` counts and `alerts`) in a second call | Shortens the critical path of the first paint, but the Active accounts card and the tab must agree on K and the tab count badge needs the data on first paint; kept as the second follow-up if the timing misses (after looking at `alerts`, the first). |
| Compare all campaigns (or prorate young ones) in the change badges instead of the 60-day covered rule | A young campaign's first 30 days against nothing reads as huge growth, and prorating invents numbers; comparing covered campaigns only is honest and the big number still counts everyone. |
| `httpBatchStreamLink` for every call instead of a split link for the overview | It streams each call's result as it resolves, which also keeps the overview from holding back the header's calls, but it changes the transport of every procedure (server support, proxies) for one slow call; the split link is local to one operation. |
| Load each tab or the chart lazily | Saves bytes on a first paint but adds requests and loading states per tab, and the cards, chart and tabs must agree; one response keeps them consistent. |
| A stacked or normalised funnel chart | Hides the small series (found dwarfs accepted) and implies each person flows through the stages on the same day, which the per-event-date counts do not. |
| A revenue-by-day chart | Positive replies are not rolled up per day. |
| Fewer tabs (drop Recent runs and Needs attention) | Saves two tab files and two mappers but removes the only screens that show recent failures and what needs the owner, which the Goal names. |
| A `range` input on the procedure | Every toggle would refetch everything and flicker; one response carries 90 days and the chart slices it. |
| A server-side bulk pause procedure instead of sequential client calls | A new mutation that repeats `campaign.pause` rules; sequential calls reuse the tested procedures and report each failure by name (at most 50 calls, each cheap). |
| A dashboard-only account read instead of widening `FleetHealthService`'s row | Two readers of the same stop and health rules would drift; the new fields are additive and the campaign page already reads the same row. |
| Reuse the header's cached alerts and draft count on the client | The header queries and the dashboard rows would have to agree on time and failure handling; reading server-side keeps one consistent response. |
| Duplicate `CampaignListService.list` reads (one groupBy, one findMany, the running count) instead of refactoring it | The overlap is about three queries; refactoring `list` is a separate change with its own tests and is out of scope. |

## Design

The Design below has these parts: architecture; reads; failure table; days and totals rule; cards; chart; table (four tabs); contracts; types used by the rules; rule signatures; service and read signatures; body component signatures; `FleetHealthService` additions; and error and loading. A `<x>` in code marks a value the code fills in (in sentences, times and ranges).

### Proposed architecture

Data flow: the browser calls `dashboard.overview` once (`Dashboard.tsx`) -> the `dashboard` procedure -> `DashboardService.overview` -> the reads in three stages -> the pure rules of `dashboardRules.ts` -> one `DashboardOverview` -> the body shows it with `chart-series.ts` and `format.ts` (pure), the cards (`section-cards.tsx`), the chart (`chart-area-interactive.tsx`) and `components/dashboard/dashboard-table.tsx` with the four tab entries.

Details:

- `Dashboard.tsx` (page root `grid w-full gap-4 md:gap-6` in Phase 3a and, from Phase 3b, `grid w-full gap-4 px-4 md:gap-6 lg:px-6`: the repo's page convention plus the `md:gap-6` the layout gives a page's children today; the inner paddings of the cards, the chart wrapper and the table are removed in Phase 3b) owns the one `useQuery` with `staleTime` 60 s, `refetchOnWindowFocus: false`, `retry: false` and `{ trpc: { context: { skipBatch: true } } }`, and passes slices down. `TrpcProvider.tsx` gets a `splitLink` at the position of the existing terminating link (after `failedRequestLink`): an operation for which the pure predicate `isUnbatched(op)` (`apps/body/src/trpc/unbatched.ts`, true when `op.context.skipBatch === true`) holds goes through `httpLink`, the rest through the existing `httpBatchLink`. Both links build their headers with one adapter, `headersFor(ops)`, so the unbatched request carries the same auth header and the same `x-correlation-id` (the batch link's `headers({ opList })` and the single link's `headers({ op })` both call it, and `stampCorrelation` stamps the operations of either), and `failedRequestLink` still reads `op.context.correlationId`. The split only separates the overview's network time and response from the batch; the database pool stays shared (see the risk row), so it is not claimed to speed up the header's queries. The link lands in Phase 3a, with the flag.
- The procedure takes no input (nothing to validate) and is an `ownerProcedure`; it calls `DashboardService.overview(userId, isAdmin, now)` with `isAdmin = ctx.user.role === 'ADMIN'` (the rule `adminProcedure` uses).
- Everything is read-only except Pause and Resume, which reuse `campaign.pause` and `campaign.resume`.
- All dates and times are UTC, written by one function, `formatWhen(at, now)` in contracts: `HH:MM UTC` when the time is within 24 hours of `now` (past or future), else `D Mon HH:MM UTC` (English three-letter month). Brain and body both use the overview's `generatedAt` (brain's `now`, an ISO string) as `now`, so a sentence from brain and a column in the body never disagree at the 24 hour edge.
- Fixed sentences (Needs attention) are built in brain; badge, status, resting and card words are written in the body (`format.ts`).

### Reads of `DashboardService` (scoped to the owner, except `belowFloor`, the one platform row)

Stage A runs together. Stage B needs the workflow ids from read 6 and the covered campaign ids from reads 1 to 3. Stage C starts as soon as reads 1, 2, 4 and 6 have settled (it does not wait for the rest of stage A) and runs together with stage B. Every read is scoped by `userId` or by `campaign: { userId }`. The one `now` of `overview` is passed to every read that takes it (`usableCapacityOf`, `forUser`, `counts`, `forAccounts`); `WorkflowService.alerts` has no `now` and reads the clock itself.

| # | Stage | Read |
| --- | --- | --- |
| 1 | A | `CampaignService.list` (id, name, label, pausedAt, createdAt, workflows; at most 50, `CAMPAIGN_LIMITS.perOwner`) |
| 2 | A | `campaignDay.groupBy(campaignId, _min day)` where `campaign: { userId }`, no date bound (one row per campaign, so it stays small however long the history is; each campaign's first row day, for `sinceOf`) |
| 3 | A | `campaignDay.findMany` where `campaign: { userId }` from the first day of the 90-day window to the cutoff, selecting `campaignId, day, found, qualified, invited, accepted, messaged, replied` (at most 4,500 rows) |
| 4 | A | `LinkedInInviteService.usableCapacityOf` |
| 5 | A | `WalletService.belowFloor()` |
| 6 | A | the owner's workflows (`workflow.findMany({ where: { userId } })` selecting `id, name, stage, enabled, campaignId, campaign { name }`) |
| 7 | A | `FleetHealthService.forUser`, then `RoomTodayService.forAccounts(userId, ids, 'invite')` for its ids (a short chain inside stage A; the room part is soft) |
| 8 | A | `PositiveReplyService.pipeline` (also the source of each campaign's `replyValueUsd`) |
| 9 | B | `PositiveReplyService.countedBetween(userId, from, to, campaignIds)` three times (reply ranges below): the current and the previous range for `coveredIds`, and the current range for all campaigns (`campaignIds` null), where `coveredIds` are the covered campaigns of `ownerSeries` |
| 10 | A | `DraftService.counts` |
| 11 | A | `WorkflowService.alerts` (which also reads the hook alerts of `HookService.alerts`) |
| 12 | B | recent runs: `workflowRun` where `userId`, `workflowId in (read 6 ids)`, `kind = 'MAIN'`, `trigger != 'PREVIEW'`, `startedAt >= now - 30 days`, selecting `id, workflowId, status, qualified, maybe, discarded, costMicros, startedAt` (not `graph`), order `startedAt desc`, take 50; the planner may use `[workflowId, startedAt]` and sort |
| 13 | C | `CampaignTrendService.waiting(userId, label)` (the existing filter, extracted) for each campaign whose state is RUNNING (not paused, with a first row day) and that has an enabled workflow of stage INVITE (reads 1, 2, 6), in batches of 4; skipped altogether when `usableAccounts` is 0 and for a campaign whose `floor(perDay)` is 0 |

The running count for the owner (campaigns with `pausedAt` null) is taken from read 1 and, with reads 4 and 5, feeds `listRowOf` (`owner: { capacity, runningCampaigns, walletLow }`). `CampaignListService.list` is not called, because it returns neither capacity nor the wallet flag; rows are built with the exported `listRowOf`. `perDay` for the `few-waiting` rule is `shareOf(capacity, runningCampaigns, false).share.perDay`, read only for the campaigns of read 13. The status of a list row uses the 14 days of `windowDays`, while the 30-day columns and cards use `historyDays(30, end)`; both are on purpose.

Field mappings: `AccountHealth.pending` is `{ count, share }` and the overview's `pending` is its `count`; `PositiveReplyService.pipeline` returns `campaigns[]` with `id`, `replies`, `replyValueUsd` and `pipelineUsd` (the rules take them as `id`); `RoomTodayService.forAccounts` returns an array that the service turns into a `Map` by account id for `accountRowsOf`; `FleetHealthService` returns `Date`s and the rules convert them to ISO strings for the overview; `shareOf`'s denominator counts every campaign with `pausedAt` null (also NO_WORKFLOWS and NOT_STARTED ones), as the campaign list does, so the `few-waiting` threshold is the same number the list shows.

Budget at 50 campaigns and 4 accounts: about 100 queries (composed services run many: `FleetHealthService` about 14, `DraftService.counts` 4, `pipeline` 3, `RoomTodayService` a few per account, `WorkflowService.alerts` 1 plus the hook alerts' 2, one of which reads up to 200 hook runs and selects each workflow's large `graph` column), of which up to 50 are the `waiting` counts, run in batches of 4 so they never take the whole pool of 10. Stage A itself runs about 40 queries together and can saturate the pool for a moment; that is accepted and is what the ten timed loads measure. The header's own `alerts` and drafts calls repeat two of these reads (accepted). The page is read-only.

How the soft reads are built: each soft read is wrapped so that a rejection becomes a result (`Promise.allSettled` over the soft reads, a per-read catch for the `waiting` batches); stage C starts from `Promise.all` of reads 1, 2, 4 and 6 alone, so a slow soft read never delays it.

### Failure table

Decided once; the tests follow it. The core reads reject the page because the cards, the chart and the rows depend on them (campaigns, their days, the workflows, the accounts and `pipeline`). Every soft failure adds its key to `unavailable` in the overview (`status`, `wallet` for an admin only, `replies`, `drafts`, `alerts`, `runs`, `room`, `waiting`; several `waiting` failures add the key once), and the page shows one line above the tabs, built by `unavailableText(keys)` in `format.ts`: "Some figures could not be loaded: `<words>`." where the words come in the fixed order of the keys, written "campaign status", "wallet check", "reply counts", "drafts", "failed runs", "recent runs", "invite room" and "waiting counts", joined with ", ". A missing row is therefore never read as "all clear", for admins and non-admins alike.

| Read | If it fails |
| --- | --- |
| 1, 2, 3, 6, 7 (accounts), 8 | The call rejects; the page shows the error card. |
| 4 `usableCapacityOf` | `projectionKnown` is false (campaign Statuses that depend on the projection become `none`), `few-waiting` is skipped, `listRowOf` gets a zero capacity, and `status` is added. |
| 5 `belowFloor` | `walletLow` is false for `listRowOf`, `projectionKnown` is false (as above), the admin wallet row is left out, and `status` is added for everyone and `wallet` for an admin. |
| 7 (room) | The card's "Invite room today" shows a dash, R is null, and `room` is added. |
| 9 `countedBetween` | The reply badge becomes `none` and `replies` is added. |
| 10 drafts | The drafts row is left out and `drafts` is added. |
| 11 alerts | The run-failed rows are left out and `alerts` is added. |
| 12 recent runs | The Recent runs tab is empty and `runs` is added. |
| 13 a `waiting` count | That campaign's `few-waiting` row is left out and `waiting` is added once. |

### Days and totals rule

- `end` is the `Date` at UTC midnight of the day key `cutoffOf(now)`, the latest complete day (today minus 2); today and yesterday are never plotted or counted. The new code uses `cutoffOf` for the 2 (the existing `windowDays` still reads `INCOMPLETE_DAYS` itself).
- Current window: `historyDays(30, end)` (its second argument is the last day of the range; the code names it `now`). Previous window: `historyDays(30, new Date(end.getTime() - 30 * DAY_MS))`. Chart: `historyDays(90, end)`, sliced to 7, 30 or 90 on the client. No new window helper is added (`DAY_MS` is a local constant).
- For each campaign, `trendDays` (its `creationDay`, `since` from read 2, the cutoff) gives each day a state. A campaign with no rows has `since` null and adds nothing. Owner-wide daily value = the sum over campaigns of their `counted` days. A day on which no campaign is `counted` is a gap: its four values are null, `counted` is 0 and `campaigns` is the number of expected campaigns (those whose state that day is `counted` or `noData`; a campaign that has not started or has no history yet on that day is not expected). On any other day `counted` is the number of campaigns counted that day. The chart says "partial" for a day with `counted` above 0 and below `campaigns`; a gap day is not partial and `partialDays` does not count it.
- Paused campaigns stay in the totals; a deleted campaign is gone from them (its rows cascade); a test names this.
- Change badges are like for like. A campaign is covered when its `since` is on or before the first day of the previous window and none of the 60 days is `noData` (two full windows are needed for a fair comparison; owners whose campaigns are younger than 60 days see "New" or nothing, never a wrong percent; the rollup writes a row for every campaign each run, so a `noData` day is rare, and one that happens makes that campaign uncovered for 60 days, which is accepted). `ownerSeries` returns, for each series key, a total over all campaigns and a covered-only value for each window, and the covered campaign ids. It sums the counted days itself (the four fields; `totalsOf` of `campaignTrend.ts` is not used because it takes a `CampaignTrendDay[]` and returns skipped-day data the dashboard does not need), and a campaign with no counted day in the window has `null` for its per-campaign sums (shown as a dash). The badge is `changeOf` of the covered-only current and previous values with `total` the all-campaign current total; the big number is the all-campaign total. The tooltip says "compared over campaigns with 60 days of history".
- Reply ranges (`countedBetween`, `COUNTED` rows with a campaign, `createdAt >= from` and `< to`; unassigned replies are never counted, the same as the card's "N positive replies"): current `[<first day of current window>T00:00Z, end + 1 day)`, previous `[<first day of previous window>T00:00Z, <first day of current window>T00:00Z)`. The reply badge is `changeOf({ current: covered campaigns' current count, previous: covered campaigns' previous count, total: all campaigns' current count, hasCovered })` with `hasCovered` = "at least one campaign is covered", so it behaves like the other badges (percent over covered campaigns, "New" when only young campaigns have replies); the card labels it "replies counted in the last 30 days, compared over campaigns with 60 days of history".

### Cards

Current vs previous, fixed; each card's tooltip says "Campaign figures cover complete UTC days and count people found in campaigns (a person in two campaigns counts in each); qualified is the fit at the time of counting; account figures are live."

| Card | Big number | Badge | Footer line 1 | Footer line 2 |
| --- | --- | --- | --- | --- |
| Revenue pipeline (all time, per year) | `pipeline().totalUsd` through `formatPipelineUsd`; "No worth set" when no campaign has a worth; `$0` when a worth is set and there are no replies | change in replies counted in the current window vs the previous (tooltip: "replies counted in the last 30 days, compared over campaigns with 60 days of history") | "N positive replies" (all counted replies with a campaign; `unassigned` excluded) | "Worth set in X of M campaigns" (M = campaigns with at least one counted reply, X = those with a worth); with no replies "Replies x monthly worth x 12" |
| Qualified leads | qualified, current window | change | "Found F, qualified Q" over the window | "P% qualified" (`rateOf(Q, F)`, one decimal, a dash when F is 0) |
| Invites sent | invited, current window | change | "Accepted per invite sent: Z" through `acceptLabel` (accepts on their accept day divided by invites sent in the window, clamped at 100%; the tooltip says it is not a cohort rate) | "Accepted: N" (in the window) |
| Active accounts (live) | "A of T" (A = accounts with status ACTIVE, stopped or not; T = all accounts) | "All clear" when A is above 0 and K is 0, "K need attention" when K is above 0, nothing otherwise; no percent | "Invite room today: R" (a dash when the room read failed) | a sentence from `firstAttention` (below); "No account needs you" when null and A is above 0; "No account is active" when T is above 0 and A is 0; with T = 0 "No account yet" |

K is the number of accounts that have a row in Needs attention (the three account rules below), so the card and the tab always agree; both come from one pure function, `accountAttentionOf({ account, now }): { rule; severity; at: Date | null } | null` in `dashboardRules.ts`, used by `accountRowsOf` (for K and `firstAttention`) and by `attentionOf` (for the rows), and a test asserts that K equals the number of distinct account subjects in `attention`. An account is in K when it is NEEDS_REAUTH, ERROR or BLOCKED; or ACTIVE with an active stop of any kind (invites or engagement, timed or open-ended); or ACTIVE, not stopped, with a health word that is not HEALTHY. PENDING ("Pending") and DISABLED ("Paused") accounts have no row and are not in K; they only lower A. K differs from the campaign page's `needsYou` (plain `health !== 'HEALTHY'`) on purpose: that list also holds PENDING and DISABLED accounts. R = the sum of `left` from `RoomTodayService` over ACTIVE accounts whose invites are not stopped (an engagement-only stop does not block invites). R and the campaign "few waiting" rule use different numbers on purpose: R is what the accounts can still send today; the rule compares the people waiting with the campaign's daily share.

`firstAttention` is `FirstAttention | null`: the first K account (by account creation) with a High row as `needsYou` ("`<name>` needs you"), else the first K account with a timed stop as `resting` ("`<name>` is resting until `<time>`"), else the first remaining K account as `check` ("`<name>` needs a look"), else null. The body writes the sentence. The card says "needs you" for an open-ended stop where the tab row says "is resting until its next sign-in"; the two differ on purpose (the card is a short call to action, the row the exact state).

One formatter, `badgeOf(change: Change): { key: 'up' | 'down' | 'none'; text: string }` in `format.ts`, writes every badge: `+12.5%` with the up icon, `-20.0%` with the down icon (one decimal, sign always written), "New" with no icon, nothing for `none`; the card picks the icon from the key. The card texts come from `cardTextsOf(cards: DashboardOverview['cards'], now: Date): { pipeline: CardText; qualified: CardText; invites: CardText; accounts: CardText }` in `format.ts` (`CardText = { big: string; line1: string; line2: string; badge: string | null }`; `badge` is the text of the Active accounts badge ("All clear" when A is above 0 and K is 0, "K need attention" when K is above 0, else null) and null for the three cards whose badge comes from `badgeOf`; `now` is the overview's `generatedAt`, used by `firstAttentionText` for the Active accounts line), which uses `formatPipelineUsd`, `acceptLabel` (both already unit-tested imports) and `percentText(rate: number | null, digits: 0 | 1): string` (a dash for null; one decimal for the qualified share).

### Chart

- Title: "Events per day, to `<cutoff date>` UTC", where the cutoff date is the last `series` day written like `formatWhen`'s date part (`13 Nov`). It is not a funnel: each series is counted on the day of its own event, so invited can pass found on a day.
- Series: found, qualified, invited, accepted, in that draw order; the template's gradient area chart, tooltip and x-axis; four gradients on `--chart-1` to `--chart-4`; dates with `timeZone: 'UTC'`; the areas draw dots (radius 2) so an isolated counted day shows; a gap day (null) draws no area and no dot.
- Toggle as in the template: Last 3 months (90, the default), Last 30 days, Last 7 days. The template's container query picks the `ToggleGroup` or the `Select`, and `use-mobile` only picks the default (7 on mobile). The toggle only slices the response; the title names the cutoff so the labels are read as "complete days up to that date".
- Legend: a new `chart-legend.tsx` (buttons from the chart config with `aria-pressed`; a switched-off series is not rendered and the Y axis rescales; at least one stays on).
- Description: `chartDescription(input: { totals: Record<SeriesKey, number>; dayCount: 7 | 30 | 90; partialDays: number; active: ReadonlySet<SeriesKey> }): string` in `chart-series.ts`: "Found F, qualified Q, invited I, accepted A in the last N days" for the series in `active` ("the last 3 months" for 90), plus ", partial on N days" when `partialDays` is above 0; `sliceSeries` returns the slice, the four totals (null days add nothing) and the partial count.
- Empty: an owner with no counted day sees an empty plot with the Y axis 0 to 1 and the sentence "Nothing counted yet. Numbers appear about three days after a campaign starts."

### Table

`dashboard-table.tsx` owns the whole table card: the `Tabs` with their triggers and count badges (the number of rows of the tab, hidden at 0; Recent runs counts at most 50), the mobile tab `Select`, the toolbar (the `ColumnsMenu`, whose button reads "Columns", and a "New campaign" button to `/campaigns/new` in place of "Add Section"), the table of the active tab, the bulk bar, pagination and its skeleton. The shared table setup lives in `table-features.ts` (exported `features = tableFeatures({ columnVisibilityFeature, rowPaginationFeature, rowSelectionFeature, paginatedRowModel: createPaginatedRowModel() })`, as in the sample); the tab files build their columns with `createColumnHelper<typeof features, Row>()` from it, and the table is generic over the row type. The default tab is Campaigns and the choice is not remembered; the page index returns to the first page and the selection clears on a tab change; no sorting (rows keep the order given); it keeps the template's rounded border, hover row, rows-per-page select (10, 20, 30, 40, 50; default 10), "Page X of N" and "0 of N row(s) selected". The select-all checkbox in the header selects the rows of the current page only.

Each tab file exports one function that returns a `TabEntry` (declared in `dashboard-table.tsx`, not generic): `TabEntry = { key: string; label: string; count: number; hideable: Array<[id: string, label: string]>; content: (hidden: HiddenColumns) => ReactNode }`; `content` renders the generic `TabTable<Row>` (also exported from `dashboard-table.tsx`) with `{ rows: Row[]; columns: Array<ColumnDef<typeof features, Row>>; getRowId: (row: Row) => string; emptyText: string; emptyAction?: { label: string; to: string }; selectable?: boolean; renderBulk?: (selected: Row[], keepSelected: (ids: string[]) => void) => ReactNode; hidden: HiddenColumns }`; the columns are built only with `columnHelper.display` (a cell renderer reading `row.original`), never `accessor`, so their types fit `ColumnDef<typeof features, Row>` without a cast. So four different row types sit in one `TabEntry[]` without `any`. `DashboardTable({ tabs: TabEntry[] })` owns the `Tabs`, the toolbar and the one `useHiddenColumns('dashboard.hiddenColumns', {})` call (the `<page>.hiddenColumns` key convention of the other pages). `TabEntry.hideable` and the column ids use the raw ids (`status`, `invited`); `DashboardTable` prefixes them with the tab key (`campaigns.status`) for the shared hook and removes the prefix when it hands `hidden` to `TabTable`, so the table's `columnVisibility` state sees the raw ids; `ColumnsMenu` gets the active tab's `hideable` (the `menu` column is not in it). `TabTable` is unmounted with its tab, so the row selection and the page index start fresh on a tab change, and it shows the bulk bar (from `renderBulk`) only when at least one row is selected. The four tab files are `campaigns-tab.tsx` (`campaignsTab`), `accounts-tab.tsx`, `runs-tab.tsx` and `attention-tab.tsx`. The tab files do the label mapping (`status-badge.tsx`, `runStatuses`, `STATE_META`, `STAGE_LABELS`); the pure modules never import them. Rows are exactly the overview's `campaigns`, `accounts`, `runs` and `attention` entries. A whole row is clickable in the Needs attention tab (a link in the Problem cell, plus a row click and Enter key handler that navigates to the same route). Deleted: the drag handle, `TableCellViewer`, the sample chart, the zod sample schema. Each of `section-cards.tsx`, `chart-area-interactive.tsx` and `dashboard-table.tsx` exports its own skeleton. Empty texts: Campaigns "No campaign yet." with New campaign; Accounts "No account yet." with a link to `/accounts`; Recent runs "No run in the last 30 days."; Needs attention "Nothing needs you." `Dashboard.tsx` renders the unavailable line (failure table) above `DashboardTable` (above the sample table in Phase 3a).

#### Campaigns tab

Column ids: `campaign`, `state`, `status`, `qualified`, `invited`, `pipeline`, `menu`. All but `menu` are hideable (`TabEntry.hideable`). Checkboxes are on (`selectable`, built by `TabTable`); the bulk bar, the confirm dialog (`ui/alert-dialog.tsx`) and the row menu are in `campaigns-tab.tsx`.

| Column | Value |
| --- | --- |
| Campaign | name, link to `/campaigns/:id` |
| State | `STATE_META` label and icon of the list row's `state` |
| Status | `campaignStatusOf`: for NO_WORKFLOWS, NOT_STARTED and PAUSED a dash; else "Too early" while the projection is hidden as `tooEarly`; else "Needs you" when hidden for `noAccounts` or `zeroCap`; "On hold" ("Paid work is on hold", no wallet wording) when hidden for `walletLow`; else "No blocker" (the projection is shown; the plan has no target, so this means no known blocker, not "on track"; a `paused` reason cannot occur here and gives a dash); a dash instead of "No blocker" when the wallet or the capacity read is unavailable |
| Qualified (30 days), Invited (30 days) | that campaign's counted days in the current window summed (from `ownerSeries`' per-campaign sums); a dash when it has none |
| Pipeline | `formatPipelineUsd`, or "Set a worth" linking to the campaign when no worth is set |
| Row menu | Open; Pause or Resume (disabled for NO_WORKFLOWS); it calls `runBulk` with that one row, with no confirm; a successful single Pause toasts "Paused `<name>`. Work already queued keeps going out." |

Status uses the 14-day projection of the list row; Qualified and Invited use the 30 complete days of the cards, on purpose (the headers say "30 days"). Rows are newest first (as `CampaignService.list` returns them).

Bulk bar: "Pause" and "Resume". `runBulk(rows: Array<{ id: string; name: string; paused: boolean; state: CampaignListState }>, action: 'pause' | 'resume', call: (id: string) => Promise<void>): Promise<{ done: number; skipped: number; failed: string[]; failedIds: string[] }>` skips rows already in the asked state and NO_WORKFLOWS rows, calls one after another (`call` awaits `campaign.pause({ id, stopQueued: false })`, which answers `{ switchedOff }`, or `campaign.resume({ id })`, which answers `{ switchedOn }`; a resolved call is a success even when `switchedOn` is 0, because a campaign paused while all its workflows were off is resumed with nothing to switch on, as on the campaign page), and a call that throws (NOT_FOUND, CONFLICT or a network error) puts the row's name in `failed`. While a run is in flight the Pause and Resume buttons and the row menus are disabled and the bar reads "Pausing 3..." / "Resuming 3..."; the loop runs in a plain async function, so leaving the page does not abandon it half way and the toast and invalidation still fire. A confirm dialog opens for either action when more than one row is selected, with the text from `bulkConfirmText`: "Pause 3 campaigns? Work already queued keeps going out; cancel it from a campaign's page." ("Resume 3 campaigns?" for Resume). The toast comes from `bulkToast`: "Paused 3, skipped 1, failed 2: A, B" ("Resumed" for Resume), a count of 0 is left out of the text, and it is an error toast when `failed` is not empty, else a normal one. Afterwards `dashboard.overview` and `campaign.list` are invalidated and the selection keeps only the failed rows (`keepSelected(failedIds)`), so a retry is one click. This is a new `dashboard/bulk.ts`, not an extension of `components/accounts/bulk.ts` (which plans account pauses from account statuses); it follows that file's `resultText` idea of never reading a partial result as a success. A bulk Resume of 50 campaigns validates each paused workflow in turn (about six per campaign, up to 300 sequential calls): accepted, with the pending bar as the progress cue.

#### Accounts tab

Column ids: `account`, `status`, `invites`, `acceptRate`, `pending`, `menu`. All but `menu` are hideable. No checkboxes.

| Column | Value |
| --- | --- |
| Account | name and email |
| Status | for a status other than ACTIVE, the label and icon of `status-badge.tsx` (`rest` is `none` and `until` null for these); for ACTIVE: "Resting until `<time>`" (a timed stop), "Resting until the next sign-in" (an open-ended stop), else Active |
| Invites in 24 h | "used of limit" for all invites of the account |
| Accept rate (14-day cohort) | `acceptLabel` of accepted / invited over 14 days, all invites |
| Pending invites | count |
| Row menu | Open (`/accounts/:id`) |

The Invites card uses accepts on their accept day, the Accounts tab a 14-day invite cohort; both headers say so. Rows are oldest first (account creation, as `FleetHealthService` returns them).

#### Recent runs tab

Column ids: `workflow`, `stage`, `status`, `started`, `scored`, `qualified`, `campaign`, `cost`, all hideable. No checkboxes.

| Column | Value |
| --- | --- |
| Workflow | name, link to `/workflows/:id` |
| Stage | `STAGE_LABELS` of `Workflow.stage` |
| Status | `runStatuses` label of the run's status |
| Started | `formatWhen(startedAt, generatedAt)` |
| Scored, Qualified (by score) | only for a finished (SUCCEEDED or PARTIAL) run with something counted (`qualified + maybe + discarded` above 0): Scored = that sum (the people the run listed with a band plus the people it discarded) and Qualified = `qualified`; a dash otherwise; the engine writes these counts for any workflow with a scoring step, so the column is not limited to Discover |
| Campaign | name or "No campaign" |
| Cost | `formatUsd` of `costMicros` |

Rows are newest first.

#### Needs attention tab

Column ids: `severity`, `problem`, `since`; `severity` and `since` are hideable, `problem` is not. No checkboxes; the whole row is a link to `route`. Columns: Severity (a High or Medium badge), Problem (the `sentence`), Since (`formatWhen(at, generatedAt)`, or a dash when `at` is null, which is the case for a problem with no known start). Sorted by severity (High first), then rule order as in the table, then `at` newest first (null last), then id ascending. The row id is `rule:subject` (subject = account id, campaign id, run id; `wallet-low:platform`; `drafts-waiting:owner`).

| Rule | Severity | Condition | Sentence | Route | `at` |
| --- | --- | --- | --- | --- | --- |
| `account-signed-out` (also covers ERROR and BLOCKED) | High | status NEEDS_REAUTH, ERROR or BLOCKED | NEEDS_REAUTH: `<name> needs you to sign in again.` ERROR: `<name> is in error and needs a look.` BLOCKED: `LinkedIn blocked <name>.` | `/accounts/:id` | `statusUpdatedAt` |
| `account-resting` | High when open-ended and it stops invites, else Medium (a timed stop, or an engagement-only stop) | ACTIVE with an active stop (invites or engagement) | `<name> is resting until <time>.` or `<name> is resting until its next sign-in.` | `/accounts/:id` | `stopAt` |
| `account-health` | Medium | ACTIVE, no active stop, health word not HEALTHY (the reasons that can occur for an ACTIVE account: pending requests at the notice or pause level, trouble acts, fewer accepts) | `<name>: <first reason>` (the reason is a fixed sentence of `healthOf`) | `/accounts/:id` | null |
| `wallet-low` | High | admin only, `belowFloor()` | `The data wallet is below its floor, so paid work may stop.` | `/usage` | null |
| `run-failed` | High | one row per `WorkflowService.alerts` item (main or hook; the run's own message is never passed on) | `A run of <workflow> failed on <time>.`, or `A run of <workflow> failed.` when `finishedAt` is null (`<time>` is `formatWhen`) | `/workflows/:id` | `finishedAt` |
| `drafts-waiting` | Medium | waiting above 0 | `<N> draft(s) wait(s) for your approval.` (plural helper: "1 draft waits", "3 drafts wait") | `/approve` | null |
| `few-waiting` | Medium | RUNNING campaign with an enabled Invite workflow and `waiting` below `floor(share.perDay)` (no row when the floor is 0) | `<campaign> has <N> people waiting to be invited, fewer than the <M> it can invite in a day.` ("1 person") | `/campaigns/:id` | null |
| `no-worth` | Medium | at least one counted reply and no worth | `<campaign> has positive replies but no worth per reply, so it adds no money.` | `/campaigns/:id` | null |

A paused campaign has no row from any rule (the owner paused it on purpose; the Campaigns tab shows it): `few-waiting` and `no-worth` skip a campaign whose `paused` is true. The `run-failed` rows follow `alerts` exactly (7 days, undismissed, at most 20); a row stays until it is dismissed in the header or ages out, and `alerts` reads the real clock. `few-waiting` counts people without checking fit (as `capacity.waiting` does), so the sentence says "waiting to be invited". The Accounts tab shows only the status; the reason of an `account-health` row is in the Needs attention row, and the Account cell of the Accounts tab links to the account page where the reasons are listed.

### Contracts

`packages/contracts/src/dashboard.ts` (no Prisma import; the statuses are literal lists that brain's enum values satisfy, checked by a brain unit test against `Object.values` of the Prisma enums. They duplicate `HealthSignals.status` in `campaign.ts` and the body's own `AccountStatus` (derived from the router output) on purpose: brain needs a typed list and the body keeps its derived type, so body modules import neither; `CampaignListState`, `CampaignStage` and `CampaignProjectionHidden` come from `./campaign`):

```ts
import type { CampaignListState, CampaignProjectionHidden, CampaignStage } from './campaign'

export const DASHBOARD_LIMITS = { chartDays: 90, windowDays: 30, runs: 50, runDays: 30, waitingBatch: 4 } as const
export const ACCOUNT_STATUSES = ['PENDING', 'ACTIVE', 'NEEDS_REAUTH', 'ERROR', 'DISABLED', 'BLOCKED'] as const
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]
export const RUN_STATUSES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'STOPPED'] as const
export type RunStatus = (typeof RUN_STATUSES)[number]
export type Change = { kind: 'percent'; value: number } | { kind: 'new' } | { kind: 'none' }
export type AccountRest = 'none' | 'timed' | 'openEnded'
export type AttentionRule = 'account-signed-out' | 'account-resting' | 'account-health' | 'wallet-low' | 'run-failed' | 'drafts-waiting' | 'few-waiting' | 'no-worth'
export type CampaignStatus = 'none' | 'tooEarly' | 'needsYou' | 'onHold' | 'onTrack'
export type SeriesKey = 'found' | 'qualified' | 'invited' | 'accepted'
export type FirstAttention = { kind: 'needsYou' | 'resting' | 'check'; name: string; until: string | null }
export type DashboardOverview = {
  generatedAt: string
  unavailable: Array<'status' | 'wallet' | 'replies' | 'drafts' | 'alerts' | 'runs' | 'room' | 'waiting'>
  cards: {
    pipeline: { totalUsd: number | null; replies: number; replyChange: Change; campaignsWithReplies: number; withReplyAndWorth: number }
    qualified: { current: number; change: Change; found: number }
    invites: { current: number; change: Change; accepted: number; acceptRate: number | null }
    accounts: { active: number; total: number; needAttention: number; roomToday: number | null; firstAttention: FirstAttention | null }
  }
  series: Array<{ day: string; counted: number; campaigns: number } & Record<SeriesKey, number | null>>
  campaigns: Array<{ id: string; name: string; state: CampaignListState; paused: boolean; status: CampaignStatus; qualified: number | null; invited: number | null; pipelineUsd: number | null; replyValueUsd: number | null }>
  accounts: Array<{ id: string; name: string; email: string; status: AccountStatus; rest: AccountRest; until: string | null; invitesUsed: number; invitesLimit: number; acceptRate: number | null; pending: number }>
  runs: Array<{ id: string; workflowId: string; workflow: string; stage: CampaignStage; status: RunStatus; scored: number | null; qualified: number | null; campaign: string | null; costMicros: number; startedAt: string }>
  attention: Array<{ id: string; rule: AttentionRule; severity: 'high' | 'medium'; sentence: string; route: string; at: string | null }>
}
```

`changeOf(input: { current: number; previous: number; total: number; hasCovered: boolean }): Change` (`current` and `previous` are the covered-only values, `total` the all-campaign current value):

- `hasCovered` false: `new` when `total` is above 0, else `none`.
- `previous` is 0 and `current` is above 0: `new`.
- `current` and `previous` both 0: `new` when `total` is above 0 (campaigns without 60 days of history are delivering), else `none`.
- `current` equal to `previous` otherwise: `none`.
- Otherwise `value = Math.sign(current - previous) * Math.round(Math.abs(current - previous) * 1000 / previous) / 10` (half away from zero, one decimal); a rounded value of 0 returns `none` (never `-0`).

`accountRestOf(input: { stopped: boolean; openEnded: boolean }): AccountRest` (`openEnded` wins; `stopped` false gives `none`).

`formatWhen(at: Date | string, now: Date): string`: `HH:MM UTC` when `at` is within 24 hours of `now` (past or future; exactly 24 hours counts as within), else `D Mon HH:MM UTC` (day without a leading zero, English three-letter month, UTC); both brain and body call it. `plural(count: number, one: string, many: string): string` returns `"<count> <one>"` for 1 and `"<count> <many>"` otherwise.

### Types used by the rules

All in `database/dashboardRules.ts` unless noted; every field is read from the sources named above.

| Type | Fields |
| --- | --- |
| `Totals` | `Record<SeriesKey, number>` |
| `SeriesWindows` | `{ total: { current: Totals; previous: Totals }; covered: { current: Totals; previous: Totals }; coveredIds: string[] }` (`hasCovered` is `coveredIds.length > 0`) |
| `CampaignCounts` | the existing contracts type (six fields: found, qualified, invited, accepted, messaged, replied); the rules read the first four |
| `AccountHealth` | `FleetHealthService`'s account row with the new fields below |
| `CampaignListRow` | the existing contracts type returned by `listRowOf` (`campaign.ts`) |
| `CampaignAttentionInput` | `{ id; name; paused: boolean; running: boolean; hasInviteWorkflow: boolean; waiting: number \| null; perDay: number; replies: number; replyValueUsd: number \| null }` (`perDay` and `waiting` matter only when `running` and `hasInviteWorkflow`) |
| `RunAlert` | `{ runId; workflowId; workflowName; finishedAt: Date \| null }` (the `message` is dropped by the mapper) |
| `RunInput` | a `WorkflowRun` row's `id, workflowId, status, qualified, maybe, discarded, costMicros, startedAt` |
| `WorkflowInput` | `{ id; name; stage; enabled: boolean; campaignId: string \| null; campaignName: string \| null }` |
| `AccountAttention` | `{ rule: AttentionRule; severity: 'high' \| 'medium'; at: Date \| null }` (the result of `accountAttentionOf`) |

### Rule signatures (pure: one input object in, data out, no I/O)

| Function | Signature |
| --- | --- |
| `changeOf` (contracts) | above |
| `accountRestOf` (contracts) | above |
| `ownerSeries` | `(input: { campaigns: Array<{ id; createdAt: Date }>; firstDays: Map<string, string \| null>; rows: Map<string, Map<string, CampaignCounts>>; now: Date }) => { series: DashboardOverview['series']; windows: SeriesWindows; perCampaign: Map<string, { qualified: number \| null; invited: number \| null }> }` (`hasCovered` for `changeOf` is `windows.coveredIds.length > 0`) |
| `campaignStatusOf` | `(input: { state: CampaignListState; hiddenReason: CampaignProjectionHidden \| null; projectionKnown: boolean }) => CampaignStatus` (`hiddenReason` is `row.projection?.reason` when the projection is hidden, else null; `projectionKnown` is false when the wallet read or the capacity read failed, and then every status that depends on the projection (`needsYou`, `onHold`, `onTrack`, which means "No blocker") becomes `none`; `tooEarly` stays) |
| `accountAttentionOf` | `(input: { account: AccountHealth; now: Date }) => AccountAttention \| null` (the one classifier behind K, `firstAttention` and the three account rules) |
| `accountRowsOf` | `(input: { accounts: AccountHealth[]; room: Map<string, number> \| null; now: Date }) => { rows: DashboardOverview['accounts']; card: DashboardOverview['cards']['accounts'] }` (`rest` is `none` and `until` null for a non-ACTIVE account; `room` null gives `roomToday` null) |
| `cardsOf` | `(input: { windows: SeriesWindows; pipeline: { totalUsd: number \| null; campaigns: Array<{ id: string; replies: number; replyValueUsd: number \| null }> }; replyCounts: { covered: { current: number; previous: number }; totalCurrent: number } \| null; accountCard: DashboardOverview['cards']['accounts'] }) => DashboardOverview['cards']` (owns `acceptRate = rateOf(accepted, invited)`, `campaignsWithReplies`, `withReplyAndWorth`, `replies` and the reply `changeOf`; `replyCounts` null gives `none`) |
| `campaignRowsOf` | `(input: { listRows: CampaignListRow[]; perCampaign: Map<string, { qualified: number \| null; invited: number \| null }>; pipeline: Array<{ id: string; replyValueUsd: number \| null; pipelineUsd: number \| null }>; projectionKnown: boolean }) => DashboardOverview['campaigns']` (calls `campaignStatusOf`; keeps the order of `listRows`; a campaign missing from `pipeline` has null money) |
| `runRowsOf` | `(input: { runs: RunInput[]; workflows: Map<string, WorkflowInput> }) => DashboardOverview['runs']` (a run whose workflow is missing from the map is skipped; a workflow without a campaign shows "No campaign") |
| `attentionOf` | `(input: { accounts: AccountHealth[]; campaigns: CampaignAttentionInput[]; alerts: RunAlert[]; draftsWaiting: number; walletLow: boolean; isAdmin: boolean; now: Date }) => DashboardOverview['attention']` (sorted; `at` is an ISO string or null) |

### Service and read signatures (do I/O)

| Function | Signature |
| --- | --- |
| `DashboardService.overview` | `(userId: string, isAdmin: boolean, now = new Date()) => Promise<DashboardOverview>` |
| `PositiveReplyService.countedBetween` | `(userId: string, from: Date, to: Date, campaignIds: string[] \| null) => Promise<number>` (`COUNTED` rows with `campaignId` in the list, or with `campaignId: { not: null }` when the list is null, so unassigned replies are never counted; an empty list gives 0 without a query) |
| `CampaignTrendService.waiting` | `(userId: string, label: string) => Promise<number>` (the extracted filter; `insights` calls it) |

### Body component signatures

| Component or module | Props or exports |
| --- | --- |
| `SectionCards` (`section-cards.tsx`) | `({ cards, generatedAt }: { cards: DashboardOverview['cards']; generatedAt: string })`; also exports `SectionCardsSkeleton` |
| `ChartAreaInteractive` (`chart-area-interactive.tsx`) | `({ series }: { series: DashboardOverview['series'] })`; also exports `ChartSkeleton` |
| `ChartLegend` (`chart-legend.tsx`) | `({ keys, active, onToggle }: { keys: SeriesKey[]; active: ReadonlySet<SeriesKey>; onToggle: (key: SeriesKey) => void })` |
| `DashboardError` (`dashboard-error.tsx`) | `({ onRetry }: { onRetry: () => void })` (the text is fixed: "The dashboard could not be loaded."; no server message is shown) |
| `DashboardTable` and `TabTable` (`dashboard-table.tsx`) | `DashboardTable({ tabs }: { tabs: TabEntry[] })`; `TabTable<Row>` props as under Table; also exports `TabEntry` and `DashboardTableSkeleton` |
| tab files | `campaignsTab({ rows, generatedAt, onChanged }): TabEntry`, `accountsTab({ rows, generatedAt }): TabEntry`, `runsTab({ rows, generatedAt }): TabEntry`, `attentionTab({ rows, generatedAt }): TabEntry` (`rows` are the overview's entries; `onChanged` invalidates `dashboard.overview` and `campaign.list` after a bulk run) |
| `bulk.ts` | `runBulk` (above), `bulkConfirmText(action: 'pause' \| 'resume', count: number): string \| null` (null for one row), `bulkToast(action: 'pause' \| 'resume', result: { done: number; skipped: number; failed: string[] }): { kind: 'success' \| 'error'; text: string }` |
| `unbatched.ts` (`apps/body/src/trpc/`) | `isUnbatched(op: { context: Record<string, unknown> }): boolean` (true when `context.skipBatch === true`) |
| `table-features.ts` | `features` (the `tableFeatures(...)` value, as in the sample) |
| `status-badge.tsx` | exports the existing map as `accountStatuses` (type `Record<AccountStatus, { label; icon; className }>`, where `AccountStatus` is the body's own type from `./types`, not the contracts one) |

### `FleetHealthService` additions

`forUser` adds to its account row: `email` (already selected), `createdAt` (a new field in the existing select), `statusUpdatedAt`, `invitedLast14` and `acceptedLast14` (numbers, from the 14-day groupBys the service already runs, no new query; these are rolling windows that include today, so the Accounts tab's "14-day cohort" is live, not complete UTC days), `invitesStopped`, `engageStopped` and `stopOpenEnded` (booleans; `stopOpenEnded` means a stop is active and has no `until`), `stopUntil` (`Date | null`: the latest `until` among the active stops; null when open-ended or none), `stopAt` (`Date | null`: the latest stop time among the active stops), and `status` typed as `AccountStatus` (Prisma's enum type is assignable to it). "Stopped" in the rules means `invitesStopped || engageStopped`. The fields are additive: `campaign.overview` and `campaign.fleet` (which return the row) only gain them, for the owner's own data.

### Error and loading

`components/dashboard/dashboard-error.tsx` is a card with the message and a Retry button calling `refetch` (`FailureCard` has none); `retry: false` makes it appear at once. On first load it replaces the cards, the chart and the table (also while the sample table is still in place in Phase 3a); after a failed refetch the previous data stays with the card above it. Loading uses `ui/skeleton` shaped like the cards, chart and table.

## Approach

Each phase leaves the repository buildable and tested.

- [ ] **Phase 1, contracts.** `dashboard.ts` (types, `DASHBOARD_LIMITS`, statuses, `changeOf`, `accountRestOf`, `formatWhen`, `plural`), its unit test, the `index.ts` export; then `pnpm --filter @automatedLinkedIn/contracts build:lib` (brain imports contracts from `dist`; repeat after any contracts edit).
- [ ] **Phase 2a, brain reads.** Extract `CampaignTrendService.waiting` (with a case in `campaignTrend.integration.test.ts`); extend `FleetHealthService` as above (reusing `stoppedNow`; its `status` type narrows to `AccountStatus`, so run the body `ts:check` too) with `fleetHealth.service.unit.test.ts`; add `PositiveReplyService.countedBetween` with its integration test.
- [ ] **Phase 2b, brain rules and service.** `dashboardRules.ts` and its unit test (including the enum check of `ACCOUNT_STATUSES` and `RUN_STATUSES` against the Prisma enums `LinkedInAccountStatus` and `WorkflowRunStatus`); `DashboardService` with unit and integration tests; the `dashboard` resolver with `dashboard.unit.test.ts`, `resolvers/index.ts`, `router.ts` and the `database/index.ts` export. The body still uses the sample data.
- [ ] **Phase 3a, body cards, chart, states.** `Dashboard.tsx` owns the one `useQuery` (with the unbatched context) and passes slices; the unavailable line sits above the still-present sample table; `trpc/unbatched.ts` with `isUnbatched` and its unit test (`unbatched.unit.test.ts`) and the `TrpcProvider.tsx` split link; the headers of both links come from one adapter, `headersFor(ops: ReadonlyArray<{ context: Record<string, unknown> }>)`, that calls the existing `authHeadersOf` and `stampCorrelation` (the batch link passes `opList`, the single link `[op]`), so no new header logic needs its own test beyond the adapter's call shape; cards, chart (`chart-series.ts`, `chart-legend.tsx`), `format.ts` with their unit tests, `dashboard-error.tsx`, skeletons. Inner paddings stay as they are in this phase. At the end of this phase the page shows real cards and chart and still the sample table (`DataTable` with the JSON), which is the intended stable state.
- [ ] **Phase 3b, body tabs and cleanup.** `table-features.ts`, `dashboard-table.tsx`, the four tab files (each returns a `TabEntry`), `bulk.ts` and its unit test, selection, confirm dialog; export the map of `status-badge.tsx` as `accountStatuses` (still typed by its existing `AccountStatus` from `./types`); the page root gets `px-4 lg:px-6` and the inner paddings of the cards, the chart wrapper and the table come out; delete `data-table.tsx` and `dashboard-data.json`; change the `App.tsx` comment to "The dashboard carries the overview cards, the chart and the tabbed table."; `pnpm --filter @automatedLinkedIn/body remove @dnd-kit/core @dnd-kit/modifiers @dnd-kit/sortable @dnd-kit/utilities`, which updates the lockfile.
- [ ] **Phase 4, close.** The root gate and the integration suite; in `MEMORY.md` rewrite the entry about the sample dashboard data and `@tabler/icons-react` (near the top-level gotchas, about line 323), the entry that mentions the `data-table.tsx` drawer API, add the new decisions and one changelog line; after the owner deploys to staging, the ten timed loads and the Outcome.

### File list

| Path | Action |
| --- | --- |
| `packages/contracts/src/dashboard.ts` | Create |
| `packages/contracts/src/dashboard.unit.test.ts` | Create |
| `packages/contracts/src/index.ts` | Modify |
| `apps/brain/src/database/dashboard.service.ts` | Create |
| `apps/brain/src/database/dashboard.service.unit.test.ts` | Create |
| `apps/brain/src/database/dashboard.service.integration.test.ts` | Create |
| `apps/brain/src/database/dashboardRules.ts` | Create |
| `apps/brain/src/database/dashboardRules.unit.test.ts` | Create |
| `apps/brain/src/database/index.ts` | Modify |
| `apps/brain/src/database/fleetHealth.service.ts` | Modify |
| `apps/brain/src/database/fleetHealth.service.unit.test.ts` | Create |
| `apps/brain/src/database/positiveReply.service.ts` | Modify |
| `apps/brain/src/database/positiveReply.service.integration.test.ts` | Modify |
| `apps/brain/src/database/campaignTrend.service.ts` | Modify |
| `apps/brain/src/database/campaignTrend.integration.test.ts` | Modify |
| `apps/brain/src/trpc/api/resolvers/dashboard/dashboard.ts` | Create |
| `apps/brain/src/trpc/api/resolvers/dashboard/dashboard.unit.test.ts` | Create |
| `apps/brain/src/trpc/api/resolvers/index.ts` | Modify |
| `apps/brain/src/trpc/api/router.ts` | Modify |
| `apps/body/src/pages/Dashboard.tsx` | Modify |
| `apps/body/src/components/section-cards.tsx` | Modify |
| `apps/body/src/components/chart-area-interactive.tsx` | Modify |
| `apps/body/src/components/accounts/status-badge.tsx` | Modify (export the map as `accountStatuses`) |
| `apps/body/src/trpc/TrpcProvider.tsx` | Modify (a split link and one shared header builder) |
| `apps/body/src/trpc/unbatched.ts` | Create |
| `apps/body/src/trpc/unbatched.unit.test.ts` | Create |
| `apps/body/src/App.tsx` | Modify (a stale comment about the data table) |
| `apps/body/src/components/dashboard/dashboard-table.tsx` | Create |
| `apps/body/src/components/dashboard/table-features.ts` | Create |
| `apps/body/src/components/dashboard/campaigns-tab.tsx` | Create |
| `apps/body/src/components/dashboard/accounts-tab.tsx` | Create |
| `apps/body/src/components/dashboard/runs-tab.tsx` | Create |
| `apps/body/src/components/dashboard/attention-tab.tsx` | Create |
| `apps/body/src/components/dashboard/dashboard-error.tsx` | Create |
| `apps/body/src/components/dashboard/chart-legend.tsx` | Create |
| `apps/body/src/components/dashboard/chart-series.ts` | Create |
| `apps/body/src/components/dashboard/chart-series.unit.test.ts` | Create |
| `apps/body/src/components/dashboard/bulk.ts` | Create |
| `apps/body/src/components/dashboard/bulk.unit.test.ts` | Create |
| `apps/body/src/components/dashboard/format.ts` | Create |
| `apps/body/src/components/dashboard/format.unit.test.ts` | Create |
| `apps/body/src/components/data-table.tsx` | Delete |
| `apps/body/src/pages/dashboard-data.json` | Delete |
| `apps/body/package.json` | Modify |
| `pnpm-lock.yaml` | Modify |
| `.plan/dashboard-analytics-screenshots/*.png` | Add (already in the working tree, not yet committed) |
| `MEMORY.md`, `.plan/dashboard-analytics.md` | Modify |

`campaignStats.service.integration.test.ts` never reads the account row's new fields, so it is not changed (the run of the suite proves the additive change). `format.ts` holds `badgeOf`, `cardTextsOf`, `percentText`, `unavailableText(keys): string`, `campaignStatusText(status: CampaignStatus): string`, `restingText(rest: AccountRest, until: string | null, now: Date): string` and `firstAttentionText(first: FirstAttention, now: Date): string`, plus a `plural(count, one, many)` helper used for "1 draft waits" and "1 person waiting" in the Needs attention sentences (which brain builds with the same helper from contracts, so it lives in `dashboard.ts` and `format.ts` re-uses it); it imports contracts, `formatWhen`, `pipeline-format.ts` and `campaign-list-format.ts` (both already imported by unit tests). There is no `rows.ts`: rows come from brain already shaped, and the tab files do the label mapping (`status-badge.tsx` map, `runStatuses`, `STATE_META`, `STAGE_LABELS`), which a unit-tested module cannot import because of the `@/` alias in `status-badge.tsx`. `chart-series.ts` exports `sliceSeries(series, dayCount: 7 | 30 | 90): { days: DashboardOverview['series']; totals: Record<SeriesKey, number>; partialDays: number }`, `chartDescription(input: { totals: Record<SeriesKey, number>; dayCount: 7 | 30 | 90; partialDays: number; active: ReadonlySet<SeriesKey> }): string` and `toggleSeries(active: ReadonlySet<SeriesKey>, key: SeriesKey): Set<SeriesKey>` (the last series cannot be switched off), where `sliceSeries(series, dayCount)` takes the same count. The pure body modules (`format.ts`, `chart-series.ts`, `bulk.ts`) import relatively.

## Edge cases and risks

| Group | Risk | Mitigation |
| --- | --- | --- |
| Invalid or empty input | The procedure takes no input; an empty owner (no campaign, no account) | Nothing to validate; zeros, dashes, empty-tab sentences and buttons; no division by zero; no badge; chart sentence; "No account yet" on the card. |
| Failures and retries | A read fails; a soft failure could read as "all clear" | The failure table in Design: core reads reject to the error card with Retry; previous data stays after a failed refetch; the soft reads leave their row out, are listed in `unavailable` and shown as one line above the tabs; an unknown wallet never shows "On track". |
| Data lag | `CampaignDay` lags live counts | Today and yesterday are excluded; tooltips say campaign figures are complete UTC days and account figures are live. |
| Young campaigns | A campaign without 60 days of history | Left out of the badge comparison, not out of the totals; with none covered the badge is "New" or nothing. |
| Partial days | One campaign has no rollup row on a day | The partial sum is shown; `counted` below `campaigns` makes the chart description say "partial". |
| Deleted campaigns | Rows cascade | Totals shrink; named in the integration test. |
| Concurrency and idempotency | A campaign is paused elsewhere between read and click; changes made elsewhere; the row's `paused` flag can be up to 60 s stale | `runBulk` filters on the row's `paused` flag; `campaign.pause` on a campaign paused elsewhere in that window only moves its `pausedAt` (harmless) and `resume` tolerates a state it already has; the page rereads after a bulk run; other changes show after the 60 second stale time or a reload (accepted). |
| Bulk actions | A failure in the middle of a selection; `campaign.pause` disables workflows one by one and records `pausedAt` and `pausedWorkflowIds` only afterwards, so a failure mid-loop leaves some workflows off and unrecorded, and a retry cannot record them (a later Resume cannot restore them); queued work keeps going out after a default pause; a bulk Resume validates every paused workflow in turn (up to 300 calls for 50 campaigns) | Calls run one after another; failed names are in an error toast and the failed rows stay selected; buttons are disabled and the bar shows progress while the loop runs; the confirm dialog and the single-row toast say queued work keeps going out; the unrecorded-workflow case is an existing property of `campaign.pause`, accepted here, with the follow-up (its own plan) of writing `pausedWorkflowIds` before disabling; cancelling queued work stays on the campaign page (question 2). |
| Scale limits | 50 campaigns (owner cap), about 4 accounts, 4,500 `campaignDay` rows, 50 runs, up to 50 `waiting` counts, a pool of about 10 connections, workflows per owner unbounded, run volume per owner not measured, `HookService.alerts` reading up to 200 hook runs with each workflow's `graph` column | `waiting` runs in batches of 4 for RUNNING campaigns with an enabled Invite workflow and is skipped when the floor is 0; the runs read is filtered by `userId` and by the owner's workflow ids; one integration test seeds 50 campaigns and 4 accounts locally and logs the elapsed time (it fails only above a generous 10 s, which would mean a hang); the median and the slowest of ten loads on staging are the check, and they cover the run volume and the hook alerts read. If staging misses (1.5 s median, 3 s slowest) the follow-ups (each its own plan), in order: look at `WorkflowService.alerts` and `HookService.alerts` (the `graph` column), then fetch Needs attention in a second call (it holds the `waiting` counts and `alerts`), then a 60 second server cache, then one grouped `waiting` read. |
| Shared connection pool | One dashboard load runs about 40 queries together in stage A against a pool of about 10 shared with every other request and the header's own `alerts` and drafts reads (the overview is sent unbatched, which only separates its response from the header's batch; header queries can still queue behind it in the pool) | Accepted for an internal tool with few concurrent owners; the concurrent-owner ceiling is not sized; if more owners use it, the follow-up is a cap on stage A concurrency. |
| Recent runs read | `workflowId in (all the owner's workflows)` with `startedAt desc`, take 50, can need a merge or sort over many runs; run volume per owner is unmeasured | It is a soft read (the tab is empty and `runs` is named when it fails); the 50-campaign integration case also seeds about 3,000 runs and logs the time; the staging timing includes it; a new index is a non-goal. |
| Run alerts | A failed-run row stays until dismissed in the header or 7 days; at most 20; `alerts` reads the real clock; with a 60 s `staleTime` and no refocus refetch, a dismissal in the header or a re-auth done elsewhere shows on the dashboard after a reload or the next mount | Accepted; the integration test uses runs finished just now. |
| Reply badge | `createdAt` is the time of counting, so a backfill or a move out of "no campaign" shows as new; a re-count keeps its first date; a reply removed later leaves the window it was counted in, so "previous" shrinks over time and flatters growth; the badge covers only campaigns with 60 days of history, beside an all-time dollar figure | The tooltip says "replies counted in the last 30 days, compared over campaigns with 60 days of history"; the removal case (a REMOVED reply is not counted) is in the integration test; backfill and a move out of "no campaign" shift `createdAt` and are accepted and not tested here; the removal bias is accepted. |
| Qualified undercount | `CampaignDay.qualified` is the fit at the time the day was last rewritten (the last 2 days), and the card windows end two days before today, so a later upgrade of an older person never reaches it | The card tooltip says qualified counts the fit at the time of counting; the Network page can show more; accepted. |
| Waiting without fit | `few-waiting` counts people, not good fits | The sentence says "waiting to be invited"; accepted. |
| Security and secrets | Another owner's data; the shared wallet; free text from runs; no secret is read or written | `ownerProcedure`; every read is scoped to the user id (`userId` or `campaign: { userId }`); the response holds the owner's own names, email, ids, counts and fixed sentences (a run's message is never passed on); the wallet row only for `role === 'ADMIN'`; "On hold" never names the wallet; integration tests with a second user and a non-admin. |
| Existing data and migrations | None | No schema, data or migration change. |
| Time | Local time vs UTC | Everything labelled UTC. |
| Docker, CI and deploy | Body and brain deploy separately; integration tests do not run in CI; dev vs production: the local database and staging differ in data size, and staging is the only place the timing and the look can be checked | No env, Docker or CI change; a body deployed before brain shows the error card for a short window (accepted); owner scoping is guarded by the local integration run; the owner deploys and measures on staging. |
| Rollback | Anything wrong | Revert the commits; no schema or data change. |
| Look | The pixel match | Not verifiable here (no signed-in browser); the owner compares with the screenshots on staging. |

## Verification

Tests, as assertions (body tests are pure-module unit tests; there is no DOM setup). The phase that must pass them is in brackets.

- **Contracts [1]:** `changeOf`: `hasCovered` false with total 5 gives new; `hasCovered` false with total 0 gives none; previous 0 and current 5 gives new; 0 and 0 with total 5 gives new; 0 and 0 with total 0 gives none; 120 vs 100 gives `+20.0`; 80 vs 100 gives `-20.0`; 8 vs 3 gives `+166.7`; 1 vs 8 gives `-87.5`; 201 vs 200 gives `+0.5`; 100 vs 100 gives none; 100001 vs 100000 gives none (rounds to 0). `accountRestOf` for the four combinations. `formatWhen` (within 24 hours in the past and in the future, exactly 24 hours inside, beyond 24 hours, month name, a string input). `plural` for 0, 1 and 2.
- **Brain unit, `dashboardRules` [2b]:** `ownerSeries` with a gap day (`counted` 0, not partial, not in `partialDays`), a partial day (`counted` above 0 and below `campaigns`), a campaign created yesterday (older days are not partial), a campaign with no rows, a young campaign (not covered), a campaign with a `noData` day (uncovered), total vs covered values, covered ids, per-campaign sums with null for a campaign with no counted day, and a campaign absent from the input; `campaignStatusOf` for each state and each hidden reason, and the projection-dependent statuses becoming `none` when `projectionKnown` is false (`tooEarly` stays); `accountAttentionOf` for each account case and `accountRowsOf` (A counts ACTIVE accounts; PENDING and DISABLED not in K; a timed stop, an open-ended stop, an engagement-only stop and a non-HEALTHY word each in K; R sums only ACTIVE accounts with invites not stopped, an engagement-only stop still counts, `room` null gives `roomToday` null; `rest` none for a non-ACTIVE account; `firstAttention` each kind in order); an invariant that K equals the number of distinct account subjects in `attentionOf`'s rows for the same accounts; `cardsOf` (the reply badge with `replyCounts` null, with only young campaigns having replies, and with covered counts; `acceptRate` null when nothing was invited; `withReplyAndWorth` and `campaignsWithReplies` with an unpriced campaign; `totalUsd` null shows no worth); `campaignRowsOf` (order of `listRows`, a campaign missing from `pipeline`, a null `qualified`); `attentionOf` each rule on and off, the three signed-out sentences, the admin-only wallet row, `few-waiting` with floor 0 and with a null count, a disabled Invite workflow giving no row, no row for a paused campaign, an alert with a null `finishedAt`, `at` null for the rules that have no start, the sort (severity, rule order, `at` with null last, id) and the `rule:subject` ids; `runRowsOf` dash for a run with nothing scored, a run whose workflow is missing skipped, a workflow without a campaign; `ACCOUNT_STATUSES` and `RUN_STATUSES` equal `Object.values` of the Prisma enums `LinkedInAccountStatus` and `WorkflowRunStatus` (imported at runtime from `generated/prisma/enums`).
- **Brain unit, `DashboardService` (mocked reads) [2b]:** the stages run in the stated order (stage C starts once reads 1, 2, 4 and 6 have settled; read 9 needs the covered ids); each soft read in the failure table leaves its row out and is named in `unavailable` (`status` for a failed `belowFloor` or a failed `usableCapacityOf`, for admins and non-admins alike, plus `wallet` for an admin; `waiting` once), and each core read rejects; the stage order is asserted with deferred promises (reads 1, 2, 4 and 6 resolved while a slow soft read is still pending, and the `waiting` reads must already have been called); `belowFloor` feeds both `listRowOf` and the admin row; a non-admin never gets `wallet-low`; `waiting` is called only for RUNNING campaigns with an enabled Invite workflow, in batches of 4, and not at all when `usableAccounts` is 0 or the floor is 0; `countedBetween` is called three times (covered current and previous, all current); `now` is passed to the reads that take it. 
- **Brain unit, `FleetHealthService` [2a]:** the new fields with `stoppedNow` cases (invites stop only, engagement stop only, both, open-ended, timed, expired); `PrismaService` and `AccountRoomService.forAccounts` are mocked.
- **Brain integration [2a, 2b]:** `now` fixed at 2026-11-15T12:00Z (so `end` is 2026-11-13). Campaign A created 100 days earlier with a row for every day from 99 days ago to `end` (found 2, qualified 1, invited 1, accepted 0 per day); campaign B created 10 days earlier with a row for each of its last 9 days up to `end` (found 1, the rest 0); an ACTIVE account with an open-ended stop, a NEEDS_REAUTH account, 2 drafts, a failed MAIN run, a PREVIEW run and a HOOK run; positive replies (campaign A: 3 `COUNTED` replies created 5 days before `end` and 1 created 45 days before `end`, one of the current ones created by a `COUNTED` to `REMOVED` to `COUNTED` toggle, one more reply that stays `REMOVED` in the current window (so it is not counted), and a worth per reply set; campaign B: 1 `COUNTED` reply created 5 days before `end` and no worth; one `COUNTED` reply with no campaign). The runs are rows of real `Workflow` rows (the rules skip a run whose workflow is missing); the open-ended stop has `invitesStoppedAt` set, `invitesStopUntil` null and `lastVerifiedAt` null (`stoppedNow` is false otherwise); the HOOK run is FAILED with a `workflowDelivery` row (`hostNodeId` and `phase` set), so `HookService.alerts` gives a `run-failed` row. Neither campaign has an Invite workflow, so there is no `few-waiting` row. Expected: `cards.qualified.current` 30 with change none (A is covered and equal in both windows), `found` 69 (A 60, B 9), `invites.current` 30; `cards.pipeline.replies` 5 (A 4, B 1; the unassigned one excluded), `replyChange` `+200.0` (covered A: 3 now against 1 before), `campaignsWithReplies` 2, `withReplyAndWorth` 1, `totalUsd` equal to the pipeline service's value for A; attention ids `account-resting:<id>` (High), `account-signed-out:<id>`, `drafts-waiting:owner`, `no-worth:<B id>`, `run-failed:<MAIN run id>` and `run-failed:<HOOK run id>`, and none for the PREVIEW run; the Recent runs rows hold the MAIN run only (no PREVIEW, no HOOK); a deleted campaign leaves the totals; a second user sees none of it; a non-admin has no `wallet-low` and an admin with the wallet row below its floor has one; `countedBetween` boundaries on `[from, to)`, for an empty id list and for a null list; `waiting` through `CampaignTrendService`; the existing `campaignStats` overview still passes. A separate case seeds 50 campaigns, 4 accounts and about 3,000 runs and logs the elapsed time (it fails only above 10 s).
- **Resolver [2b]:** through the router caller with a mocked `DashboardService`, `isAdmin` follows `ctx.user.role` and the returned overview is passed through unchanged (the anonymous refusal is already covered for every procedure by `router.unit.test.ts`).
- **Body [3a, 3b]:** `format` (`badgeOf`, `percentText`, `cardTextsOf` for an empty owner and a full one including the accounts `badge`, `unavailableText`, status, resting and first-attention texts with and without a date); `chart-series` (slice 7, 30 and 90 with the totals and the partial count, `chartDescription` with a series switched off and for 90 days; the last series cannot be switched off); `bulk` (skips paused and NO_WORKFLOWS rows, one failure in three, a call that returns false counted as failed, call order, failed ids, the confirm text, the toast text with several failed names and with zero counts left out, the toast kind); `unbatched` (`isUnbatched` true for `skipBatch: true`, false for no flag and for other values). The empty owner is also covered by the brain rules tests (empty input gives empty rows and zero cards).
- Root gate after every phase: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` (after Phase 1 the contracts `build:lib` runs first); after phase 2 and at the end also `pnpm test:integration:run`.
- Not run here: the page in a browser. The owner deploys, opens `/dashboard` on staging and checks: the layout matches the screenshots (same cards, chart and tab layout, no sample name or number left); one campaign's "Invited (30 days)" equals its daily bars on the campaign page summed over the same 30 complete days (the dashboard stops two days before today); ten timed loads in the browser network tab (median and slowest). A timing on fewer than 10 RUNNING campaigns with an Invite workflow is written as "not representative of the 50-campaign worst case" together with the data size, and the owner may add campaigns by hand on staging to measure more.

## Outcome

Not started.
