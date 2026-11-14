# Campaigns list and campaign detail: icons, numbers and projections

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-13
- Locked by user: yes, 2026-11-14

## Goal

The Campaigns list is a bare table (Name, Workflows, State, Made) with no numbers and no icons, so the owner cannot tell at a glance what a campaign does or what it should deliver. Add icons to the list and the detail header, show each campaign's real numbers on its row, and show a projected invite range for the next 30 days with the basis it rests on, on the list and on the detail page.

## Requirements

Confirmed by the owner (2026-11-14):

- Projection horizon: next 30 days only.
- Projection placement: on the list and on the detail page.
- Row numbers: Qualified, Invited, Accept %, Replies (last 14 complete days).
- State display: icon plus word.
- Zero-workflow campaigns (for example "find new leads"): show "No workflows yet" and hide the numbers and the projection. Add a button that goes to the workflow create page (`/workflows/new`).
- Gate: the same 14 complete day and 20 invite gate (`CAMPAIGN_TREND_GATE`) applies to the list projection.
- Lock: yes.

Facts found in the code:

- `CampaignService.list` (`apps/brain/src/database/campaign.service.ts:13`) returns only `id, name, label, pausedAt, createdAt, workflows`. It has no numbers.
- The daily rollup `CampaignDay` (`apps/brain/prisma/schema.prisma:442`) holds found, qualified, invited, accepted, messaged and replied per day. `messaged` and `replied` count the people whose last touch fell on that day (`apps/brain/src/database/campaignCounts.ts`), so one person can count on several days.
- The detail page already computes the projection in `CampaignTrendService.insights` (`apps/brain/src/database/campaignTrend.service.ts:38`) with the pure rules in `apps/brain/src/database/campaignTrend.ts` (`gateOf`, `paceOf`, `shareOf`, `projectionOf`, `trendDays`, `sinceOf`). The list reuses those functions and does not write a second rule.
- The owner-wide inputs (usable capacity, number of running campaigns, wallet floor) do not depend on the campaign, so they are read once per list call.
- Icons come from `lucide-react`, as in `apps/body/src/components/campaigns/campaign-summary-tiles.tsx`.

## Decisions made while planning (not in the owner's answers)

- Row type lives in `packages/contracts/src/campaign.ts`. The calculation stays in brain next to the trend rules, so there is no copy of the gate or the projection.
- Replies is the sum over the 14-day window, because the owner asked for it. Each day counts the people who replied that day, so a person who replies on two days counts twice. The column tooltip says this. If the owner wants unique people, that needs a backend change (follow-up).
- Accept % is `accepted / invited` over the same window, using `rateOf`. Accepted counts acceptances on days inside the window, so the rate can pass 100% for invites sent before the window. The UI caps the displayed value at 100%.
- States: `No workflows` (no workflow in the campaign), `Paused` (`pausedAt` set), `Not started` (no rollup row yet), `Running` (otherwise). Each has its own icon and word.

## Scope and non-goals

- In scope:
  - Campaigns list: icons per column and per state, the four numbers, the 30-day projected range, the gate progress text, and the zero-workflow button.
  - Campaign detail header: the same icons, and the 30-day projection shown with the same wording.
  - One grouped rollup read for all of the owner's campaigns (at most `CAMPAIGN_LIMITS.perOwner` = 50), not one query per row.
  - Unit tests for the row rule; integration test for the grouped read and owner isolation.
- Out of scope:
  - Changing workflows, acts, the rollup job, or the trend chart.
  - New tables or migrations (read only over `CampaignDay`).
  - Example or preview charts for campaigns that are not ready.
    - The 7-day projection (the owner chose 30 days only).

## Approach

- [x] 1. Contracts: add `CampaignListRow` (counts over the 14-day window, state key, gate progress, projection with the 30-day range or the hidden reason) in `packages/contracts/src/campaign.ts`.
- [x] 2. Brain: add `CampaignListService` (or extend `CampaignService.list`) that reads owner capacity, running count and wallet floor once, reads `CampaignDay` once for all of the owner's campaigns in the window, and builds each row with the functions in `campaignTrend.ts`. Every query is scoped by `userId`. Wire it through the existing `campaign.list` resolver.
- [x] 3. Body: redesign `apps/body/src/pages/Campaigns.tsx` (icons per column and state, the four numbers, the 30-day range, gate text, the zero-workflow button to `/workflows/new`). Keep the page root `grid w-full gap-4 px-4 lg:px-6`.
- [x] 4. Body: align the detail header in `apps/body/src/pages/Campaign.tsx` with the same icons and the 30-day projection wording.
- [x] 5. Tests: unit tests for the row rule (no workflows, paused, under gate, zero cap, shown); integration test for the grouped read and owner isolation.
- [x] 6. Verify: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` (exit 0); brain integration `pnpm --filter @automatedLinkedIn/brain run test:integration:run` (107 files, 606 tests passed). Not run: browser check at 375 and 1440 px (no signed-in session).
- [x] 7. Update `MEMORY.md`, set status to `done`, fill Outcome.

## Design

Row layout (list). Numbers cover the last 14 complete days.

```
Campaign           Workflows  State            Qualified  Invited  Accept %  Replies  Next 30 days
[target] Find leads  3        [play] Running       120       40      18%      9     [trend] 600 to 900 invites
[flask] Staging test 3        [pause] Paused       120       40      18%      9     Paused
[dashed] New list    2        [dashed] Not started  --       --       --       --    Needs 14 days and 20 invites (0 of 14, 0 of 20)
[sparkle] find new leads 0    [plus] No workflows yet  hidden  hidden  hidden  hidden   [Add a workflow] button
```

- Each column has an icon in its header. Each state has an icon and a word; colour is never the only signal.
- The projection shows a range, the word "estimate", and a tooltip with the basis (the last 14 days' invites and the capacity share).
- Under the gate, the projection cell shows the gate progress in words, never a range.
- The detail header shows the same state icon and the 30-day range.

## Edge cases and risks

- Zero workflows: hide the numbers and the projection; show "No workflows yet" and the button to `/workflows/new`.
- Campaign with no rollup rows yet: "Not started" and no zeros, because a missing day is not zero (`noData` and `pending` states in `CampaignTrendDay`).
- Under the gate: show the gate progress, never a projected range. Numbers still show as history.
- Paused campaign: projection hidden with reason `paused`; numbers still show.
- Zero accounts, zero cap, or wallet low: projection hidden with the existing reasons. Divisions use `rateOf`, which returns null for zero.
- Replies and messaged are per-day counts (see Decisions). `accepted` can pass `invited` in the window (see Decisions). Totals for Qualified and Invited follow the `totals` rule in `CampaignInsights`.
- N+1 and performance: one `groupBy` for the first row day per campaign, one `findMany` for the window rows, one owner-level capacity read. Check the query plan on a seeded database.
- Privacy and tenancy: every read is scoped to `ctx.user.id`; the integration test proves one owner cannot see another's numbers.
- Time zones: day keys are UTC `YYYY-MM-DD`; "today" and "yesterday" are partial and excluded from the gate (`INCOMPLETE_DAYS`).
- Accessibility: icon-only controls need labels; the state word is always shown.
- Long names: names are up to `CAMPAIGN_LIMITS.nameMax`; the row truncates with the full name in a title attribute.
- Dev vs production: `packages/contracts` builds to CJS `dist`; the new type needs `pnpm build` (or `build:lib`) before the body build. Body dev aliases contracts to source.
- Data and migrations: none (read only). Rollback: revert the commits; no data changes.
- Docker and CI: no change expected. The new query runs in the integration suite (Docker Postgres).

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` all pass.
- `pnpm --filter @automatedLinkedIn/brain test:integration:run` (needs Docker Postgres) covers the grouped read and owner isolation.
- Browser check at 375 and 1440 px, light and dark, on a signed-in session. Screenshots go in the Outcome if available.

## Outcome

Shipped:

- Contracts: `CAMPAIGN_LIST_STATES`, `campaignListStateOf`, `CampaignListNumbers`, `CampaignListRow` (`packages/contracts/src/campaign.ts`).
- Brain: `CampaignListService.list` (owner-scoped; one `groupBy`, one `findMany` on the window, owner capacity, running count and wallet floor read once), the pure row builder `campaignList.ts`, wired through `campaign.list`. No migration and no change to `CampaignService.list`.
- Body: the Campaigns table with state icon and word, the four numbers, the 30-day range (tooltip with the basis), the gate text under the gate, and the zero-workflow row with "No workflows yet" and a button to `/workflows/new`. The detail header shows the same state and the 30-day projection.
- Tests: brain unit (6), brain integration (4, including owner isolation), body unit (`campaign-list-format.unit.test.ts`).

Deviations and facts:

- Replies on the list is the sum of per-day counts, so one person who replies on two days counts twice. The detail `totalsOf` does not sum replied at all. The two numbers can differ. Unique people needs a backend change (follow-up).
- Accept % can pass 100% for invites sent before the window; the UI caps it at 100% (`acceptLabel`).
- The detail header shows the state badge once insights load. A campaign with no rollup rows now reads "Not started", where the old badge said "Running".
- The "All" trend period is assumed to be 365 days (`CAMPAIGN_TREND_ALL_DAYS`); the owner has not confirmed it.

Not run: the browser check at 375 and 1440 px, light and dark (needs a signed-in session; local `/campaigns/:id` redirects to authentik). No screenshots.

Follow-ups: browser check; unique-people replies; owner confirmation of the 365-day cap.
