# Plan 008: A campaign can be just "find leads and connect": two workflows and nine questions instead of six workflows and thirteen

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3ce071d..HEAD -- packages/contracts/src/recipes.ts packages/contracts/src/recipes.unit.test.ts apps/brain/src/database/campaignStarter.service.ts apps/body/src/components/campaigns/outreach-chat apps/body/src/pages/NewCampaign.tsx apps/body/src/pages/WorkflowNew.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (a recipe, a schema field and the chat flow change; the full six-workflow path must keep working)
- **Depends on**: none (pairs with `.plan/006-invite-runs-daily-from-the-waiting-people.md` and `.plan/007-start-finding-and-connecting-in-one-action.md`)
- **Category**: direction (simplify the way in)
- **Planned at**: commit `3ce071d`, 2026-11-16

## Why this matters

The goal of most owners on day one is: find new leads, connect with them. Today the campaign chat asks thirteen things and builds six workflows. Seven of the thirteen are required, among them "What is the first message?", which only matters after someone accepts. Warm-up, hand-off (a daily file for follow-up), the hand-off web address and "what is one positive reply worth" are all about steps after the connection. A founder who only wants to connect still has to write the first message and tune four later stages, and then sees six workflows (each with schedules and limits) on the campaign page. After this plan the chat asks one new question, "After they accept, should we also message them, warm them up and hand off the silent ones?", and when the answer is No (the default) it skips those four questions, writes no first message and builds only the two workflows that find and connect. The full path stays one answer away.

## Current state

- `packages/contracts/src/recipes.ts`:
  - `outreachAnswersSchema` (line ~28) is a zod object: `name`, `phrases` (1 to 5), `customer` (titles etc.), `accounts`, `note`, `message: z.string().trim().min(1, 'Write the first message.').max(4000)` (required), `warmUp`, `when`, `handOffUrl`, `postsPerDay`, `replyValueUsd`. Its `.superRefine` adds issues for a missing job title or saved customer, an empty `pick` of accounts, `warmUp.comments === 'texts'` with no texts, template problems in `note`/`message`/`warmUp.texts`, and a `handOffUrl` that does not start with `https://`. `export type OutreachAnswers = z.input<typeof outreachAnswersSchema>`.
  - `buildOutreach(input, icpId, discoverId?)` (line 225) parses the answers, builds the Discover graph, the Invite graph (starting on `trigger.workflow` naming `discoverId`, or on a schedule when no id is given), the warm-up graph, the First message graph and two Hand off graphs, and returns `{ campaign, workflows: [Discover, Invite, Warm up, First message, Hand off, No answer] }` (six entries; the `return` is at the end of the function, each entry `{ stage, name, graph }` with names like `` `${answers.name} \u00b7 1 Discover` ``).
  - `RECIPES.outreach.summary` (line ~608): "Find people who post about your problem, invite them, warm them up, message the ones who accept and hand off the rest."
- `apps/brain/src/database/campaignStarter.service.ts` — `CampaignStarterService.createOutreach`: makes the ideal customer, the campaign, then Discover first and every other entry of `buildOutreach(answers, icpId, discoverWorkflow.id).workflows.slice(1)`; it needs no change for a recipe with two entries (it loops over what the recipe returns). The whole thing rolls back on a failure.
- `apps/body/src/components/campaigns/outreach-chat/steps.ts` — pure, unit tested (`steps.unit.test.ts`). `STEPS` is a constant array of 12 steps in this order: `name`, `kind`, `phrases`, `customer`, `accounts`, `note`, `message` (required), `warmUp`, `when`, `handOff`, `posts`, `worth`, each `{ id, required, question, hint, path }`. `Form` (line ~94) holds every answer (`outreach`, `phrases`, `titles`, `locations`, `icpId`, `accountMode`, `accountIds`, `note`, `message`, `reactions`, `comments`, `texts`, `time`, `timeZone`, `handOffUrl`, `postsPerDay`, `replyValueUsd`); `emptyForm(timeZone)` is the starting form; `answersOf(form, suggested)` maps it to `OutreachAnswers`; `FIELDS` lists which Form keys each step owns and `resetStep` ("Use default") puts them back; `stepProblems(id, form, suggested)` filters the schema's issues by the step's `path`; `isComplete(done, form, suggested)` is `STEPS.every(...)`; `nextStep(done)` is the first step not in `done`; `progressOf(done)` uses `total = STEPS.length + 1`. The `kind` step's hint says "Yes: we build six workflows for you, all switched off."
- `apps/body/src/pages/NewCampaign.tsx` calls `nextStep(done)` (line ~75), `isComplete(...)`, `answersOf(...)`, `resetStep(...)`, owns `draft`/`done` state and makes the campaign with `trpc.campaign.createOutreach` as soon as every visible step is answered and valid. `OutreachChat.tsx` renders `STEPS.slice(0, at + 1)` (line ~141) and the progress bar with `progressOf(done)`; `StepInput.tsx` renders each step's input (the `kind` step offers "Yes, build the outreach workflows" and a No that makes an empty campaign); `AllFields.tsx` is the one-page "Edit all fields" form (numbered fields: "6. First message", etc.); `draft.ts` keeps the answers in `sessionStorage` under `outreach-chat-draft` with a zod `draftSchema` whose `form` object lists every Form key and whose `done` entries must be known step ids.
- `apps/body/src/pages/WorkflowNew.tsx:150` repeats the recipe summary in a card ("One form builds six workflows for you.").
- Nothing else needs all six workflows: the later stages only appear as an icon and label (`STAGE_LABELS`, `apps/body/src/components/workflows/workflow-list-cells.tsx`), the Go live card lists whichever workflows exist (`go-live.tsx`), and `CampaignService.pause/resume` act on whatever the campaign holds.
- Design decisions that stay: every workflow is created switched off, every act block has "Act for real" off, the campaign name is the idempotency, and a recipe is a pure description (`.plan/lead-pipeline-p6-campaign-starter.md`).
- Conventions: Prettier then `eslint --fix` for contracts and brain; the body is linted with oxlint (a component file that exports a non-component warns, and warnings fail lint); tests sit beside the code; pure body modules import relatively.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Contracts tests | `pnpm --filter @automatedLinkedIn/contracts exec vitest run src/recipes` | all pass |
| Rebuild contracts | `pnpm --filter @automatedLinkedIn/contracts build:lib` | exit 0 |
| Body chat tests | `pnpm --filter @automatedLinkedIn/body exec vitest run src/components/campaigns` | all pass |
| Starter integration (needs Postgres) | `pnpm --filter @automatedLinkedIn/brain exec vitest run --config vitest.integration.config.mts --dir src src/database/campaignStarter` | all pass |
| Gate | `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` | exit 0 |

Run from the repo root (a login shell, `zsh -lic '...'`, if `pnpm` is not found). Rebuild contracts before running brain or body tests that use a changed contract. Run brain vitest with `--dir src`.

## Scope

**In scope**:
- `packages/contracts/src/recipes.ts` and `recipes.unit.test.ts`
- `apps/brain/src/database/campaignStarter.service.integration.test.ts` (new cases only; the service is unchanged unless a test shows it must change)
- `apps/body/src/components/campaigns/outreach-chat/steps.ts`, `steps.unit.test.ts`, `draft.ts`, `draft.unit.test.ts`, `OutreachChat.tsx`, `StepInput.tsx`, `AllFields.tsx`
- `apps/body/src/pages/NewCampaign.tsx` and `apps/body/src/pages/WorkflowNew.tsx` (copy and the new step only)

**Out of scope**:
- The four later stage graphs, the Discover and Invite graphs, the block catalog, limits, and `capacityOf`.
- The empty-campaign path (`kind` = No) and the campaigns list.
- Adding the follow-up stages to a campaign after it was made (a possible later plan; see Maintenance notes).
- Warm-up is dropped from the simple path; do not move it into Invite.

## Git workflow

- Branch: `feat/find-and-connect-starter`. Conventional commit, e.g. `feat: let a campaign find and connect without the follow-up stages` plus the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`. Never put a literal `!` in a commit message.
- Do NOT push or open a PR unless the operator told you to.
- The repo asks for a plan file under `.plan/<name>.md` for behaviour changes; this plan is that file.

## Steps

### Step 1: Write the failing tests first

`recipes.unit.test.ts` (`answers` at the top of the file already has a message, a note and a warm-up):
- `buildOutreach({ ...answers, followUp: false, message: '' }, 'icp-1', 'discover-1')` returns exactly two workflows with stages `['DISCOVER', 'INVITE']`, names ending `· 1 Discover` and `· 2 Invite`; every graph has no `validateGraph` error and every block setting parses (copy the loop of the existing "no error and settings every block accepts" test); the Invite graph still starts on `trigger.workflow` naming `discover-1`; no node of type `account.sendMessage`, `account.reactToPost` or `output.csv` exists in either graph.
- `outreachAnswersSchema.safeParse({ ...answers, followUp: true, message: '' })` fails with the issue 'Write the first message.' at path `message`; with `followUp: false` and no `message` it succeeds.
- With `followUp` left out, behaviour is unchanged: six workflows and a required message (the existing cases keep passing untouched).

`steps.unit.test.ts`:
- with `followUp: false` the visible steps are `name, kind, phrases, customer, accounts, note, followUp, when, posts` (nine); with `followUp: true` all thirteen, in the order `name, kind, phrases, customer, accounts, note, followUp, message, warmUp, when, handOff, posts, worth`;
- `nextStep(done, form)` skips the hidden steps, `progressOf(done, form)` counts only visible ones plus the final one (`total` is 10 when `followUp` is false, 14 when true), and `isComplete` is true for a form with `followUp: false` and no message once the nine visible steps are done and valid;
- `stepProblems('message', form({ followUp: true, message: '' }), 8)` returns 'Write the first message.'; for `followUp: false` the message step is not visible and `answersOf` produces answers the schema accepts.
- Update the existing assertions that list every step: the `progressOf(['name', 'kind'])` case (`total: 13` becomes 10 for a form with `followUp: false`), the two `all` arrays (the `nextStep`/`progressOf` case and the `isComplete` case) which must gain `'followUp'` after `'note'`, and the `progressOf(all)` expectation (`done`/`current` follow the new list). These are the only existing assertions to change.

`draft.unit.test.ts`: a stored draft that has no `followUp` field still loads (as `false`).

`campaignStarter.service.integration.test.ts`: `createOutreach(userId, { ...answers, followUp: false, message: '' })` makes two workflows (stages `DISCOVER` and `INVITE`, both off), an Invite workflow that listens to the Discover workflow (`WorkflowService.listeners`), and `CampaignStatsService.overview(userId, campaignId, '7d')` answers without throwing.

**Verify**: `pnpm --filter @automatedLinkedIn/contracts exec vitest run src/recipes` and the body command → the new cases FAIL.

### Step 2: Contracts

In `recipes.ts`:
- add `followUp: z.boolean().default(true)` to `outreachAnswersSchema` (true keeps the API and every existing caller as they are);
- change `message` to `z.string().trim().max(4000).default('')` and, in the `superRefine`, add the issue `{ code: 'custom', path: ['message'], message: 'Write the first message.' }` when `answers.followUp && answers.message === ''` (keep the template-problems loop as is);
- in `buildOutreach`, return only `[Discover, Invite]` when `answers.followUp` is false and the six as today otherwise. Build the later graphs only when needed (wrap them, or filter at the return); do not change a graph;
- update `RECIPES.outreach.summary` to: "Find people who post about your problem and connect with them. Optionally message the ones who accept, warm them up and hand off the rest."

**Verify**: `pnpm --filter @automatedLinkedIn/contracts exec vitest run src/recipes` → all pass; then `pnpm --filter @automatedLinkedIn/contracts build:lib` → exit 0.

### Step 3: The chat

In `steps.ts`:
- add `followUp: boolean` to `Form` (`emptyForm`: `false`), `followUp` to `FIELDS` (`followUp: ['followUp']`) and a step after `note`: `{ id: 'followUp', required: false, question: 'After they accept, should we also message them?', hint: 'No: we only find leads and connect with them. Yes: we also write to the ones who accept, warm up the pending ones and hand off the silent ones.', path: 'followUp' }`;
- add `followUp: form.followUp` to `answersOf`;
- add `export const stepsFor = (form: Form) => (form.followUp ? STEPS : STEPS.filter(({ id }) => !FOLLOW_UP_STEPS.includes(id)))` with `FOLLOW_UP_STEPS = ['message', 'warmUp', 'handOff', 'worth']`;
- make `nextStep(done, form)`, `progressOf(done, form)` and `isComplete(done, form, suggested)` use `stepsFor(form)` instead of `STEPS`;
- change the `kind` hint to "Yes: we build the workflows for you, all switched off. No: an empty campaign, and you add your own workflows later."

Update the callers: `NewCampaign.tsx` (`nextStep(done, form)`, the `done` filter, and `makeIfComplete`, which builds its `nextForm`), `OutreachChat.tsx` (render `stepsFor(form).slice(...)`, find `at` in that list, pass `form` to `progressOf`), `StepInput.tsx` (a `followUp` input with two toggle chips, the way the `kind` step does it: "No, just find and connect" first and marked as the usual choice, "Yes, also follow up"; "Use default" means No), `draft.ts` (add `followUp: z.boolean().default(false)` to the stored form so an older draft still loads; the `done` ids still validate against `STEPS`), `AllFields.tsx` (a toggle "Also message the people who accept, warm them up and hand off the rest" above the fields; the First message, warm-up, hand-off address and reply-value fields show only when it is on).

In `WorkflowNew.tsx` update the card text to: "Find people who post about your problem and connect with them. One form builds the workflows for you."

**Verify**: `pnpm --filter @automatedLinkedIn/body exec vitest run src/components/campaigns` → all pass; `pnpm ts:check` → exit 0; `pnpm lint` → exit 0 with 0 warnings.

### Step 4: Integration and gate

**Verify**:
- `pnpm --filter @automatedLinkedIn/contracts build:lib` then the Starter integration command → all pass;
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` → exit 0;
- by hand if a browser is available: `/campaigns/new` with No at the follow-up step shows nine steps and makes two workflows; with Yes it asks the first message, warm-up, hand-off and worth questions and makes six. If you cannot open a browser, say so.

## Test plan

- Contracts unit (3 cases above), body unit (`steps` 3 cases, `draft` 1), brain integration (1 case). Patterns: the existing cases in each file. No test restates a constant.
- The full six-workflow path is protected by the existing recipe and Starter tests staying green untouched, and by the chat tests with only the step-list updates named in Step 1.

## Done criteria

- [ ] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` exits 0
- [ ] the Starter integration test passes, including the two-workflow case
- [ ] `grep -n "followUp" packages/contracts/src/recipes.ts apps/body/src/components/campaigns/outreach-chat/steps.ts` shows the schema field, the step and `stepsFor`
- [ ] no graph body of Discover or Invite changed (`git diff packages/contracts/src/recipes.ts` shows only the schema, the return and the summary)
- [ ] `git status` shows only in-scope files
- [ ] `.plan/README.md` status row updated

## STOP conditions

- The campaign page (`campaign.overview` or the page itself) fails or shows nonsense for a campaign with only Discover and Invite: stop and report which part assumed a later stage; do not add stub workflows.
- `STEPS` is read in a place not listed here (grep `STEPS` in `apps/body/src`) and a hidden step would break it: stop and report the file.
- An existing test fails for a reason other than the step-list updates named in Step 1: stop and report it; do not rewrite tests to pass.
- The owner (if reachable) wants warm-up in the simple path: stop; that changes the trade-off in Maintenance notes.

## Maintenance notes

- A connect-only campaign has no first message, no reply tracking and no hand-off. Warm-up (reacting to the posts of people whose invite is pending) is the one follow-up stage that may help acceptance; it is left out on purpose because it needs the 90/10 control group and the approval flow. Measure acceptance first.
- There is no way yet to add the four follow-up stages to a campaign that was made without them. A later plan could add an "Add follow-up steps" action that calls `buildOutreach` with `followUp: true` and keeps only the four missing workflows; the Starter's name idempotency would need a look.
- `capacityOf` and the posts-a-day question still apply: they size the Find side.
- Reviewer: check that `followUp` defaults to `true` in the schema but `false` in the chat form (the API keeps six workflows; the web asks), and that no hidden step can block `isComplete`.
