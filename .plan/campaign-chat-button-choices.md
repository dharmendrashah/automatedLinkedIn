# Campaign chat: buttons to choose, never a dropdown

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-11-14
- Locked by user: yes, 2026-11-14 (the request settles it: "never use a select components always use buttons for single and multiple options to choose from")

## Goal

In the campaign chat the ideal-customer question shows two typed fields that open a dropdown of suggestions (job titles, places), and other questions use checkboxes, radios and a `<select>`. Replace every choice with buttons: one tap picks, a second tap un-picks, and many can be picked at once. Typed answers stay only where there is nothing to choose from (name, phrases, messages, time, address, number).

## Current behaviour (read from code)

- [StepInput.tsx](../apps/body/src/components/campaigns/outreach-chat/StepInput.tsx): `customer` uses two `ChipsInput` fields with suggestion popups (`TITLES`, `LOCATIONS` in [chip-values.ts](../apps/body/src/components/workflows/chip-values.ts)); `accounts` (pick) and `warmUp` use `Checkbox`.
- [AllFields.tsx](../apps/body/src/components/campaigns/outreach-chat/AllFields.tsx) ("Edit all fields"): a `<select>` for the saved ideal customer, radios for accounts, checkboxes, and the same two `ChipsInput` fields.
- [setting-inputs.tsx](../apps/body/src/components/workflows/setting-inputs.tsx) already has `Chips`, a row of toggle buttons (`aria-pressed`), used by block settings.
- Answers keep their shape: `titles` and `locations` are `string[]`, `accountIds` is `string[]`, `reactions` is a boolean, `comments` is `off | texts`. No backend or contract change.

## Requirements

Confirmed (from the owner's request):

- Choices are buttons, for one option and for many. No select component, no dropdown suggestions.
- Many can be picked at once where more than one makes sense.

Decisions I made (the request leaves them open; change them before or after if wrong):

- Job titles and places show the common values as toggle buttons (first 16 titles, first 14 places of the built-in lists), plus one small "Add your own" field whose Enter adds the value as a picked button. So a title not in the list is still possible, and no dropdown appears.
- The saved ideal customer stays a single choice (buttons, one tap completes the step) next to "Describe a new one".
- Pick accounts: one toggle button per account (email), many at once.
- Warm-up: two toggle buttons, "React to their posts" and "Comment with my texts", any combination; the comment text area appears when the second is on.
- "Edit all fields" gets the same buttons (the `<select>`, radios and checkboxes go).
- The composer area gets a maximum height with its own scroll so many buttons never push the question out of view.
- Phrases (the problem), name, messages, time, time zone, address and posts a day stay typed: there is nothing to choose from.

## Scope and non-goals

- In scope: the chat composer, "Edit all fields", a small `ChoiceButtons` component (buttons from `Chips` plus the add-your-own field).
- Out of scope: block settings and other pages that use `ChipsInput`, any edit to `components/ui/*`, backend and contracts.

## Approach

- [x] `ChoiceButtons.tsx` in `outreach-chat/`: options plus picked custom values as `Chips`, one add-your-own `Input` (Enter adds through `addValues`, so values are cleaned the same way as before).
- [x] `StepInput.tsx`: customer (titles and places groups with small labels), accounts pick, warm-up use buttons. Remove `Checkbox` and `ChipsInput` for titles and places.
- [x] `OutreachChat.tsx`: the composer gets `max-h-[50vh] overflow-y-auto`.
- [x] `AllFields.tsx`: buttons everywhere a choice is made.
- [x] Root gate.
- [x] Looked at the customer step in a throwaway preview harness (deleted). Accounts and warm-up steps were not looked at; no signed-in session.

## Edge cases and risks

- A custom title or place already in the built-in list must not appear twice (the add goes through `addValues`, which dedupes, and the button list is options plus values not in options).
- The 20-value limit of the schema (`titles`, `locations`): the add-your-own field stops at 20 picked; the built-in buttons also stop adding at 20 (disabled, not silent).
- Keyboard: every button is a real `button` with `aria-pressed`; Enter in the add-your-own field does not send the step.
- Mobile at 375 px: many buttons wrap; the composer scroll keeps the last question visible.
- Stored drafts hold the same shapes, so no draft change.
- Rollback: revert the commit.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root.
- Look at the customer, accounts and warm-up steps in a browser; say so if no signed-in session is available.

## Outcome

Shipped: `ChoiceButtons.tsx` (toggle buttons from `Chips` plus an add-your-own field). The chat's customer step shows 16 job titles and 14 places as multi-select buttons; pick accounts and warm-up are toggle buttons; "Edit all fields" has no select, radios or checkboxes any more. The composer scrolls past 50vh. Phrases, name, messages, time, time zone, address and posts a day stay typed. No backend or contract change.

Follow-up: look at the accounts and warm-up steps and "Edit all fields" on the signed-in page.
