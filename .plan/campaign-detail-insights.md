# Campaign detail page: insights for empty and full states (master plan)

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-11-12
- Locked by user: yes, 2026-11-13 (user instruction: "implement the campaign-detail-insights.md plan only and lock it"; open questions resolved with the recorded defaults below, see Assumptions)

Design source: `.plan/egm/campaign-detail-insights_design_draft.md` (228 lines, rounds 1 to 14 applied, round 15 not applied). Review history: `.plan/egm/campaign-detail-insights_round*_report.md`. Builds on `.plan/lead-pipeline-p5-campaign-page.md`.

## Goal

Give the campaign detail page two views: an empty state that shows what the owner's accounts can reach, and a full state with a daily trend, a projection range and animated charts. The change is read-only: one new `insights` query over existing data and the `CampaignDay` rollup.

## Requirements

Confirmed (user decisions, from the review loop):

- Projection method A: range from the average daily pace of the last two 7-day blocks, capped per day and per week (draft lines 61 to 62).
- Trend gate: 14 complete days and 20 invites (lines 65, values are drafts to tune after real data).
- Projection share: the owner's caps split equally across running campaigns; a paused campaign counts itself in the denominator (lines 61, 218; Alternative F, lines 141 to 146).
- Empty state means non-zero rows: no found person, no invite, and no `CampaignDay` row with a non-zero count or `aiCostMicros` (lines 59, 225).
- Animation: recharts built-in animation only, on first open and on every period change; reduced motion turns it off (lines 70, 223). No new animation library.
- Found and Qualified rules, the per-list strip and the Handed over card (lines 66, 67, 52 to 53).

Confirmed (design decisions, not yet user-locked):

- Brain computes trend, gate and projection in a pure module; the client renders only (Alternative A, lines 112 to 116).
- Capacity is the owner's live limits from one new `LinkedInInviteService.usableCapacityOf(userId, now)`; dispatch is unchanged (Alternative E, lines 136 to 139).
- No backfill of days before `since`; days are UTC; "Updated HH:MM" and "so far" labels (lines 53, 64, 148 to 151).
- Totals sum found, qualified, invited and accepted. Messaged and replied are per-day values and are not summed (line 58).
- The Today tab shows live funnel counts only; the trend and projection are hidden there (line 56).
- Cost per lead is "not tracked" (line 68; Scope and non-goals).
- Setup buttons only open existing screens; nothing starts from the new panels (line 69).

Assumptions (resolved at lock; the user asked to lock without answering these, so each takes the recorded default. Change one only by editing this plan first):

1. Gate scope: the latest 14 complete days, each on or after `since` and each with a `CampaignDay` row, with at least 20 invites in them. A missing day among the latest 14 fails the gate as `tooEarly`.
2. `since`: non-null whenever any `CampaignDay` row exists (including all-zero rows). It is null only when there are no rows.
3. Empty versus trend: a campaign with invites, found people, or a non-zero `CampaignDay` value is not `empty`; it goes to the gate. Only no found, no invite, and no non-zero row is `empty`.
4. CUJ 6 (foreign or missing campaign): the `insights` query returns `notFound` (no data); a resolver test covers it.
5. CUJ 5 reasons: `noAccounts`, `zeroCap`, `paused`, `walletLow` and `tooEarly` each have a copy line on the page. `zeroCap` is defensive only, because `limitOf` clamps to at least 1.
6. Today tab: `period` `today` returns the live funnel only; no trend, no projection, no capacity panel in the trend path.
7. A Discover run that found nobody counts as run (user did not answer; default kept, and it is visible in the Discover card). Reversible with one line in `lastDiscoverRun` callers.
8. Equal split across running campaigns (user decision, kept). An idle campaign lowers a busy campaign's projection; the `basis` shows the total, share and count.
9. Round-15 nits are resolved in code: one `gateMessage` wording (from the design draft, line 179), `needed: { days, invites }`, `noAccounts` as a capacity `missing` value and as a projection reason (both are the same word, not two concepts), `shareDenominator` only in `projection.basis`, `usableCapacityOf` tests live next to `linkedInInvite.service.ts`, and `forAccount` (not `forAccounts`) is the call dispatch makes.
10. Scope: "campaign analytics" means the campaign detail insights design in this plan (confirmed by the user's instruction to focus on this plan only).


## Scope and non-goals

- In scope: `CampaignDay` as the trend source; the `insights` tRPC query; `CAMPAIGN_TREND_GATE` and the insights output type in contracts; `dayOf` exported from the rollup service; `usableCapacityOf` on `LinkedInInviteService`; four body components under `apps/body/src/components/campaigns/` and the wiring in `apps/body/src/pages/Campaign.tsx`; tests as listed in Verification.
- Out of scope: any spend or cost tracking (`CampaignDay.aiCostMicros` is AI draft cost, not data cost); changes to how invites, replies or Discover runs work; promises of results (the empty state shows capacity, not expected accept rates); per-workflow or per-keyword cut tables (backlog in the p5 plan); changes to the campaigns list page (`apps/body/src/pages/Campaigns.tsx`); the rollup schedule or write logic; a backfill; removing the sample-data `apps/body/src/components/chart-area-interactive.tsx` (separate later task); a new index unless measurement shows one is needed.

## Approach

- [x] Review rounds: rounds 1 to 14 ran; round 15 raised unsettled Majors and was not converged. The user locked the plan on 2026-11-13 without further rounds. Round 15 items are resolved in Assumptions below; no round 16 run.
- [x] User locks this plan (2026-11-13).
- [x] Contracts: add `CAMPAIGN_TREND_GATE = { completeDays: 14, invites: 20 }` and the insights output type in `packages/contracts/src/campaign.ts`. Leave `CAMPAIGN_LIMITS` unchanged.
- [x] Export `dayOf` from `apps/brain/src/database/campaignRollup.service.ts` (line 10).
- [x] Add `LinkedInInviteService.usableCapacityOf(userId, now)`: widen the `accountsOf` select (line 110) to read `invitesStoppedAt`, `invitesStopUntil`, `lastVerifiedAt`; apply `stopped()` (line 92) and the pause rule; read limits with `AccountLimitsService.forAccounts`. Check `planOf` (line 296) output is unchanged.
- [x] Write `apps/brain/src/database/campaignTrend.ts` (pure, no I/O): `shareOf`, `isCompleteDay`, `passesGate`, `weeklyPaces`, `projectRange`, `gateMessage` inputs.
- [x] Write `apps/brain/src/database/campaignTrend.service.ts` (static `insights(userId, campaignId, period, now)`): owner-scoped `findFirst`; reads `CampaignDay` rows; `since`; totals; gaps; gate; state; capacity; share; projection.
- [x] Add the `insights` query to `apps/brain/src/trpc/api/resolvers/campaign/campaign.ts` under `ownerProcedure`, following the `overview` pattern (lines 42 to 50). `CampaignTrendService` is exported from `apps/brain/src/database/index.ts`.
- [x] Write body components `campaign-capacity.tsx`, `campaign-insights-panel.tsx`, `campaign-trend-chart.tsx`, `campaign-lists-strip.tsx`, with the pure helpers in `campaign-insights.ts` (the panel file name avoids a clash with the helper module).
- [x] Wire `apps/body/src/pages/Campaign.tsx`: replace the empty check (about line 180) with the `state` from the server; keep the funnel, the Handed over card (line 199) and the existing sections.
- [x] Tests: unit (pure rules and body helpers), integration (service), resolver (`notFound`, foreign id). Passing: brain unit 10 (`campaignTrend.unit.test.ts`) and resolver 4 (`campaign.unit.test.ts`); integration 8 (`campaignTrend.integration.test.ts`) plus the `usableCapacityOf` test; body helpers 9 (`campaign-insights.unit.test.ts`).
- [ ] Measure the `insights` read on staging with `EXPLAIN ANALYZE`; add an index on `LinkedInInvite.originWorkflowId` only if the numbers need it.
- [ ] Real-path check on staging: an empty and a full campaign; compare a few chart days with `CampaignDay` rows (read-only SQL); compare lists strip counts with the list pages.
- [x] Run the definition-of-done commands (green from the repo root, see Outcome); update `MEMORY.md`; fill in Outcome. Status stays `in progress` until the two staging items above are done or the owner accepts them open.

## Edge cases and risks

- Empty and invalid input: unknown or foreign campaign id returns not-found with no data (CUJ 6). A campaign created today fails the gate even when rollup rows exist for today and yesterday.
- Rollup job not running: a complete day on or after `since` with no row is "no data", never zero, and fails the gate when it is among the latest 14 complete days.
- Gaps before the campaign: days before the creation day are "not started"; days from creation up to `since` are "before history starts". Neither is counted.
- Concurrency and freshness: the trend can lag up to one hour (hourly job). The page shows "Updated HH:MM" and labels today "so far". Today's live counts can disagree with the trend.
- Idempotency and retries: the change is read-only. The rollup already rewrites the last two days, so repeated reads are stable.
- Stored counts: each day keeps the values from its last rollup write. A later label or fit change moves the live count but not the stored day. The trend Qualified can differ from the live Lists strip.
- Workflow changes: only the last two days are rewritten; older days stay as recorded.
- Accepted double count: a person re-invited and accepted again has a second `acceptedAt` (`linkedInInvite.service.ts` line 959), so accepted totals can count that person twice. Disclosed on the page, not corrected.
- Shared capacity: equal split means an idle campaign lowers a busy campaign's projection, and a running campaign with no usable account still counts. Shown in `basis`; flagged for the user (open question 8).
- Wallet: a missing wallet row counts as not low, and a stale `checkedAt` is ignored (current `WalletService.belowFloor()`, `wallet.service.ts` lines 40 to 44). An integration test covers the missing row.
- Existing data and migrations: none. `CampaignDay` exists (migration `20261104160000_lead_pipeline_campaigns`) with no backfill; no schema change is planned.
- Security and privacy: owner-scoped `findFirst`; no draft counts or `aiCostMicros` in the output; no secrets or signed URLs in code or plans.
- Dev vs production: `CampaignDay` has no production reader yet, so the first real read is on staging. Measure before ship.
- Query load: one `insights` request per page open, with several reads. A failure in any read fails the whole query, so no partial trend or capacity is shown.
- Docker and CI impact: none expected (no new dependency, no new service). `apps/body` already depends on recharts 3.8.0.
- Rollback: revert the page and the procedure; no data change to undo.

## Verification

- Commands from the repo root: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, plus `pnpm test:integration:run` for the service.
- Unit, pure rules (`apps/brain/src/database/campaignTrend.unit.test.ts`): gate at 13 and 14 complete days and at 19 and 20 invites; one missing day in the latest 14 fails; `projectRange` reason order (`noAccounts`, `zeroCap`, `paused`, `walletLow`); daily cap when the limit is below the pace; campaign share with and without a paused campaign; `next7` and `next30` low and high; per-week cap; 30-day cap (`share.perWeek × 30 / 7`); today and yesterday are not complete; low never above high.
- Unit, body helpers (`apps/body/src/components/campaigns/*.unit.test.ts`): trend visible only on 7d and 30d; reduced motion disables animation; lists-strip mapping for `STRONG`, `MAYBE` and `NEW`; `missingSetupItems` labels and links; `gateMessage` at 13 complete days, 19 invites and `missingDays`.
- Integration (`campaignTrend.integration.test.ts`, Postgres): foreign id returns null; gap day is missing, not zero; messaged and replied not summed; stopped and paused accounts excluded from capacity; invites but no found people is not `empty`; non-zero history with no live people is not `empty`; all-zero rows with no people is `empty`; missing wallet row and stale `checkedAt` are not low; "not started", "before history starts" and "no data" days; `since` label when the period starts before `since`; handed over absent from history; no usable account returns `noAccounts`; lists counts match people counts.
- Resolver test: `insights` returns not-found for a foreign or missing campaign and for Today returns no projection.
- Query load: `EXPLAIN ANALYZE` on staging for a campaign with 30 days of rows and a large invite table. Record the result in Outcome.
- Real path (manual, staging, read only): open an empty and a full campaign; check a few chart days against `CampaignDay` rows; check lists counts against the list pages; check "so far", the Today hiding, each CUJ 5 reason and reduced motion in the browser. Record what was run and what could not be run.

## Outcome

Shipped (local, uncommitted, on `main`): contracts `CAMPAIGN_TREND_GATE` and insights types; `dayOf` export; `LinkedInInviteService.usableCapacityOf` (dispatch unchanged); pure `campaignTrend.ts`; `CampaignTrendService.insights` (owner-scoped); `campaign.insights` query (7d and 30d only); body panel, trend chart, capacity and lists strip, wired into `Campaign.tsx` above "Needs you". The panel is lazy-loaded, so the `index` chunk dropped from 958 kB to 624.68 kB.

Checks run from the repo root, all exit 0: `pnpm lint`, `pnpm ts:check`, `pnpm test:unit:run` (contracts 43 files, logger 4, spider 103, brain 179, body 133), `pnpm build`, and `pnpm test:integration:run` (brain 106 files and 602 tests, spider 2 files and 14 tests). The build prints one warning: chunks over 500 kB (`schemas` 573.67 kB, `index` 624.68 kB, `Workflow` 325 kB). It was already there at `2f85f66`, and this change does not touch chunking.

Deviations and choices (not in the locked text):
- Helper module is `campaign-insights.ts`; the panel is `campaign-insights-panel.tsx` (a `campaign-insights.tsx` file would clash with `./campaign-insights` imports).
- Body helpers have no `@/` or recharts imports, because `apps/body/vitest.config.ts` has no `@` alias.
- `shareOf` uses denominator max(1, running + pausedSelf); projection uses `Math.round`; a `pending` trend state is added for days not yet rolled up.
- The empty check counts rows directly rather than through `countsFor`.
- The resolver rejects `today` (only `7d` and `30d` are accepted); the page disables the query on Today.
- "Nothing yet. Invites start after Discover runs." shows on Today only.
- `notYetHandled` means `Person.status = NEW`.

Not run (need staging access, which needs the owner's approval):
- `EXPLAIN ANALYZE` of the `insights` read on staging. No index was added; `LinkedInInvite.originWorkflowId` is still unindexed.
- The real-path check in the browser (empty and full campaign, chart days against `CampaignDay`, lists counts, reduced motion).

Follow-ups:
- Gate values 14 days and 20 invites are drafts; confirm after staging numbers.
- Product defaults to confirm: a Discover run that found nobody counts as run; equal capacity split across running campaigns; paused campaign counted in the denominator.
- Accepted double count: a re-invite that is accepted again adds a second `acceptedAt` (`linkedInInvite.service.ts` near line 959). Disclosed on the page, not corrected.
- Pre-existing: `planOf` (`linkedInInvite.service.ts` near lines 296 to 340) ignores `stopped()`.
- Chunk-size warning: pick one of raising `build.chunkSizeWarningLimit`, switching zod to zod/mini, or lazy-loading more routes.
- Egm round 15 was not converged; the plan was locked by the owner on 2026-11-13 without further rounds.
