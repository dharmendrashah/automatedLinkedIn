# Workflows page: icons, a Campaign column, and clear metrics

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-11-14
- Locked by user: yes, 2026-11-14

## Goal

The Workflows list is a plain table of text. The result of each workflow's last run is one long sentence ("Done: 2 qualified and 0 maybe from 11 people (18%) for $0.102, $0.051 per qualified person."), there is no way to see which campaign a workflow belongs to (they are named "Find leads for elitale · 3 Warm up", so the campaign hides inside the name), and nothing has an icon. Redesign the list so a row reads at a glance: icons for the kind of thing, a new Campaign column, and the metrics of the last run in their own columns with the numbers that matter.

## Current behaviour (read from code)

- [Workflows.tsx](../apps/body/src/pages/Workflows.tsx): five columns (Workflow, Runs, Last run, List, Started). "Runs" is the text "On its schedule", "Schedule switched off" or "By hand" (from a `trigger.schedule` node and `enabled`). "Last run" is `runSentence(...)` with the steps left out, or a live line while running. "Started" is `toLocaleString()` of the last run. The list polls every 3 s while any last run is live.
- `trpc.workflow.list` ([workflow.ts](../apps/brain/src/trpc/api/resolvers/workflow/workflow.ts) line 230, `WorkflowService.list`) already returns, per workflow: `campaignId`, `stage`, `outputList.name`, `enabled`, `nextRunAt`, `graph`, and its last run (`status`, `qualified`, `maybe`, `discarded`, `costMicros`, `estimateMicros`, `startedAt`, `finishedAt`, `message`, `stopRequestedAt`). It does not return the campaign's name.
- A workflow belongs to at most one campaign (`Workflow.campaignId`, optional, `onDelete: SetNull`) and has a `stage` (`DISCOVER`, `INVITE`, `WARM_UP`, `FIRST_MESSAGE`, `HAND_OFF`, `NO_ANSWER`, `OTHER`) with labels in `STAGE_LABELS` ([campaign.ts](../packages/contracts/src/campaign.ts)).
- Reusable pieces: `RunStatusBadge` and `runStatuses` (label and colour per run status), `timeAgo` (`@/lib/time-ago`), `formatUsd`, `StateRows`, and the campaign list row style ([campaign-list-item.tsx](../apps/body/src/components/campaigns/campaign-list-item.tsx): an icon, a linked name, a small caption, tabular numbers, a dash for "no value").
- The list select does not include the steps of a run, so a run that scored nobody but added people to the list (the "people added to the list for $x" sentence) cannot show that count in the list. Its metrics would read as a dash.

## Requirements

Confirmed (from the owner's request):

- Redesign the Workflows page.
- Use icons.
- Add a new column called "Campaign".
- Show the metrics very clearly.

Proposed (the owner can change these before lock):

- Columns, in this order: Workflow, Campaign, Schedule, Last run, Found, Qualified, Maybe, Cost (the List column is dropped, decision 2).
  - Workflow: a workflow icon, the name as the link, the goal as a small caption (as today).
  - Campaign (new): the campaign name as a link to `/campaigns/:id` with the campaign icon, and under it a small stage chip with the stage's icon and its number and label (for example "3 Warm up"). A workflow in no campaign shows a muted "No campaign".
  - Schedule: an icon and one short word, replacing the sentence: clock and "On" (green) for a switched-on schedule, a pause icon and "Off" (amber) for a schedule that is switched off, a hand icon and "By hand" (muted) for no schedule. The next run time shows as a caption when it is on and known.
  - Last run: the status with its icon and colour (Done, Running, Failed, Done with gaps, Stopped, Waiting its turn) and, as a caption, how long ago it started ("2 hours ago", the full date on hover). A failed or partial run keeps its one-line reason as a caption. A workflow that never ran shows "Never run".
  - Found, Qualified, Maybe: three number columns from the last run. Found is qualified plus maybe plus discarded (the people scored). Qualified is emphasised (bold, green when above 0). Maybe is normal weight. A workflow with no run, or a run that scored nobody, shows a muted dash, never "0" that looks like a result.
  - Cost: the last run's cost, with the cost per qualified person as a small caption when there is at least one qualified. A running run shows "about $x of up to $y" with a spinner instead.
  - List: the output list name, as today, with a list icon; smaller text.
- Numbers are right-aligned with tabular figures so columns line up; headers carry a small icon and the same short name; a header can carry a tooltip that explains it (for example Found: "People this workflow scored in its last run").
- The "Started" column is dropped: the time ago in Last run replaces it.
- The page header, description, "New workflow" button, loading, error and empty states, and the live polling stay as they are. Row order stays newest first.
- The table scrolls sideways on a narrow window (no hidden columns), as the Campaigns table does.
- No colour is the only signal: every icon has a text label or an accessible name.
- Plain words only; no supplier names.

## Decisions (locked 2026-11-14)

1. The campaign name comes from a small additive backend select on the workflow list.
2. The List column is dropped; the columns are Workflow, Campaign, Schedule, Last run, Found, Qualified, Maybe, Cost.
3. No campaign filter; only the column.
4. A new branch `feat/workflows-list-redesign` from the latest `main`.

## Scope and non-goals

- In scope: the Workflows page and a small pure helper for the row values; the one-line backend select if question 1 says so.
- Out of scope: the workflow detail page and canvas, the Runs tab, the Campaigns pages, run history, any change to how runs are scored or charged, sorting and filters, any edit to `components/ui/*`.

## Approach

- [x] (Question 1) `workflowSelect` in `workflow.service.ts` gets `campaign: { select: { id: true, name: true } }`; the resolver already spreads the item, so the type reaches the browser. Keep `get` working (it shares the select).
- [x] `workflow-row.ts` next to the page components (pure): `metricsOf(run)` returns `found`, `qualified`, `maybe`, `cost`, `perQualified` (null when none qualified), each null when there is no run or nothing was scored; `scheduleOf(workflow)` returns `on | off | manual`. `workflow-row.unit.test.ts` covers: no run, a live run (no result numbers), a finished run with qualified, qualified 0 (no per-qualified), a run that scored nobody, and the three schedule states.
- [x] `Workflows.tsx`: new columns, header icons and tooltips, icon cells, the campaign cell with its stage chip, right-aligned numbers. Move cell pieces that grow past a few lines into small components in `components/workflows/` rather than one long file.
- [x] No resolver test: the resolver did not change shape.
- [ ] Look at the real page signed in (not done: sign-in needed). Looked at the cells with sample rows in a throwaway harness (live, failed, partial, never run, no campaign; light theme; narrow window).
- [x] Root gate, Outcome, `MEMORY.md`, commit.
- [ ] Open a PR with the repo template (when asked).

## Edge cases and risks

- A deleted campaign sets `campaignId` to null (`SetNull`): the row shows "No campaign". A workflow whose `stage` is `OTHER` inside a campaign shows the campaign without a stage chip.
- Two campaigns can have the same name (the label is unique, the name is only unique by label rule): the link target is the id, so the rows are still correct.
- Long names: truncate with a title attribute, as the Campaigns list does.
- A running run has no final numbers: Found, Qualified and Maybe show a dash and the live spend shows in Cost; the 3-second poll updates it.
- Percentages, if shown, must be rounded and never above 100.
- `maybeEnabled` false: Maybe is still counted by the run; show it as is (no new rule).
- Money: `costMicros` is millionths of a dollar; per qualified person divides by `qualified` only when above 0.
- Performance: no new query when the select is used; the join in the browser (the other option) would add one heavier query on every poll tick.
- Timezones: `timeAgo` is relative; the hover date uses the browser's locale as today.
- Wider table: nine columns scroll sideways under 1100 px; the first column stays readable.
- Dev vs production: the same code path. No Docker, CI, migration or secret impact. Rollback: revert the commit.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root, Prettier on each changed file.
- Browser walk as listed above.

## Outcome

Shipped: the Workflows list has icons in every header (with a hover explanation), a new Campaign column (campaign link plus stage chip such as "3 Warm up", or "No campaign"), a Schedule column with On, Off and By hand, a Last run column with a status chip and "Started 2 hours ago", and the metrics in their own right-aligned columns: Found, Qualified (large and green when above 0), Maybe and Cost (with the cost per qualified person). The List and Started columns are gone. A run still going shows its spend so far; a failed or partial run shows its reason. Backend: `workflowSelect` also selects `campaign.name` (additive, no migration). New pure `workflow-row.ts` with a unit test; cells in `workflow-list-cells.tsx`.

Deviations: none from the locked plan. A run that scored nobody but added people to the list shows dashes for the counts, as planned (the list does not carry step results).

Change (2026-11-14, owner feedback "I am seeing double information"): a campaign's workflows are named "<campaign> · 3 Warm up", so the name, the campaign and the stage were all shown twice. The Workflow column now shows only "3 Warm up" (`shortName` in `workflow-row.ts`; the full name is the link's title), with the icon of its step; the Campaign column shows the campaign name and, only when the workflow's own name does not already carry the step, the step chip. A workflow with any other name keeps its whole name.

Follow-ups: look at the real signed-in page in light and dark and at 1440 px.
