# Pause everything with stop queued cancels queued first messages (#199)

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-06
- Locked by user: yes, 2026-11-06 (all defaults)

## Goal

"Pause everything" with "Also stop queued acts and waiting drafts" must also cancel the queued messages of the campaign's workflows. Today they are `LinkedInReply` rows with no link to their workflow, so they keep going out after a pause (about one every 12 minutes). Source: GitHub issue dharmendrashah/automatedLinkedIn#199.

## Requirements

Confirmed (from the issue):

- A queued reply of a workflow in the campaign is cancelled by Pause with stop queued; a queued reply of another workflow is not.
- The column is additive and nullable (migration), and the reply row records the workflow, run and block that queued it, as the other queues do (`PostAct`, `LinkedInInvite`, `Draft`).
- Integration test: a queued reply of a campaign workflow is cancelled, one of another workflow is not.

Open questions (answered 2026-11-06 with the defaults in brackets, kept for the record):

- Q1. How is a cancelled queued reply recorded? (A) state `FAILED` with the fixed sentence "Cancelled: its campaign was paused with stop queued." [recommended: no enum change, no UI change, the owner sees it as not sent and can dismiss it]. (B) a new state `CANCELLED` like `PostAct`, `LinkedInInvite` and `Draft` [needs an enum migration and changes in `conversationReply.ts` and the Unibox].
- Q2. Also record the origin on replies in a conversation (`replyToConversations`, which calls `LinkedInReplyService.send`), not only first messages? [recommended: yes, same queue and same gap].
- Q3. Change the Campaign page label "Also stop queued acts and waiting drafts" to name messages too, for example "Also stop queued acts, invites, drafts and messages"? [recommended: yes, one line in `apps/body/src/pages/Campaign.tsx`].
- Q4. Replies queued before the migration have no origin and still go out after a pause. Accept, and say so in the outcome? [recommended: accept; they cannot be matched to a campaign reliably].
- Q5. A reply already `SENDING` is not cancelled (its words are already being typed), same as the other queues. Accept? [recommended: yes].

## Scope and non-goals

- In scope: `LinkedInReply` origin columns and migration; origin passed from the two workflow reply blocks; `CampaignService.pause` cancels queued replies with `stopQueued`; tests; the Campaign page label (if Q3 yes).
- Out of scope: cancelling a reply already `SENDING`; the Unibox display of a cancelled reply beyond what Q1 gives; backfilling old rows; the other queues (already handled); changing Resume.

## Approach

- [x] 1. Tests first:
  - `campaign.service.integration.test.ts`: a queued reply of a campaign workflow is cancelled with `stopQueued`; one of another workflow, one `SENDING` and one `SENT` are not; without `stopQueued` nothing changes; a second pause changes nothing more.
  - `linkedInReply.service.integration.test.ts`: `start` and `send` store the origin when given, and none when not.
  - `replyBlocks.unit.test.ts`: both reply blocks pass the workflow, run and node ids when they ask.
- [x] 2. Schema: add `originWorkflowId`, `originRunId`, `originNodeId` (nullable `String?`) to `LinkedInReply`, with the same comment style as `LinkedInInvite`. Migration folder `add_reply_origin`, additive only, written by hand from `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, with a timestamp after the newest folder in `apps/brain/prisma/migrations`.
- [x] 3. `LinkedInReplyService.start(userId, accountId, slug, text, origin?)` and `send(userId, conversationId, text, uploadId?, origin?)` store the origin on the row (type `ReplyOrigin = { workflowId; runId; nodeId }`, the same shape as `InviteOrigin`).
- [x] 4. `worker/engine/replyBlocks.ts`: both `ask` closures pass `{ workflowId: run.workflowId, runId: run.id, nodeId: node.id }`.
- [x] 5. `CampaignService.pause` with `stopQueued`: `linkedInReply.updateMany` on `userId`, the campaign's workflow ids, `state: 'QUEUED'`, setting the state and `failure` per Q1.
- [x] 6. Q3 label change in `apps/body/src/pages/Campaign.tsx` (if yes).
- [x] 7. Run `db:migrate:deploy` on the test database, then `db:generate`; `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the root; brain integration tests as `env -u DATABASE_URL pnpm --filter @automatedLinkedIn/brain exec vitest run --no-file-parallelism <full src paths>`.
- [x] 8. `MEMORY.md` (decision, changelog line, and Q4 as an open item), plan Outcome.

## Edge cases and risks

- Race with the sender: `dispatchNext` moves `QUEUED` to `SENDING` in a transaction. The pause update matches `state: 'QUEUED'` only, so a reply that started first is not cancelled, and nothing is sent twice.
- Limits: a cancelled reply is not counted in the daily first-message or reply limits, and it does not block a new first message to the same person (the "already on its way" check counts `QUEUED` and `SENDING` only). Confirm in the integration test.
- Resume: cancelled replies do not come back (same as the other queues).
- Idempotency: the update only touches `QUEUED` rows, so a second pause changes nothing more.
- Security: every update is scoped to `userId` and the owner's own campaign workflows. The fixed sentence names no person and no message text.
- Existing data: the new columns are nullable and not backfilled (Q4). Old queued replies still go out after a pause.
- Dev vs production: the migration is additive; production applies it through the brain migrate init container (`db:migrate:deploy`). No new environment variable.
- Migrations folder names: the newest folders carry future dates relative to the machine clock (gotcha in `MEMORY.md`), so the new folder must sort last; rename it if it does not.
- Docker and CI: no change beyond the brain image rebuild.
- Rollback: revert the code. The nullable columns can stay; nothing reads them after a revert.

## Verification

- Unit and integration tests listed in step 1 green; `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` green.
- Staging: after merge, with a campaign that has one queued first message, press Pause everything with "Also stop queued acts and waiting drafts" and check the reply shows as not sent with the sentence (Q1 A), and that no message goes out after the pause. Not run by the agent.

## Outcome

- Shipped: `LinkedInReply` origin columns and migration `20261106100000_reply_origin` (nullable, additive); `LinkedInReplyService.start` and `send` take an optional `ReplyOrigin`; both reply blocks pass the workflow, run and node; `CampaignService.pause` with stop queued sets the campaign's `QUEUED` replies to `FAILED`; the Campaign page label names messages.
- Deviation from the plan: the failure sentence is the existing `PAUSED` text ("The campaign was paused."), not the sentence written in the plan, so the owner sees the same wording as the other queues.
- Checks: lint (after the autofixer, brain files only), `pnpm ts:check`, `pnpm test:unit:run` (1,836 passed), `pnpm build`; the reply block unit tests (12) and the campaign and reply integration tests (45) pass; migration drift check: no difference.
- Not run: staging. Follow-ups: replies queued before the deploy have no origin and still go out after a pause (Q4); a reply already sending is not stopped (Q5).
