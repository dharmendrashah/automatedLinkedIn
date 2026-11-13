# Score against an ideal customer: optional AI judgement

- Status: rejected (2026-11-13, not done; owner asked to focus only on campaign-detail-insights). Was: in progress <!-- draft | locked | in progress | done -->
- Author: Dharmendra Soni
- Created: 2026-11-10
- Locked by user: yes, 2026-11-10 <!-- change to "yes, <date>" only after the user confirms -->

## Goal

The Score against an ideal customer block (`score.icp`) can ask the AI for a second opinion on each person, switched on by a flag that is off by default. The rule score stays the base; the AI judgement only changes a person's score when the flag is on, and it never runs without the flag, without an AI provider, or over the owner's AI limit.

## Requirements

Confirmed by the owner:

- The judgement is an option of the existing Score block, not a new block.
- It is enabled by a flag and disabled by default; a block saved before the flag behaves exactly as now.
- The plan is written first; no code until it is locked.

Decisions (owner, 2026-11-10):

- Q1 Combine: a blend, `final = round((100 - w) / 100 * rules + w / 100 * ai)`, with `aiWeight` (0 to 100, default 30).
- Q2 Fields: everything the rules use, including the name. This sends the name to the AI provider (see Edge cases).
- Q3 Cap: no cap of its own. The AI budget (`AiBudgetService.room`, `previewRoom`) and the wallet floor are the only limits (see Edge cases).
- Q4 Re-judging: a judgement is kept for 30 days per person and ICP, as a full profile read is; a fresh one is paid for only after that. Needs a table (see Scope).
- Q5 Calls: one call per person, sequential inside the step, with the existing 20 second timeout and no retry.

Still open before locking: none. Locked by the owner on 2026-11-10; execution starts on a new branch from `main` (the campaign PR branch is separate).

## Scope and non-goals

- In scope:
  - `packages/contracts/src/workflow.ts`: `score.icp` config gains `aiJudgement` (toggle, default false, advanced) and `aiWeight` (int 0 to 100, default 30); fields with hints; cost hint; the golden snapshot regenerated.
  - `apps/brain/prisma/schema.prisma` and a migration (additive): table `IcpJudgement` (`userId`, `slug`, `icpId`, `fit` 0 to 100, `judgedAt`; unique on `userId`, `slug`, `icpId`). Read for 30 days; a person whose row is newer is not paid for again.
  - The erasure path (`RetentionService`, the person erasure request) deletes a person's `IcpJudgement` rows with the person; a test proves it.
  - `apps/brain/src/core/aiScore.ts` (new): the prompt (the ICP as system text; profile fields quoted as data the model must not obey), the answer schema `{ fit: 0-100 }`, the parse, and the blend. Pure except the model call, which is passed in (so tests use a fake).
  - `apps/brain/src/worker/engine/executors.ts`: `score.icp` calls the judge for the people that pass the rule score only when `aiJudgement` is on; uses `aiConfigured()`, `AiBudgetService.room`, `previewRoom` in previews, and `AiBudgetService.record` per billed call, as `classifyItems` does in `readBlocks.ts`.
  - Tests written first, next to the code (`aiScore.unit.test.ts`, a score integration test with a fake model, a contracts unit test for the defaults and the golden snapshot).
- Out of scope:
  - A separate AI scoring block; `score.signals` and `score.company`.
  - Judging people the rules discard (a disqualified person stays out; the AI never rescues one).
  - A UI beyond the block's fields (the block form already renders fields from the contract).
  - Changing the AI provider, the prompt budget of other blocks, or the AI switch.

## Approach

- [x] 0. Schema: `IcpJudgement` table and additive migration; a test that a judgement older than 30 days is not reused; erasure deletes the rows.
- [x] 1. Contracts: add the two config fields, the defaults and the hints; add a unit test that a block saved before the change parses to `aiJudgement: false`; regenerate the golden snapshot.
- [x] 2. Pure judge: write `aiScore.unit.test.ts` first (blend at 0, 30 and 100; a failed or unparseable answer keeps the rule score; a disqualified person is never judged; the prompt quotes the profile fields and never includes the name or link). Then `aiScore.ts`.
- [x] 3. Executor: integration test first with a fake `callModel` (flag off makes no call; flag on blends and books the cost; a reused judgement within 30 days is not paid for; AI not configured means no call; a provider failure keeps the rule score; the AI budget refusing a call keeps the rule score; a preview books only within its allowance). Then wire `score.icp`.
- [x] 4. Gate: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` and the brain integration suite.

## Edge cases and risks

- Cost (risk accepted by the owner, 2026-11-10): one paid call per person with no cap of its own. Limits are the owner's AI budget, the wallet floor (the step stops paying below it), and the preview allowance. A large run can spend the whole AI budget in one step; the 30-day judgement reuse limits repeat cost, not the first run's cost.
- Personal data (risk accepted by the owner): the name is sent to the AI provider with the other fields (Q2). Logs and run messages still hold no name, link or message text; the step message gives counts only. The provider's data terms apply; confirm they allow this before turning the flag on for a real campaign.
- Failure: a provider error or an answer that does not parse keeps the rule score for that person; the step message counts them. The run is never failed by the AI.
- Prompt injection: the headline, title and comment are untrusted text. They are quoted data inside the prompt, and the model's answer is accepted only as a number 0 to 100.
- Privacy: profile text, including the name, is sent to the configured AI provider (Q2). Logs and run messages hold no name, link or message text; the step message gives counts only.
- Existing data: saved graphs have no `aiJudgement`; the default is off, so their scores do not change. The golden snapshot changes only for the new fields.
- Timing: sequential calls (one per person the rules keep, 20 seconds each at most, with no cap) can make a large step slow; Q5's batching is the fallback if it proves slow.
- Idempotency: a person judged within 30 days for the same ICP is not paid for again; the step message says how many were reused. A changed ICP is a new key, so it is judged again. A profile changed within the 30 days is not re-judged (accepted).
- Erasure: judgements are personal data; erasure must delete them (a test).
- Preview: judged people are capped by the preview allowance, and the preview books its cost like `classifyItems` does.
- Dev vs production: with no AI provider set, the flag has no effect and nothing is called.
- Docker and CI: no new environment variable and no new service.
- Rollback: turn the flag off in the block; no migration is needed.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root.
- `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` after the migration, and `db:migrate:deploy` on the local database.
- `pnpm --filter @automatedLinkedIn/brain run test:integration:run` (the score integration test with the fake model).
- A preview of a Discover workflow with the flag on, on staging, with the AI budget on: the step message shows the judged and kept counts; no money spent beyond the preview allowance.

## Outcome

So far (2026-11-10, local; steps 0 to 4 done; the staging preview is still open):

- Shipped: `IcpJudgement` table and migration `20261110130000_icp_judgement`; erasure deletes a person's judgements (tested); retention prunes judgements older than 30 days; `score.icp` config `aiJudgement` (off by default) and `aiWeight` (default 30) with fields and a cost hint; the pure judge in `core/aiScore.ts`; `worker/engine/scoreJudge.ts`, which judges only the people the rules keep, reuses a judgement kept within 30 days, and keeps the rule score when AI is not set up, the budget or wallet refuses, or the provider fails.
- Gate on this machine: lint, ts:check, unit (all packages), build pass; brain integration 104 files and 587 tests pass.
- Deviations: (a) the migration was written by hand from `prisma migrate diff`, because `db:migrate:dev` asked to reset the local database (an applied migration `20261103100100_block_hooks` was edited); no reset was run; (b) the judging is tested with a unit test that mocks the model and the database, not an executor integration test; the executor wiring is covered only by the existing score tests, which pass with the flag off; (c) the golden snapshot did not change, because it does not record the Score block's config; (d) the canvas shows no cost estimate for the AI judgement, only the cost hint.
- Open: the staging preview with the flag on (verification step); the AI budget and wallet limits are the only cost caps, as the owner accepted.
