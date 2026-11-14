# Unibox: a Positive button in the conversation header

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-11-14
- Locked by user: yes, 2026-11-14

## Goal

The owner can mark a Unibox lead as a positive reply, so it counts in a campaign's revenue pipeline, from the conversation header in one or two clicks. Today the only control is a toggle row inside the Details panel, which is closed by default and easy to miss.

## Current behaviour (read from code)

- `components/unibox/positive-reply.tsx` (`PositiveReply`) shows one toggle button per campaign and the source of each counted reply. It is rendered only in `details-panel.tsx` for a `DIRECT` conversation.
- API already exists (`positiveReply.forConversation`, `mark`, `unmark`): `forConversation` returns `canMark`, `campaigns`, `replies` (state COUNTED or REMOVED, source RULES, AI or MARKED) and `suggestedCampaignId` (campaign of the person's newest invite, else their single campaign label). `mark` is idempotent and makes the reply theirs (source MARKED); `unmark` keeps a REMOVED row so detection never counts the person again.
- The thread header (`thread.tsx`) has: avatar and name, Mark unread, Done, Details; a second row has the account chip, status chip and "Also in N other accounts".
- `mark` needs a campaign. A person in no campaign cannot be counted, and there is no marker in the conversation list.

## Requirements

Confirmed (from the request):

- A visible way to mark the open lead as a positive reply that counts in the pipeline.

Proposed (to confirm below):

- A "Positive" button in the thread header, next to Done. It is a toggle: pressed (green thumbs-up, "Positive") means counted, pressing again removes.
  - One campaign to choose (the suggested one, or the only one): one click marks it and a toast says "Counted in <campaign>" with Undo.
  - More than one candidate and none suggested: the button opens a small popover of campaign buttons (buttons, never a select; several can be on, as in the Details panel). The suggested one is listed first and marked "suggested".
  - Already counted in one campaign: the button shows pressed; a click removes it. Counted in several: it opens the same popover to remove each.
- A green chip "Positive: <campaign>" in the header's second row when counted, with the source on hover (Detected by rules, Detected by AI, Marked by you).
- A small green thumbs-up on the conversation row when the lead is counted, so a positive lead is visible in the list.
- Keyboard: `P` marks or unmarks, added to the shortcuts list and the command palette ("Mark as positive").
- The Details panel section stays as the place for several campaigns and the source lines; both read and write the same data, so they never disagree.
- Hidden for groups and for the sample inbox (`canMark` false), as today.

Answered by the owner (2026-11-14):

1. A lead in no campaign can be marked positive anyway (nullable campaign, a migration). It has no USD, because no worth belongs to it.
2. With several campaigns and none suggested, the button opens a small list of campaign buttons, plus a "No campaign yet" button.
3. The list marker and the `P` shortcut are in this change.

Design that follows from answer 1 (please confirm):

- `PositiveReply.campaignId` becomes optional. A row with no campaign is "unassigned": one per person, state COUNTED or REMOVED, source MARKED. Postgres treats nulls as distinct, so the existing unique `(campaignId, slug)` would not stop duplicates; add a partial unique index on `(userId, slug) WHERE campaignId IS NULL`. The migration is additive (drop NOT NULL, add the index); existing rows are untouched.
- Marking a person for a campaign while an unassigned row exists turns that row into the campaign row (no double count); the same person is never counted both unassigned and in a campaign.
- The pipeline query returns an extra `unassigned` count. The Campaigns page shows one line under the table: "N positive leads are in no campaign. Open the lead and pick one to count them in a pipeline." with no USD. Totals in USD never include them.
- A detected reply with no campaign is still not counted automatically (detection is unchanged); only the owner marks an unassigned lead.
- `PositiveReplyCheck` and detection keep requiring a campaign; no change.

## Scope and non-goals

- In scope: nullable campaign on `PositiveReply` (migration, service, API), header button, header chip, row marker, `P` shortcut and palette entry, toast with Undo, sharing one hook for the Details panel and the header, unit tests for the choice logic, `MEMORY.md`.
- Out of scope: changing detection rules or the AI, the worth per reply, the Campaigns page bar (removed on request), bulk marking from the multi-select bar.

## Approach

- [x] Contracts: `positiveReply` `forConversation` shape gains the unassigned reply (campaignId null); `pipelineOf` ignores it.
- [x] Prisma: `campaignId String?` and the partial unique index; migration written by `prisma migrate diff`, additive, never reset.
- [x] `PositiveReplyService`: `mark(conversationId, campaignId | null)`, `unmark` likewise, `setByHand` converts an unassigned row when a campaign is given, `stats` and `pipeline` count `unassigned`, `forConversation` returns it; integration tests for mark with no campaign, convert to a campaign, unmark, no double count, owner scoping.
- [x] Move the queries and mutations of `PositiveReply` into one hook `usePositiveReply(conversationId)` (data, `toggle(campaignId)`, `counted` map); `PositiveReply` in the Details panel uses it.
- [x] Pure function `positiveAction({ campaigns, counted, suggestedCampaignId })` returning `mark` (one campaign), `unmark`, `choose` (popover) or `none` (reason), with a unit test for each case.
- [x] `PositiveButton` in `thread.tsx` header (toggle button with `aria-pressed`, popover of campaign buttons, toast with Undo through `unmark`/`mark`), and the green chip in the second row.
- [x] Row marker in `conversation-row.tsx`: needs which conversations are counted; reuse one query `positiveReply.pipeline`-style list or add `positiveReply.countedConversations` (to decide at execution: prefer reading existing data, add a small query only if the list does not carry it).
- [x] `P` in `keyboard.ts`, `notices.tsx` SHORTCUTS and `palette.tsx`.
- [x] `MEMORY.md` entry and changelog line; this plan to `done` with Outcome.

## Edge cases and risks

- Double click or a slow network: the mutation is idempotent (`mark` and `unmark` set a state), the button is disabled while pending.
- A reply the app counted by rules or AI, then removed by hand, is never re-counted by detection; marking it again brings it back as MARKED. Same as today.
- Person moves between campaigns: the suggestion follows the newest invite; the owner can still pick any campaign.
- No worth set on the campaign: the count rises, the USD stays empty; the toast says "Set a worth per reply on the campaign page" with a link.
- Keyboard `P` while a text box has focus must not fire (same guard as the other single keys).
- Failure: the error shows in the toast (`readableError`); nothing changes locally until the server answers.
- Group conversations and the sample inbox: no button, no shortcut.
- Migration is additive (drop NOT NULL, one partial unique index). Rollback: revert the commit; a down step would need the unassigned rows deleted first. No new env, no Docker or CI impact.
- Code that reads `PositiveReply.campaignId` as a string (`stats`, `pipeline`, backfill keys `campaignId|slug`) must handle null; the type checker finds them.
- Two quick presses on "No campaign yet": the partial unique index stops a duplicate; the service catches the unique error and answers as marked.

## Verification

- Unit: `positiveAction` cases; keyboard mapping; the hook's toggle choosing mark or unmark.
- Integration tests of `PositiveReplyService` (existing ones for mark, unmark, removed-stays-removed, plus the new unassigned cases above).
- Browser (not possible without a signed-in session, to be said plainly): mark from the header with one and with several campaigns, undo, remove, see the chip and row marker, open Campaigns and see the pipeline change.
- Root gate: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.

## Outcome

Built, committed on `feat/campaign-revenue-pipeline`; not seen in a browser (no signed-in session), not deployed. Gate green: lint, ts:check, unit (brain 1905, body 1214), build, and all integration tests (brain 108 files, 619 tests).

- Migration `20261114180000_positive_reply_no_campaign` (additive): `PositiveReply.campaignId` optional, partial unique index `(userId, slug) WHERE campaignId IS NULL`. Apply with `db:migrate:deploy`.
- Brain: `mark`/`unmark` accept a null campaign; marking a campaign moves an unassigned lead into it (also when detection counts the person, via `count()`); removing an unassigned lead deletes the row; marking no campaign is a no-op when the person is counted in a campaign. `pipeline` returns `unassigned`; new `positiveReply.leads` (slugs counted anywhere) for the list marker; `forConversation` campaigns carry `replyValueUsd`.
- Body: `use-positive-reply.ts` (hook), `positive-action.ts` (the choice, tested), `positive-reply.tsx` (`PositiveButton`, `PositiveChip`, `PositiveMark`, Details section with a "No campaign yet" button), header button and chip in `thread.tsx`, row marker in `conversation-row.tsx`, `P` key and palette entry, a line on the Campaigns page for leads in no campaign.
- Deviation: none from the locked plan. Follow-up: the row marker reads one cached list of slugs; if an owner has thousands of positive leads, page it.
