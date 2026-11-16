# Plan 007: One "Start" action turns on finding and connecting for a campaign, so a new campaign does something the first day

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3ce071d..HEAD -- apps/brain/src/database/campaign.service.ts apps/brain/src/database/campaign.service.integration.test.ts apps/brain/src/trpc/api/resolvers/campaign apps/body/src/pages/Campaign.tsx apps/body/src/components/campaigns/go-live.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (it arms invites on a real LinkedIn account; the owner must say so in a confirm step)
- **Depends on**: none (works best after `.plan/006-invite-runs-daily-from-the-waiting-people.md`, but does not need it)
- **Category**: direction (simplify the way in)
- **Planned at**: commit `3ce071d`, 2026-11-16

## Why this matters

After the campaign chat, a campaign sends nothing. Every workflow is created switched off and every block that acts on LinkedIn has "Act for real" off. To connect with the first lead the owner must: open the Workflows tab, switch on Discover, switch on Invite, open the Invite canvas, find the two Send invite blocks (one with the note, one without) and switch "Act for real" on in each. A founder with no time to learn a tool stops somewhere in that list, and a campaign that is "created" never starts. After this plan the campaign page has one "Start" action: it switches on Discover and Invite and, only when the owner confirms it, arms the invites. The safety rule stays: nothing is armed without an explicit yes, the weekly and daily limits and the platform kill-switch are untouched.

## Current state

- `apps/brain/src/database/campaign.service.ts` — `CampaignService` (static class, every call scoped to the owner). `pause` (line ~131) switches the campaign's enabled workflows off through `WorkflowService.update(userId, workflowId, { enabled: false })` and records which ones; `resume` (line ~208) switches them back on. `workflowsOf(userId, campaignId)` (line 113) returns `{ id, name, stage, enabled }` ordered by creation. There is no "start".
- `apps/brain/src/database/workflow.service.ts` — `WorkflowService.update(userId, id, changes, { expectedUpdatedAt })` (line ~419): `changes` is `{ name?, graph?, qualifyScore?, maybeScore?, maybeEnabled?, enabled? }`. Switching on with `enabled: true` throws `ConflictError` when the graph has a problem or no automatic trigger. A stale `expectedUpdatedAt` throws `ConflictError(CHANGED_ELSEWHERE)`. `readGraph(value)` (exported) parses a saved graph.
- `apps/brain/src/trpc/api/resolvers/campaign/campaign.ts` — the router. Pause and resume are written as:

```ts
resume: ownerProcedure
   .input(z.object({ id }))
   .mutation(async ({ ctx, input }) =>
      present(await orConflict(CampaignService.resume(ctx.user.id, input.id)), MISSING)
   ),
```

  `orConflict` turns a `ConflictError` into a tRPC error with its sentence; `present(value, MISSING)` answers not found for null. Its tests are in `campaign.unit.test.ts` next to it.
- How "Act for real" works: a block whose `config.actForReal` is not `true` holds back and records `NOT_ASKED` with the reason "Act for real is off" (`apps/brain/src/worker/engine/actFrame.ts:67`). `actSettings = { actForReal: z.boolean().default(false) }` is in `packages/contracts/src/workflow.ts:319`. The only place the owner can set it today is the block's settings panel on the canvas (`apps/body/src/components/workflows/block-settings.tsx:113` and `:254`). Changing the words of an act block switches it off again (`disarms`).
- The Starter recipe (`packages/contracts/src/recipes.ts`, `buildOutreach`) names the Invite send blocks `send` (no note) or `withNote` and `withoutNote` (note); their type is `account.sendInvite`. The Discover workflow has stage `DISCOVER`, the Invite workflow stage `INVITE` (`CampaignStage` in `packages/contracts/src/campaign.ts`). The Starter tests assert that every act block starts with Act for real off; that does not change.
- `apps/body/src/pages/Campaign.tsx` — the campaign page. The header card has the Pause/Resume button (lines ~234-243: `paused ? <Button ... Resume> : <Button variant="outline" ... Pause everything>`), driven by `pause` and `resume` mutations (lines 146-157) that call `refresh()` and toast `readableError(error)` on failure. `workflows` (from `campaign.overview`) holds `{ id, name, stage, enabled }`. The Go live card (`apps/body/src/components/campaigns/go-live.tsx`, rendered at line ~401 inside the Workflows tab) lets the owner preview and switch on each stage one by one. `campaignListStateOf({ workflows, paused, since })` in contracts gives `NOT_STARTED` when a campaign has workflows, is not paused and has never run.
- Conventions: services are static classes in `apps/brain/src/database`, one per aggregate, with an integration test beside them (`campaign.service.integration.test.ts`); resolvers are thin; the body shows brain's sentence with `readableError(error)`; shadcn `Dialog` and `Checkbox` are used (see the pause dialog in `Campaign.tsx` at line ~444 for a confirm dialog with a checkbox).

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Brain unit tests | `pnpm --filter @automatedLinkedIn/brain exec vitest run --dir src src/trpc/api/resolvers/campaign` | all pass |
| Brain integration (needs Postgres) | `pnpm --filter @automatedLinkedIn/brain exec vitest run --config vitest.integration.config.mts --dir src src/database/campaign.service` | all pass |
| Gate | `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` | exit 0 |

Run from the repo root (a login shell, `zsh -lic '...'`, if `pnpm` is not found). Prettier first, then `eslint --fix` (brain and contracts only; the body is linted with oxlint). Run brain vitest with `--dir src`.

## Scope

**In scope**:
- `apps/brain/src/database/campaign.service.ts` (add `start`)
- `apps/brain/src/database/campaign.service.integration.test.ts` (new cases)
- `apps/brain/src/trpc/api/resolvers/campaign/campaign.ts` and `campaign.unit.test.ts` (add `start`)
- `apps/body/src/pages/Campaign.tsx` (the Start button and its confirm dialog)
- `apps/body/src/components/campaigns/start-dialog.tsx` (create; keep `Campaign.tsx` from growing)

**Out of scope**:
- The recipe, the blocks, every limit, `PlatformSettingService`, and the engine: `start` only flips switches the owner could flip by hand.
- Warm up, First message, Hand off and No answer stay as they are: `start` leaves them alone (the Go live card still handles them).
- The canvas and `block-settings.tsx`.
- A "stop" action: `pause` already exists.

## Git workflow

- Branch: `feat/campaign-start`. Conventional commit, e.g. `feat: start finding and connecting for a campaign with one action` plus the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`. Never put a literal `!` in a commit message.
- Do NOT push or open a PR unless the operator told you to.
- The repo asks for a plan file under `.plan/<name>.md` for behaviour changes; this plan is that file.

## Steps

### Step 1: Write the failing tests first

`campaign.service.integration.test.ts` (real Postgres; make the campaign with `CampaignStarterService.createOutreach`, as `campaignStarter.service.integration.test.ts` does, or read how this file already makes one):
- `start(userId, id, { sendInvites: true })` returns `{ switchedOn: 2, armed: N }` where N is the number of `account.sendInvite` nodes in the Invite graph (1 without a note, 2 with); Discover and Invite are enabled; every `account.sendInvite` node of the Invite workflow has `config.actForReal === true`; the other four workflows are still off and no other block is armed (assert the Warm up, First message, and every other node in the Invite graph have no `actForReal: true`).
- `start(userId, id, { sendInvites: false })` enables the two workflows and arms nothing (`armed: 0`).
- Calling `start` twice gives the same state and the same answer shape (`switchedOn: 0` the second time).
- A paused campaign (`pausedAt` set) is refused with a `ConflictError` whose sentence says to resume it first, and nothing changes.
- A campaign with no Invite workflow (an empty campaign) is refused with a `ConflictError` ("This campaign has nothing to start.").
- A stale save is not overwritten: change the Invite workflow's `updatedAt` between the read and the write (for example update its name in a hook or call `WorkflowService.update` from the test inside a mocked `workflowsOf`; if that is awkward, assert instead that `start` passes `expectedUpdatedAt` by spying on `WorkflowService.update`) and expect a `ConflictError`, not a silent overwrite.
- If switching on the Invite workflow fails (it has a problem), the Discover workflow that this call switched on is switched off again and the error reaches the caller. The same holds when the arming save is refused as stale.

`campaign.unit.test.ts`: `campaign.start` calls `CampaignService.start` with the owner's id, the id and `sendInvites`, maps a `ConflictError` to a tRPC `CONFLICT` error with its sentence (`orConflict` in `apps/brain/src/trpc/api/resolvers/owned.ts`), answers not found for null, and refuses an anonymous caller (`UNAUTHORIZED`).

**Verify**: both commands above → the new cases FAIL (no `start`).

### Step 2: `CampaignService.start`

Add to `CampaignService`:

```ts
// Switches on what finds and connects (the Discover and Invite workflows) and, only when asked, arms the Send invite blocks.
// The other stages and every limit are untouched. Safe to call again.
public static async start(userId: string, id: string, options: { sendInvites: boolean }) { ... }
```

Behaviour, in this order:
1. `get(userId, id)` → null returns null.
2. A campaign with `pausedAt` set throws `ConflictError('This campaign is paused. Resume it first.')`.
3. From `workflowsOf`, take the workflow with stage `DISCOVER` and the one with stage `INVITE` (first of each). With no `INVITE` workflow throw `ConflictError('This campaign has nothing to start.')`. A campaign without `DISCOVER` is allowed (Invite alone works from the waiting people).
4. Switch on each of those that is not enabled, Discover first, with `WorkflowService.update(userId, workflowId, { enabled: true })`. If a later switch-on, or the arming in step 5, throws, switch the ones this call turned on back off (`{ enabled: false }`) and rethrow, so a failure leaves nothing half done.
5. When `options.sendInvites`: load the Invite workflow (`WorkflowService.get`), `readGraph(current.graph)`, set `config: { ...config, actForReal: true }` on every node of type `account.sendInvite` whose `actForReal` is not already `true`, and when any changed save with `WorkflowService.update(userId, inviteId, { graph }, { expectedUpdatedAt: current.updatedAt })`. Count the nodes now armed in `armed`.
6. Return `{ switchedOn, armed }`.

Do not touch `pausedWorkflowIds`, other stages, or other node types. Reuse `readGraph` and the existing imports; do not write a second graph parser.

**Verify**: the integration command above → all pass.

### Step 3: The procedure

In `campaign.ts` add, beside `pause` and `resume`:

```ts
// Switches on finding and connecting; `sendInvites` arms the Send invite blocks (the owner confirmed it on the page).
start: ownerProcedure
   .input(z.object({ id, sendInvites: z.boolean() }))
   .mutation(async ({ ctx, input }) =>
      present(await orConflict(CampaignService.start(ctx.user.id, input.id, { sendInvites: input.sendInvites })), MISSING)
   ),
```

(Match the exact helpers in the file; `sendInvites` has no default so the caller must say it.)

**Verify**: `pnpm --filter @automatedLinkedIn/brain exec vitest run --dir src src/trpc/api/resolvers/campaign` → all pass.

### Step 4: The page

Create `apps/body/src/components/campaigns/start-dialog.tsx`: a button "Start finding and connecting" and a `Dialog`. The dialog says in plain words what will happen: "Find leads and Connect will run every day. Nothing is sent until you tick the box below." and a `Checkbox` "Send connection requests for real" (unticked by default) with one line under it: "Your accounts' daily and weekly limits still apply. Run a preview first from the Workflows tab if you want to see what it would do." Its confirm button calls `trpc.campaign.start.useMutation` with `{ id, sendInvites: ticked }`, closes on success, toasts `readableError(error)` on failure, and the page calls `refresh()` on success. After success with the box unticked, toast: "Started. Nothing is sent until you arm the invites on the Workflows tab." With it ticked: "Started. Connection requests will go out within your limits."

In `Campaign.tsx` show the button in the header card's `CardAction`, in place of "Pause everything" while the campaign is not paused AND has an `INVITE` workflow AND neither the `DISCOVER` nor the `INVITE` workflow is enabled (use `workflows.some(...)`, the stage strings from `STAGE_LABELS` keys). Once something is on, the existing "Pause everything" button shows as today. Do not change the Workflows tab or the Go live card.

**Verify**: `pnpm ts:check` → exit 0 and `pnpm lint` → exit 0, 0 warnings (the body is linted with oxlint; a component file that exports a non-component warns, which fails lint).

### Step 5: Gate

**Verify**: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` → exit 0, and the brain integration command from Step 1 passes.

## Test plan

- Brain integration: the seven cases of Step 1 (armed counts, unarmed, idempotent, paused, nothing to start, stale save, rollback on a failing switch-on). Pattern: `campaignStarter.service.integration.test.ts` for making a campaign; `campaign.service.integration.test.ts` for its style.
- Resolver unit: four cases of Step 1. Pattern: the existing pause/resume cases in `campaign.unit.test.ts`.
- Not testable here: the dialog (the body has no DOM test setup). Check it by hand in a browser at 375 and 1440 px: the box is unticked, the confirm button works, and the error sentence shows. State that you did not do this if you cannot.

## Done criteria

- [ ] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` exits 0
- [ ] the brain integration command passes with the new `start` cases
- [ ] `grep -n "start:" apps/brain/src/trpc/api/resolvers/campaign/campaign.ts` shows the procedure; `grep -n "actForReal" apps/brain/src/database/campaign.service.ts` shows only the invite arming
- [ ] no file under `packages/contracts` or `apps/brain/src/worker` changed (`git status`)
- [ ] `.plan/README.md` status row updated

## STOP conditions

- `WorkflowService.update` with a changed `graph` refuses an armed Invite graph, or it does not accept `expectedUpdatedAt` the way described: stop and report the sentence or signature.
- The Invite workflow's send blocks are not of type `account.sendInvite` in a Starter-made campaign (the drift check shows the recipe changed): stop and report the node types.
- You find another place that arms act blocks without the owner's tick (for example a default of `true`): stop and report it; do not change it.
- The owner's wish, if told, is to arm without asking: do not; the confirm step is the safety decision recorded in `.plan/lead-pipeline-p6-campaign-starter.md` ("all act blocks keep Act for real off").

## Maintenance notes

- The arming writes a saved graph, so it is a write with `expectedUpdatedAt`: if the owner is editing the same workflow on the canvas, `start` is refused with the "changed elsewhere" sentence and nothing is half done.
- If the recipe gains another act block in the Invite workflow (a withdraw, a message), decide in review whether `start` should arm it; today only `account.sendInvite` is armed.
- `pause` and `resume` remember which workflows were on; `start` does not touch that list, so Pause then Resume still returns to what was on.
- Reviewer: check that nothing else than `account.sendInvite` nodes got `actForReal: true`, that an unticked box arms nothing, and that a paused campaign cannot be started around its pause.
