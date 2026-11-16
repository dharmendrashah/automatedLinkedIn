# Plan 006: A campaign's Invite workflow also runs on a daily clock, so waiting leads are invited on days Discover finds nobody or fails

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3ce071d..HEAD -- packages/contracts/src/recipes.ts packages/contracts/src/recipes.unit.test.ts apps/brain/src/database/campaignStarter.service.ts apps/brain/src/database/campaignStarter.service.integration.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (new campaigns only; one extra quiet run a day)
- **Depends on**: none
- **Category**: bug (a product gap the plans admit)
- **Planned at**: commit `3ce071d`, 2026-11-16

## Why this matters

A campaign finds leads in one workflow (Discover) and connects with them in another (Invite). Invite starts only when Discover finishes and keeps at least one person. A day on which Discover finds nobody, or fails, therefore sends no invites at all, even though earlier leads are still waiting and the accounts have room. The first campaign on staging measured exactly this: qualified people per day were 22, 18, 11, 38, 2, 0 (from `MEMORY.md`, not re-measured by the advisor: the advisor's cluster login had expired), and the 2026-11-16 03:30 Discover run failed, so Invite did not run that day. The plan for the chain already says "A day with no new people does not start Invite, so the backlog waits longer. Accepted for now; a later change can add a daily Invite run." This is that change. After it, Invite also starts from its own daily clock, and waiting leads are connected with every day.

## Current state

- `packages/contracts/src/recipes.ts` (the Starter recipe, `buildOutreach(input, icpId, discoverId?)`, starts at line 225). The Invite start is chosen at line 299:

```ts
const inviteStart =
   discoverId === undefined
      ? schedule(shift(time, 1))
      : node('trigger', 'trigger.workflow', 0, 0, { workflowId: discoverId })
```

  Both Invite graphs (with and without a note) wire `['trigger', 'people']` (lines ~331 and ~366) and their first node is `inviteStart`.
- `schedule(at, extra)` (a local helper in `buildOutreach`) builds `node('trigger', 'trigger.schedule', 0, 0, { every: 'day', at, timeZone, ...extra })`. `shift(time, hours)` adds hours to an `HH:MM` clock. `wire([...])` builds edges. `node(id, type, column, row, config)` builds a graph node.
- `apps/brain/src/worker/engine/engine.ts:454-460` (`finish`): a chained start runs only `if (count === 1 && !failed && !stopped && run.trigger !== 'PREVIEW' && run.kind === 'MAIN')`, and `apps/brain/src/database/workflowTrigger.service.ts:116` (`startAfter`) returns 0 when `people.length === 0`. So no Invite run follows a failed Discover or a Discover that kept nobody.
- Invite does not use what Discover passes on. It reads its people from the labelled people index (`input.profiles` node `people`: filters `labels: [<campaign label>]`, `invites: ['NONE']`, `howMany: 100`, `order: 'newest'`). Any run of Invite therefore works on the whole waiting backlog.
- A queued invite is not "NONE": `apps/brain/src/database/peopleIndex.ts:206-207` maps `QUEUED` and `SENDING` to person state `QUEUED`. So a second Invite run on the same day does not queue the same people twice.
- A graph may hold a schedule trigger and a workflow trigger together: `packages/contracts/src/workflow.ts` `isFired` (line ~7148) makes a run started by a schedule fire only `trigger.schedule` nodes, and a chained run fire only `trigger.workflow` nodes (`FIRES` table at line ~7138). `scheduleOf(graph)` (line ~8156) finds the first `trigger.schedule` node, and `WorkflowService.update` (`apps/brain/src/database/workflow.service.ts:481`) sets `nextRunAt` from it when the workflow is switched on. The warm-up workflow of the same recipe already has two triggers (`trigger` and `approved`).
- The existing test that pins the current behaviour is `packages/contracts/src/recipes.unit.test.ts`, `describe('the Invite trigger')` (line 50): it expects the Invite graph to hold exactly one trigger, `trigger.workflow`, when a Discover id is given. This test changes in Step 1.
- The Starter service `apps/brain/src/database/campaignStarter.service.ts` makes Discover first, then calls `buildOutreach(answers, icpId, discoverWorkflow.id)` for the rest. It never rewrites a saved graph.
- Conventions: contracts are pure and unit tested next to the file (`*.unit.test.ts`); Prettier first, then `eslint --fix` (their `object-curly-newline` rules conflict); objects with two or more keys are multi-line.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Contracts tests | `pnpm --filter @automatedLinkedIn/contracts exec vitest run src/recipes` | all pass |
| Rebuild contracts for brain | `pnpm --filter @automatedLinkedIn/contracts build:lib` | exit 0 |
| Starter integration (needs Postgres) | `pnpm --filter @automatedLinkedIn/brain exec vitest run --config vitest.integration.config.mts --dir src src/database/campaignStarter` | all pass |
| Gate | `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` | exit 0 |

Run from the repo root (a login shell, `zsh -lic '...'`, if `pnpm` is not found). Brain imports contracts from `dist`, so rebuild contracts after changing them. Run brain vitest with `--dir src`.

## Scope

**In scope**:
- `packages/contracts/src/recipes.ts` (the `inviteStart` choice and the two `edges` lists of the Invite graphs)
- `packages/contracts/src/recipes.unit.test.ts`
- `apps/brain/src/database/campaignStarter.service.integration.test.ts` (one case)

**Out of scope**:
- Saved graphs of campaigns that already exist (the Starter never rewrites them; see Maintenance notes for the owner's manual step).
- The chain itself (`engine.ts`, `workflowTrigger.service.ts`): it stays as is, so a day with new leads still invites them right after Discover.
- Discover, the other four stages, the invite blocks and their limits.
- Any UI change.

## Git workflow

- Branch: `fix/invite-daily-backstop`. Conventional commit, e.g. `fix: run a campaign's Invite workflow daily as well as after Discover` plus the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`. Never put a literal `!` in a commit message.
- Do NOT push or open a PR unless the operator told you to.
- The repo asks for a plan file under `.plan/<name>.md` for behaviour changes; this plan is that file (set its status line in `.plan/README.md`).

## Steps

### Step 1: Write the failing tests first

In `recipes.unit.test.ts` replace the body of the first test in `describe('the Invite trigger')` so that, when a Discover id is given (both branches, note and no note), the Invite graph holds exactly two triggers: the `trigger.workflow` naming `discover-1` and a `trigger.schedule` at `shift(time, 4)` (with the default `09:00` that is `13:00`) in the campaign's time zone; both wire to `people`; `validateGraph` returns no error level entries; and `scheduleOf(graph)` is not null. Keep the second test (no Discover id: one schedule at `shift(time, 1)`, unchanged).

In `campaignStarter.service.integration.test.ts` add one case: after `createOutreach`, switching the Invite workflow on (`WorkflowService.update(userId, inviteId, { enabled: true })`) gives it a non-null `nextRunAt`, and `WorkflowService.listeners(userId, discoverId)` (the call `WorkflowTriggerService.startAfter` makes) still returns the Invite workflow id. The file already switches every made workflow on with `WorkflowService.update(userId, id, { enabled: true })` (line ~78): extend that block rather than starting a new setup.

**Verify**: `pnpm --filter @automatedLinkedIn/contracts exec vitest run src/recipes` → the changed case FAILS (one trigger found, two expected).

### Step 2: Add the daily clock

In `buildOutreach`, make the Invite graph start from two triggers when `discoverId` is given:

- keep `node('trigger', 'trigger.workflow', 0, 0, { workflowId: discoverId })` with id `trigger`;
- add `node('clock', 'trigger.schedule', 0, 1, { every: 'day', at: shift(time, 4), timeZone })` (reuse `schedule(shift(time, 4))` and give it the id `clock`: build it with `node('clock', ...)` or spread `{ ...schedule(...), id: 'clock', position: ... }`, whichever keeps the builders' style; the id must be `clock` and unique in the graph);
- add `['clock', 'people']` to both Invite `wire([...])` lists next to `['trigger', 'people']`.

When `discoverId` is undefined nothing changes (one schedule trigger at `shift(time, 1)`).

Why `shift(time, 4)`: after Discover has had time to finish and chain, and before the warm-up at `shift(time, 5)`. On a normal day the chained run has used the day's room and this run finds nobody; it is a quiet backstop.

**Verify**: `pnpm --filter @automatedLinkedIn/contracts exec vitest run src/recipes` → all pass, including the changed case. Then `pnpm --filter @automatedLinkedIn/contracts build:lib` → exit 0.

### Step 3: Integration and gate

**Verify**:
- the Starter integration command above → all pass, including the new case;
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` → exit 0.

## Test plan

- Contracts unit: the changed Invite-trigger case (two triggers, both branches, wiring, `validateGraph` clean, `scheduleOf` set) and the kept no-Discover case. Pattern: the file's own `describe('the Invite trigger')`.
- Brain integration: one case in `campaignStarter.service.integration.test.ts` (next run set, listener kept).
- Nothing is run on live LinkedIn: the plan changes when a workflow starts, not what a block does.

## Done criteria

- [ ] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` exits 0
- [ ] `pnpm --filter @automatedLinkedIn/contracts exec vitest run src/recipes` passes and the Invite graph with a Discover id has a `trigger.workflow` and a `trigger.schedule`
- [ ] the Starter integration test passes
- [ ] `git status` shows only the three in-scope files (plus the plan index)
- [ ] `.plan/README.md` status row updated

## STOP conditions

- `validateGraph` returns an error for a graph with a `trigger.workflow` and a `trigger.schedule`, or `WorkflowService.update` refuses to switch such a workflow on: stop and report the sentence (a rule I did not find; do not edit `workflow.ts` to get around it).
- A second Invite run on the same day queues a person the first run already queued (the integration or an engine test shows a duplicate invite for one person): stop and report; the `QUEUED` mapping in `peopleIndex.ts` would be wrong.
- `buildOutreach` no longer takes `discoverId` or the Starter no longer builds Discover first (the drift check shows it): stop and report.

## Maintenance notes

- Existing campaigns keep their saved graph, so they still wait for Discover. For each one the owner can open the Invite workflow, add a "Schedule" trigger (every day, about four hours after Discover's time), and draw it to the "People" block. This is a manual step; no data change is part of this plan.
- A normal day now shows one extra Invite run with nothing to do. The cron monitor and run lists will show it; it is expected, not a fault.
- If a later change adds a second finder, the clock stays: Invite works from the waiting people, not from the finder.
- Reviewer: check that both Invite branches (with and without a note) got the second edge, and that the clock is in the campaign's time zone.
