# Outreach campaign: chat onboarding with a progress bar

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-11-14
- Locked by user: yes, 2026-11-14

## Goal

The `/campaigns/new` page is a long form of ten numbered fields, and a user cannot tell which ones matter or how far they have got. Turn it into a chat window: the assistant asks one question at a time, the user answers in the same thread, and a progress bar shows how far through setup they are. It ends in the existing Review step and the existing `campaign.createOutreach` call, so the backend does not change.

## Current behaviour (read from code)

- [NewCampaign.tsx](apps/body/src/pages/NewCampaign.tsx) is one page with `Form` state (lines 24-41), `answersOf` (lines 43-72) that maps the form to `OutreachAnswers`, a `Field` wrapper (lines 74-80), a review view (lines 102-147), and the form view (lines 149-307).
- The form has ten fields: 1 Name, 2 Problem phrases, 3 Ideal customer, 4 Accounts, 5 Connection note, 6 First message, 7 Warm-up, 8 Schedule, 9 Hand-off, 10 Posts a day. "Review" is disabled while `problems` is not empty.
- Validation is the contract `outreachAnswersSchema` in [recipes.ts](packages/contracts/src/recipes.ts) (lines 30-127). It is the source of truth. Required: name, one to five phrases, a job title or a saved ideal customer, a first message, and a pick needs at least one account. Warm-up comments need at least one text. Note 200, message 4000, comment texts 1250 characters, with `templateProblems` checks. The hand-off must start with `https://`. Time must match `HH:MM`.
- Submit: `trpc.campaign.createOutreach` in [campaign.ts](apps/brain/src/trpc/api/resolvers/campaign/campaign.ts) (line 105), which calls `CampaignStarterService.createOutreach` ([campaignStarter.service.ts](apps/brain/src/database/campaignStarter.service.ts)). That service re-parses the input, refuses a duplicate name or label with a `ConflictError`, and removes what it made if a step fails part way.
- Suggested posts per day comes from `capacityOf(accounts, 1).suggestedPosts` ([recipes.ts](packages/contracts/src/recipes.ts) line 145). It depends on how many accounts are used, so it changes when field 4 changes.
- The form state has `sizes` and `industries`, which have no input on the page. They are always empty.

## Requirements

Confirmed (from the owner's request):

- Convert `/campaigns/new` to a chat window.
- Show a progress bar.
- Guide the user through setting up an outreach campaign.

Assumed (the owner can change these before lock):

- One question at a time. Each question is an assistant message, and the answer appears as a user message in the same thread. The input for the current question sits under the thread.
- All ten fields are asked, in the order of the form. Fields 1, 2, 3 and 6 are required. Fields 4, 5, 7, 8, 9 and 10 each have a default and a "Use default" action.
- Progress is the number of steps done out of eleven (ten questions plus Review). A skipped step counts as done.
- The Review step reuses the existing review block unchanged (the blocks, capacity sentence, "nothing acts yet" line, Back and Create).
- No live AI or LLM. The "chat" is a scripted, deterministic flow.
- The route `/campaigns/new` stays. The page is reached from the Campaigns dialog and from [WorkflowNew.tsx](apps/body/src/pages/WorkflowNew.tsx), and both keep working.
- No backend, contract, or database change.

## Design

Layout (follows the repo rule: the page root is `grid w-full gap-4 px-4 lg:px-6`, no `max-w-*` on the page):

- Header: title "New outreach campaign", the existing one-line intro, and a progress bar with the text "Step 3 of 11".
- Thread: a scrollable list of bubbles. The assistant bubble is left-aligned with a short question and an optional hint line. The user bubble is right-aligned with the answer in plain words, for example "Phrases: 3" or "Every signed-in account". Bubble text wraps at about 80% of the width on mobile.
- Input area (sticky to the bottom of the thread on mobile): the input for the current step only. Text step: `Input`. Phrases and job titles: `ChipsInput`. Accounts: radio plus, for Pick, checkboxes. Warm-up: checkboxes plus a textarea when comments are on. Time: `Input type="time"` and a timezone field. Posts a day: number input with the suggestion. Each step has Continue, and an optional Skip (which uses the default) for optional steps.
- Errors: a step's own problems appear under its input and block Continue. Nothing is sent to the server until Review.
- Progress bar: the `Progress` component in [progress.tsx](apps/body/src/components/ui/progress.tsx), with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and a visible label.
- Motion: the assistant message appears after a short delay (about 300 ms). It is disabled when `prefers-reduced-motion` is set.
- Escape hatch: a link "Edit all fields" that opens the current form, if the owner keeps it (open question 4).

Step model (a pure module, no React, so it can be unit tested):

- An ordered list of steps with `id`, `required`, `default`, and the schema slice it validates.
- `answersOf(state, suggested)` moves out of `NewCampaign.tsx` into the module, so the page and the chat share one mapping.
- `progressOf(state)` returns the done count and the total.
- `nextStep(state)` returns the first step not yet answered or skipped.

## Approach

- [x] Move `Form`, `answersOf`, and the defaults into a pure step module next to the page (for example `apps/body/src/components/campaigns/outreach-chat/steps.ts`). Import it from `NewCampaign.tsx`. Do not duplicate the mapping.
- [x] Write `steps.unit.test.ts` next to it. Cover: the next unanswered step after a skip, the progress count for skipped and answered steps, the suggested posts changing with the picked accounts, an empty time and an empty posts-per-day value being rejected, and a hand-off URL without `https://` being rejected. Do not test constants or trivial mapping.
- [x] Build the chat UI in `apps/body/src/components/campaigns/outreach-chat/` (thread, bubble, step input, progress). Reuse `ChipsInput`, `Checkbox`, `Input`, `Textarea`, `Button`, `Progress`. Do not edit `apps/body/src/components/ui/*`.
- [x] Rewrite `NewCampaign.tsx` to render the chat. Keep the Review block and the `create` mutation and its navigation to `/campaigns/:id` unchanged.
- [x] Remove the hand-off hint "Also send it to an address (optional)" unless open question 5 says otherwise. Fix the message hint "Written by AI comes with the next step", which names a feature not on this page.
- [x] Replace the `max-w-2xl` on the old `Field` with the chat's own width, so the page follows the no-`max-w` rule.
- [x] Accessibility: the thread is `role="log"` with `aria-live="polite"`. Focus moves to the input of each new step. Enter submits a text step. Every control has a label. Colour is not the only signal.
- [x] If open question 3 says yes: keep the answers in `sessionStorage` under one key for this page, and clear it after a successful create or on "Start over".
- [ ] Check the page in a browser (not done: sign-in needed, see Outcome) at 375 px and 1440 px, light and dark, and with keyboard only. Sign-in may be needed; if a signed-in session is not available, say so.
- [x] Run the root gate (below). Update this plan (status `done`, Outcome), add one `MEMORY.md` changelog line, and commit with a conventional message and the Copilot trailer.

## Edge cases and risks

- Zero signed-in accounts: the accounts step must not block. The capacity sentence already says "No account is signed in, so nothing can be sent yet. You can still create the campaign." The chat repeats that in plain words at field 4.
- Accounts still loading, or the request fails: the accounts step waits for the query and shows "Loading accounts". On error it falls back to "Every signed-in account" and says so. It must not show an empty list as "no accounts".
- Ideal customer list fails to load: only "describe a new one" is offered. The step must not be stuck on a failed query.
- Suggested posts per day changes when accounts change. If the user has typed a value, keep it. If not, follow the suggestion. Today's form stores `null` until typed (`postsPerDay: number | null`), so keep that rule.
- Number field: `Number('')` is `0`, which fails the schema with `min(1)`. The step must show the problem instead of storing 0.
- Time field: a cleared `type="time"` input gives `''`, which fails `clock`. Show "Write a time like 09:00."
- Timezone: free text, only `max(64)` in the schema. An unknown zone passes validation and may fail later in the scheduler. Check the value against `Intl.supportedValuesOf('timeZone')` in the step, or make it a select. Not verified in the scheduler code yet.
- Hand-off: must start with `https://` and be at most 500 characters. An empty value is allowed.
- Templates: the note, the message, and each comment text go through `templateProblems`. Show those messages under the step, not only at Review.
- Duplicate name or label: the backend refuses with `ConflictError`. The error must return the user to the name step with their answers kept, not start over.
- Double submit: `create.isPending` must disable Create. A double click on Create must create one campaign.
- Failure part way: the backend already removes what it made, so a retry is clean. The chat must not show a success message until the mutation resolves.
- Refresh mid-chat: without persistence (open question 3) all answers are lost. With `sessionStorage`, stored answers may be stale (ICP deleted, account removed). Re-check the saved ICP and account ids on load and drop any that no longer exist.
- Account removed from a picked list: the pick must drop the id, or the schema accepts an id the backend does not own. Check against the list on each render.
- Hidden state: `sizes` and `industries` are in `Form` with no input. They stay empty. Keep it that way or remove them, so nobody adds an input later and forgets the mapping.
- Reduced motion and long threads: the thread scrolls to the newest message. Do not animate on every render.
- Mobile at 375 px: the input area must not cover the current question. The progress bar must not wrap into two lines.
- Security and secrets: no tokens, emails, or account data are logged. Account emails are shown only in the picker, as they are today.
- Dev vs production: the same code path. No Docker or CI impact. No new dependencies.
- Existing data: none. Campaigns created by this flow are the same as today.
- Rollback: revert the commit. The old form returns, and no data changes.

## Decisions (locked 2026-11-14)

1. Chat style: one question at a time. Options (for example saved ideal customers, "Every signed-in account") are buttons to select. Typed answers go in the chat composer at the bottom of the window.
2. All ten questions in order. Optional steps (4, 5, 7, 8, 9, 10) have "Use default", which is a skip. Required steps (1, 2, 3, 6) have no skip.
3. Answers persist across refresh in `sessionStorage`. Cleared after a successful create and on "Start over".
4. The old form stays as an "Edit all fields" link. It edits the same answers, so switching between chat and form loses nothing.
5. The hand-off email hint is removed. No email field is added.
6. Commit to `feat/campaign-list-detail-icons` (PR #220).

Motion: the thread appears without a delay. A scripted delay adds nothing for the user, so this deviates from the Design section above; it is recorded in Outcome.

## Scope and non-goals

- In scope: the `/campaigns/new` page, a pure step module and its unit test, the chat UI components in `components/campaigns/outreach-chat/`, and the hint text fixes above.
- Out of scope: any backend, contract, or database change; the Campaigns list and detail pages; the Review block's content; the workflow canvas; a live AI or LLM assistant; any edit to `components/ui/*`.

## Verification

- Unit: `pnpm test:unit:run` with the new `steps.unit.test.ts` passing.
- Root gate from the repo root: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`. Use `export PATH="$HOME/Library/pnpm/bin:$PATH"` if pnpm is not on PATH.
- Browser: walk the whole chat at 375 px and 1440 px, light and dark, keyboard only, and a create that fails with a duplicate name. Then one full successful create, and check the campaign has six switched-off workflows.
- Prettier: run `pnpm exec prettier --check` on each changed file. Prettier was already failing for `Campaigns.tsx` before, so check the new files specifically.

## Outcome

Shipped: `/campaigns/new` is a ten-question chat with a progress bar. Files: `components/campaigns/outreach-chat/` (`steps.ts`, `draft.ts`, `answer-text.ts`, `StepInput.tsx`, `OutreachChat.tsx`, `AllFields.tsx`) and a rewritten `pages/NewCampaign.tsx` (Review block and mutation unchanged). Unit tests: `steps.unit.test.ts`, `draft.unit.test.ts`. Root gate (`lint`, `ts:check`, `test:unit:run`, `build`) passes. No backend, contract or `components/ui` change.

Deviations:
- No scripted delay before the assistant message (decision 1 of the lock).
- Review is reached by the same rule as the steps: every step done and the whole answer valid. A step whose answer stops holding is asked again.
- "Back" on Review reopens the last question; "Edit" on a user bubble reopens that question and the chat returns to where it was.
- The hand-off question reads "Should the hand-off also go to a web address?"; the old "Also send it to an address" hint and "Written by AI comes with the next step" were removed. `sizes` and `industries` were dropped from the form state.
- Time zone is checked with `Intl.DateTimeFormat` (accepts any IANA name and `UTC`), not a list.

Redesign (2026-11-14, owner feedback "looks very weird", reference: screensdesign.com AI chat onboarding examples): the page header, intro and link row are gone (the site header already names the page). The chat fills the window under the header (`h-[calc(100svh-var(--header-height))]`, layout padding cancelled): a thin progress row with a "..." menu (Edit all fields, Start over, Start a single workflow), a thread that scrolls by itself, and a composer fixed at the bottom. Choices are tap chips above the composer (saved customers, accounts, "Use default", "Use N for M accounts"); typed answers use a field and a round send button (Enter sends, Shift+Enter is a new line in text areas). Checked in a throwaway preview harness (deleted), not on the real signed-in page.

Follow-ups:
- Not run in a browser: the local sign-in needs credentials. Walk it at 375 px and 1440 px, light and dark, with the keyboard, then a duplicate name, then one real create (six switched-off workflows).
- Whether the scheduler accepts every zone `Intl` accepts is still unchecked.
