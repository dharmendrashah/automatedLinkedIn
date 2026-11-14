# Create campaign: one chat, no pop-up

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-11-14
- Locked by user: yes, 2026-11-14

## Goal

"Create campaign" opens a dialog with two choices, and the outreach choice then opens a second screen, the chat. Remove the dialog and make the chat the only way in: it asks the name, then asks whether the campaign runs outreach. "No" makes a blank campaign. "Yes" carries on with the existing outreach questions and ends in the existing Review. Builds on [campaign-outreach-chat-onboarding.md](campaign-outreach-chat-onboarding.md) and replaces [campaign-create-choice-button.md](campaign-create-choice-button.md).

## Current behaviour (read from code)

- [Campaigns.tsx](../apps/body/src/pages/Campaigns.tsx): the "Create campaign" button sets `step` to `choice` and opens a `Dialog`. Choice 1 is a `Link` to `/campaigns/new`. Choice 2 switches the dialog to a name view that calls `trpc.campaign.create({ name })`, invalidates `campaign.list`, then navigates to `/campaigns/:id`. The page also holds the example tooltips (`OUTREACH_EXAMPLES`, `EMPTY_EXAMPLES`, `ExamplesTip`) and the dialog styles; nothing else uses them.
- [NewCampaign.tsx](../apps/body/src/pages/NewCampaign.tsx) is the chat. Its first question is the name. Its steps, answers and persistence are in `components/campaigns/outreach-chat/` (`steps.ts`, `draft.ts`, `StepInput.tsx`, `OutreachChat.tsx`, `answer-text.ts`, `AllFields.tsx`).
- `campaign.create` takes `campaignInputSchema` (`name`, trimmed, 1 to `CAMPAIGN_LIMITS.nameMax`). Both creates refuse a duplicate name or label with a conflict ([campaign.ts](../apps/brain/src/trpc/api/resolvers/campaign/campaign.ts)). The chat already returns to the name question on `CONFLICT`.
- `campaign.createOutreach` does not invalidate `campaign.list` today; the blank create does. [campaign-place.tsx](../apps/body/src/components/workflows/campaign-place.tsx) also uses `campaign.create` and stays as it is.
- The page title for `/campaigns/new` is "New outreach campaign" ([page-title.ts](../apps/body/src/lib/page-title.ts) line 35, tested in `page-title.unit.test.ts`).
- [WorkflowNew.tsx](../apps/body/src/pages/WorkflowNew.tsx) links to `/campaigns/new` ("Start an outreach campaign"). It keeps working, and now lands on the name question.

## Requirements

Confirmed (from the owner's request):

- Remove the "Create campaign" pop-up.
- Merge it into the chat.
- Order: ask the name, then "does it run outreach?". No: a blank campaign. Yes: the outreach flow, which carries on asking.

Assumed (the owner can change these before lock):

- The "Create campaign" button on the Campaigns page becomes a plain link to `/campaigns/new`. Everything else about the page stays.
- Question 2 is "Should this campaign run outreach?" with two tap chips: "Yes, build the outreach workflows" and "No, an empty campaign". The hint carries the old dialog sentences: yes = six workflows, all switched off; no = an empty campaign, add your own workflows later.
- Tapping "No" creates the blank campaign at once (the typed name plus an explicit tap is the confirmation) and opens it at `/campaigns/:id`.
- Tapping "Yes" goes on with the existing questions (problem, ideal customer, accounts, note, first message, warm-up, time, hand-off, posts a day) and the existing Review and create.
- The progress bar reads "Step N of 12" from the start (name, kind, ten outreach questions, Review). A "No" ends the chat early; the bar does not change its total mid-way.
- The example tooltips are dropped. The chips carry the one-line description instead.
- "Edit all fields" (all outreach fields on one page) shows in the menu only after "Yes".
- The greeting no longer says "ten questions": "Hi. Let's set up a campaign. First, a name."
- Page title becomes "New campaign". No backend, contract or database change.

## Decisions (locked 2026-11-14)

1. "No" creates the blank campaign at once.
2. The example tooltips are dropped.
3. Commit to `feat/campaign-list-detail-icons` (PR #220).

## State machine (the implicit one, made explicit)

The chat is a small state machine; today it lives implicitly in `done` plus `nextStep`. This change adds one branch and one terminal, so the states are written down and covered by the pure step module.

- `asking(step)`: the first step not done. States: `name`, `kind`, then the ten outreach steps. A step whose answer no longer validates is asked again.
- `kind` answered `no` -> `creatingEmpty` -> `created` (navigate) | `asking(name)` on conflict (answers kept, sentence shown) | `asking(kind)` on any other error (sentence shown, chips usable again).
- `kind` answered `yes` -> `asking(phrases)` ... `asking(posts)` -> `reviewing` -> `creatingOutreach` -> `created` | `asking(name)` on conflict | `reviewing` on any other error.
- Changing `kind` after answering (Edit on the kind bubble) reopens `kind`; the outreach answers already typed are kept in the draft but not used by "No".
- `nextStep` returns `null` only when `kind` is `yes` and all steps are done; for `no` the chat never reaches it because the create is the end.

## Scope and non-goals

- In scope: the Campaigns header button and removal of its dialog and example tooltips; the `kind` step and branch in the chat; the blank create from the chat (with list invalidation); greeting, progress total, and page title; the unit tests below.
- Out of scope: backend, contracts and database; `campaign-place.tsx`; the campaign detail page; the Review block's content; any edit to `components/ui/*`; a live AI assistant.

## Approach

- [x] Steps module (`steps.ts`): add `kind` as step 2 (`required`, no skip), add `outreach: boolean | null` to `Form` (default `null`), include it in `resetStep` fields, and make `progressOf` total 12. Keep `answersOf` unchanged. `stepProblems('kind')` returns "Choose yes or no." while `null`.
- [x] `draft.ts`: add `outreach` to the stored shape. An older stored draft fails the parse and starts fresh (sessionStorage only, no migration).
- [x] `StepInput.tsx`: a `kind` case with two chips and no typed field. "Yes" sets `outreach: true` and finishes the step. "No" sets `outreach: false` and calls a new `onEmpty` prop.
- [x] `NewCampaign.tsx`: add the `campaign.create` mutation (success: clear the draft, invalidate `campaign.list`, navigate; conflict: reopen `name` with the sentence; other errors: show the sentence on the kind step). Also invalidate `campaign.list` after `createOutreach`. `nextStep` ignores the outreach steps until `outreach` is `true`. Hide "Edit all fields" until then.
- [x] `OutreachChat.tsx` and `answer-text.ts`: greeting copy, the kind answer text ("Yes, outreach" / "No, empty"), and `isPending` disables the chips while creating.
- [x] `Campaigns.tsx`: replace the dialog and its state with a `Button asChild` + `Link to="/campaigns/new"`; delete the dialog imports, `CreateStep`, `CHOICE_CLASS`, `ICON_CHIP`, the example arrays and `ExamplesTip`, and the unused imports. Update the empty-state sentence only if it names the removed pop-up (it does not).
- [x] `page-title.ts` and its test: "New campaign".
- [x] Tests (fewest that prove it): `steps.unit.test.ts` for the kind step (not done until chosen; progress total is 12; `no` leaves the outreach steps unasked) and `draft.unit.test.ts` for the new field. No tests for the chips or copy.
- [x] Root gate.
- [ ] Walk it in a browser (needs a signed-in session): name, No, a blank campaign opens; name, Yes, full outreach create; a duplicate name on both branches. Not done: sign-in needed.
- [x] Fill Outcome, add `MEMORY.md` (decision and changelog; correct the entries that still say the dialog has two choices), and commit with the Copilot trailer.

## Edge cases and risks

- Double tap on "No": `isPending` must disable both chips; the backend name check is the idempotency (a second create is refused with a conflict, never a second campaign).
- Conflict on a blank create: the same sentence and the same return to the name question as the outreach path. The typed name is kept so the user only edits it.
- Non-conflict failure on a blank create (network, 5xx): stay on the kind question, show the sentence, keep the chips usable. Nothing is shown as created until the mutation resolves.
- Refresh after "Yes": the draft keeps `outreach: true`, so the chat resumes at the next question. Refresh after "No": the create already ran and the draft was cleared on success; a refresh while it is in flight can leave `outreach: false` stored, so on load a stored `false` reopens the kind question instead of re-sending.
- Direct visit to `/campaigns/new` and the link from `WorkflowNew.tsx` both start at the name. Bookmarks keep working.
- Draft shape change: an old stored draft is dropped, so someone mid-chat loses answers once. Acceptable (sessionStorage only).
- "Edit all fields" before "Yes": hidden, so the full form cannot create an outreach campaign without the kind answer.
- Name rules differ by path in message only: both use the same 1 to 60 trimmed name and the same label rule, so one name validates for both.
- Progress total 12 while "No" ends at step 2: the bar never reaches 100 percent on the blank path, which is correct (nothing else was asked) but is called out in the Outcome after a look in the browser.
- Mobile at 375 px: two chips with long labels must wrap and not push the composer taller than a third of the screen.
- Examples are removed from the product: lost guidance. Open question 2.
- Security and secrets: none involved. No new dependencies, no Docker or CI impact. Dev and production are the same code path.
- Rollback: revert the commit. The dialog and the previous chat return; no data changes.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root.
- Prettier check on each changed file.
- Browser: both branches, a duplicate name on each, 375 px and 1440 px, light and dark, keyboard only. State clearly if no signed-in session was available.

## Outcome

Shipped: the Create campaign dialog and example tooltips are gone; the Campaigns button links to `/campaigns/new`. The chat has a `kind` step after the name (`Form.outreach`, kind counts as done only after Yes). "No, an empty campaign" calls `campaign.create` with the typed name, invalidates `campaign.list`, clears the draft and opens the campaign; a conflict returns to the name question and any other error shows its sentence in the thread. `createOutreach` now also invalidates `campaign.list`. Greeting no longer says "ten questions"; progress total is 12; "Edit all fields" shows only after Yes; page title is "New campaign". Root gate passes. No backend change.

Deviation: `Form.outreach` is never stored as "No" (the create is the end), so a refresh while a blank create is in flight reopens the kind question instead of re-sending.

Follow-up: not run in a browser (sign-in needed). Status stays `in progress` until both branches and a duplicate name on each are walked.
