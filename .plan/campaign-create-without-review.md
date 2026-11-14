# Campaign chat: no review, create at the last answer

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-11-14
- Locked by user: yes, 2026-11-14 (the request settles it: "do not do any kind of review just create it directly and land the user the campaign detail page")

## Goal

The Review screen after the last question looks odd and asks the user to confirm what they just answered. Remove it: the last answer makes the campaign at once and opens its detail page. Changes the Review decision in [campaign-outreach-chat-onboarding.md](campaign-outreach-chat-onboarding.md) and [campaign-create-in-chat.md](campaign-create-in-chat.md).

## Current behaviour (read from code)

- [NewCampaign.tsx](../apps/body/src/pages/NewCampaign.tsx) showed a Review block (six stages, capacity sentence, "nothing acts yet", Back and Create) once every step was done, then called `campaign.createOutreach`. "Edit all fields" ended in a Review button.
- The "No" branch already creates an empty campaign at once and opens it.

## Requirements

Confirmed: no review of any kind; create directly; land on the campaign detail page (`/campaigns/:id`).

Decisions I made:

- The last answer (or "Use default" on the last question) makes the campaign. The thread then shows "Creating your campaign" until the page changes.
- "Edit all fields" ends in "Create campaign", which also makes it at once.
- If the create fails, the sentence shows in the thread with a "Try again" button. A name or label already taken goes back to the name question with every answer kept; fixing the name makes the campaign again at once.
- A refresh with all answers stored does not create anything by itself: it shows the thread and "Try again".
- The "Nothing acts on LinkedIn until you switch it on" sentence is gone from the flow; the campaign page shows every stage as off.

## Scope and non-goals

- In scope: `NewCampaign.tsx`, `OutreachChat.tsx`, `StepInput.tsx`, `AllFields.tsx`, `steps.ts` (`isComplete`) and its test.
- Out of scope: backend, contracts, the campaign detail page.

## Approach

- [x] `isComplete(done, form, suggested)` in `steps.ts` with a test.
- [x] `onDone` takes the answer as a patch so the handler can check completeness with the final form before the state updates.
- [x] Remove the Review block and its imports; make the campaign from `finish`/`skip` when complete; never while one is being made.
- [x] Chat: `current` may be null (creating or failed); "Try again". Edit all fields: "Create campaign" and an error line.
- [ ] Walk it on the signed-in page (not done: sign-in needed).

## Edge cases and risks

- Double tap: the composer is replaced by "Creating your campaign" in the same render, and `finish` does nothing while a create is in flight; the backend name check refuses a second campaign anyway.
- Editing an earlier answer after a failure completes the set again and makes the campaign at once on Continue.
- Mistaken answers can no longer be caught on a review page; the campaign is made off and can be deleted from its page.
- Rollback: revert the commit.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root; a preview of the chat; the real create path not run (sign-in needed).

## Outcome

Shipped: no Review step; the last answer creates the campaign and opens its page; failures show a sentence and "Try again". Not run against the real backend or on the signed-in page.
