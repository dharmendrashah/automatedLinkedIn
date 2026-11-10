# My network: score filter and score bar

- Status: in progress <!-- draft | locked | in progress | done -->
- Author: Dharmendra Soni
- Created: 2026-11-10
- Locked by user: yes, 2026-11-10 <!-- change to "yes, <date>" only after the user confirms -->

## Goal

On `/network`, let the owner filter people by score band and see each person's score as a coloured progress bar in the table. Bands: red 0 to 40, yellow 40 to 70, green 70 to 100.

## Requirements

Confirmed by the owner (2026-11-10):

- A score filter on `/network`.
- A progress bar showing each person's score, coloured by band: red 0 to 40, yellow 40 to 70, green 70 to 100.
- The plan is written first; no code until it is locked.

Decisions (owner, 2026-11-10):

- Q1 Band edges: a score of 40 is yellow and a score of 70 is green. Red is 0 to 39, yellow 40 to 69, green 70 to 100.
- Q2 Where the filter lives: in the Filters sheet, under Work, as several bands at once, shown as chips like the other filters. The toolbar keeps Found by, Fit and Label.
- Q3 Sort by score: yes; the Score column header sorts, unscored people last.
- Q4 Export: yes; a Score column at the end of the CSV.

Still open before locking: none.

Fixed by the code today (no question):

- The score is `Person.score`, the best score of the person's list members, as the people index already sets it. It is null for a person in no scored list (an imported profile, a person found by a block without a Score block). A null score shows "No score" and matches no band.
- The bands are fixed colours. They are not the ideal customer's qualify or maybe thresholds.

## Scope and non-goals

- In scope:
  - `packages/contracts/src/peopleFilters.ts`: a `score` filter (a list of bands `RED`, `YELLOW`, `GREEN`); a `score` sort value.
  - `apps/brain/src/database/peopleFilters.ts`: the band to Prisma condition (`RED` is `score < 40`, `YELLOW` is `40 <= score < 70`, `GREEN` is `score >= 70`; bands are ORed; a null score matches none). The `score` sort, nulls last.
  - `apps/brain/src/database/people.service.ts`: `score` in `rowSelect`; the export header gets `Score` at the end.
  - A migration (additive): an index on `Person (userId, score)` for the filter and the sort.
  - `apps/body/src/components/my-network/filters/model.ts` (the page's copy of the filter schema and its address keys, short name `score`) and the test that keeps the copies equal.
  - `apps/body/src/components/my-network/filters/filters-sheet.tsx` and `filter-chips.tsx`: a Score section under Work with a checkbox per band (several bands, chips like the other filters). The toolbar is unchanged (Q2).
  - `apps/body/src/components/my-network/people-table.tsx`: a Score column after Person with the bar and the number, and a sortable header (Q3).
  - A new `apps/body/src/components/my-network/score-bar.tsx`: a score bar built on the shadcn `progress` component (added with the shadcn CLI as `apps/body/src/components/ui/progress.tsx`, with its `@radix-ui/react-progress` dependency), coloured by band with the palette the accounts page uses (red, yellow, green), with `aria-label` "Score 72 of 100, green".
- Out of scope:
  - A score in the person drawer or on other pages.
  - Changing how scores are computed or the thresholds of the ideal customer.
  - Backfilling scores: the index already sets `Person.score`; the plan checks this on staging.

## Approach

- [x] 0. Contracts: `SCORE_BANDS` and the `score` filter and sort in `peopleFilters.ts`; unit tests first (an unknown band is refused; the page copy has the same keys).
- [x] 1. Brain query: `scoreWhere(bands)` in `peopleFilters.ts`, unit tests first for each band edge (0, 39, 40, 69, 70, 100), null scores, and two bands together. Then the code.
- [x] 2. Brain rows and sort: `score` in `rowSelect`; sort by score with nulls last; integration test with seeded people at each edge and with the sort.
- [x] 3. Index migration `(userId, score)`, additive; `prisma migrate diff` shows no drift after `migrate deploy`.
- [x] 4. Export: the `Score` column at the end, its test first (the existing export test updated for the new last column).
- [x] 5. Body: address key, the Score section in the Filters sheet with chips, the table column and the bar; unit tests first (boundaries 39, 40, 69, 70; "No score"; the bar width is the score in percent; the colour word).
- [~] 6. Gate: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` pass; brain integration suite passes (560 of 560). Open: the browser check on the dev server with seeded people at each band edge (not run yet).

## Edge cases and risks

- A person's score changes when a list is rescored: the band moves with it; the filter and the bar read the stored value, so they agree.
- Null scores: excluded from every band; shown as "No score" with no bar; they still sort last.
- Scores outside 0 to 100: not possible from the scoring code; the bar clamps to 0 to 100 anyway.
- Address: an unknown band value is dropped by the page reader and refused by brain's schema (no crash, no empty page without a reason).
- The Fit filter and the score bands can disagree (Fit is per list state; the bands are fixed numbers). The UI shows both; the plan does not merge them.
- Export: a changed header can break a consumer that reads the CSV by position; the new column is last, so earlier positions do not move.
- Performance: the new index covers the filter and the sort within one client; check the query plan on staging.
- Rollback: the column is not changed; the index can be dropped; the body can ignore the new address key.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root.
- `pnpm --filter @automatedLinkedIn/brain run test:integration:run` (the band edges, the sort, the export).
- On staging after deploy: `SELECT count(*) FROM "Person" WHERE "userId" = $1 AND "score" IS NOT NULL` against the bar counts shown per band.
- In the browser: each band and the boundary people (39, 40, 69, 70), the sort, the export's last column.

## Outcome

Shipped on `feat/network-score-filter` (not yet committed at the time of writing):

- Contracts: `SCORE_BANDS`, `scoreBandOf`, the `score` filter and the `score` sort. Brain: band conditions (nulls match no band), the sort with nulls last, `score` in rows, the `Score` export column at the end.
- Migration `20261110140000_person_score_index` (additive, `Person (userId, score)`), applied locally.
- Body: a Score section under Your work (multi-pick of bands, chips), a sortable Score column with `ScoreBar` (shadcn progress), `scoreLabel` for the accessible text.
- Gate: lint, ts:check, unit tests (1,846), build, and brain integration (560 of 560) pass.

Deviations from the plan:

- The filter is a multi-pick (the same control as Status), not a checkbox list.
- Bar colours are Tailwind red-500, yellow-400 and green-500. The plan said to match the accounts page palette; that was not checked, so it may differ.
- The shadcn progress file was reformatted by the repo's lint fix, and its imports were adjusted to repo style.
- The filter lives in the Filters sheet only; the toolbar is unchanged, as decided.

Open:

- Browser check on the dev server with seeded people at 39, 40, 69, 70 and null (plan step 6).
- Staging: confirm the band counts against the database after deploy.
- This branch lacks the campaign and `IcpJudgement` migrations (they are on the PR #216 branch). `prisma migrate diff` on this branch shows drops for them; do not apply those.
- Export consumers that read by column position are unaffected, since the new column is last.
