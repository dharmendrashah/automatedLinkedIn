# Campaigns page: one "Create campaign" button with two choices

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-14
- Locked by user: yes, 2026-11-14 (user confirmed all four defaults: "yes lock it and continue")

## Goal

The Campaigns header has two separate buttons, "Outreach campaign" and "Empty campaign", and it is not clear what each one makes. Replace them with one "Create campaign" button. It opens a dialog with two options, each with a short description and a colour-coded icon: "Outreach campaign" (six ready workflows built from answers) and "Without campaign" (an empty campaign that the user fills later).

## Current behaviour (read from code)

- [Campaigns.tsx](apps/body/src/pages/Campaigns.tsx) lines 45-58: "Outreach campaign" is a `Link` to `/campaigns/new` (the `NewCampaign` form, which calls `campaign.createOutreach`). "Empty campaign" sets `name` to `''`, which opens a name dialog. Its Create button calls `campaign.create` and then navigates to `/campaigns/:id`.
- The name dialog is the only use of `Dialog` state `name` on this page (lines 62-91).
- No backend, contract or route changes are needed. `/campaigns/new` is also linked from [WorkflowNew.tsx](apps/body/src/pages/WorkflowNew.tsx) and must stay.

## Requirements

Confirmed (from the owner's request):

- One grouped control, not two buttons.
- The grouped control is labelled "Create campaign".
- Two choices: "Outreach campaign" and "Without campaign" (the owner's "Empty campaign").
- Each choice has a proper description and an icon with a colour code, so the user can tell them apart.

Assumed (the owner can change these before lock):

- "model" in the owner's sketch means a dialog (modal). The "Create campaign" button opens it.
- "Outreach campaign" opens `/campaigns/new` as today.
- "Without campaign" keeps today's name step, inside the same dialog (a second view with a Back button). It then calls `campaign.create` and opens the new campaign.
- Icons and colours (Tailwind tokens, light and dark):
  - Outreach campaign: `Sparkles` icon, blue (`text-blue-600 dark:text-blue-400`, chip `bg-blue-500/10`).
  - Without campaign: `FolderPlus` icon, violet (`text-violet-600 dark:text-violet-400`, chip `bg-violet-500/10`).
  - Blue and violet are not used by the state colours in [campaign-list-format.ts](apps/body/src/components/campaigns/campaign-list-format.ts) (emerald, amber, muted), so the codes do not clash.
- Descriptions (plain words, matching [NewCampaign.tsx](apps/body/src/pages/NewCampaign.tsx) copy):
  - Outreach campaign: "Answer a few questions. We build six workflows for you, all switched off."
  - Without campaign: "An empty campaign. Add your own workflows to it later."
- The main button is `default` (primary) with a `Plus` icon. Pages keep the existing `grid w-full gap-4 px-4 lg:px-6` root.

## Open questions (must be empty before locking)

1. Is "model" a dialog? (Assumed yes.)
2. Colours: blue for Outreach and violet for Without campaign, or other colours?
3. "Without campaign": keep the name step in the same dialog (assumed), or go straight to a new empty campaign with a default name?
4. Commit and push to the current branch `feat/campaign-list-detail-icons` (PR #220), as with the previous change (assumed yes)?

## Scope and non-goals

- In scope: the Campaigns page header, the choice dialog and its name step, the descriptions, icons and colours above, and copy in the empty-state paragraph only if it names the removed buttons (it currently says "Make one", which still fits).
- Out of scope: backend changes, the `/campaigns/new` form, the campaign detail page, the list row CTA "Add a workflow", and any edit to `apps/body/src/components/ui/*`.

## Approach

- [ ] Replace the two header buttons with one "Create campaign" button (default variant, `Plus` icon) that opens a choice state.
- [ ] Put the choice and the name step in one `Dialog`, driven by one state value (`choice | name | closed`). Remove the second `Dialog` so two Radix dialogs never stack.
- [ ] Add two option blocks in the dialog: each is a full-width button (or `Link` for Outreach) with an icon chip, a title, and a description linked with `aria-describedby`.
- [ ] Outreach option: a `Link` to `/campaigns/new` that closes the dialog.
- [ ] Without campaign option: switches the dialog to the name view. The name view has a Back button, the existing name input (`maxLength` `CAMPAIGN_LIMITS.nameMax`), the create error and the Create button.
- [ ] Keep `campaign.create` and its success handler (invalidate list, navigate to `/campaigns/:id`) unchanged.
- [ ] Reset the name and the step when the dialog closes (same as today's `setName(null)`).
- [ ] Check the page at 375 px and 1440 px, in light and dark, and keyboard only (Tab, Enter, Esc, focus back on the trigger).
- [ ] Run the root gate. Update this plan (status `done`, Outcome), add a `MEMORY.md` changelog line, commit and push.

## Edge cases and risks

- Empty or whitespace-only name: the Create button stays disabled (existing rule). Name longer than `nameMax`: the input has `maxLength`.
- `campaign.create` fails (network, validation): the error shows in the name view and the dialog stays open. A second click while pending is blocked by `disabled={create.isPending}`.
- Double submit: the disabled state covers it. A double click on Outreach only navigates once.
- Stacked dialogs: avoided by using one `Dialog` and one step state. Switching step must not leave focus on a removed element. Radix returns focus to the trigger on close.
- Cancel or Esc mid-name step: resets the name and the step, so the next open starts from the choice view.
- Outreach `Link` inside a dialog: the route change unmounts the page. The dialog must close first or be unmounted with it, so no overlay stays on `/campaigns/new`.
- Accessibility: options are real buttons or links with text labels. Colour is never the only signal (title and description carry the meaning). Icons are decorative (`aria-hidden`). Contrast of blue and violet text on the dialog background must pass in dark mode.
- Mobile: the dialog options stack vertically at 375 px. Long descriptions must wrap, not overflow.
- Dev vs production: no difference. No Docker or CI impact (body only, no new dependencies).
- Existing data and migrations: none.
- Rollback: revert the single commit. The two old controls come back, and no data changes.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root, run with `export PATH="$HOME/Library/pnpm/bin:$PATH"` if pnpm is not on PATH.
- A unit test is not added. Body has no DOM test setup (no `@testing-library`), and the change is wiring with no new pure logic. Adding a test stack is out of scope unless the owner asks.
- Browser check (needs a signed-in session): open Campaigns, open Create campaign, check both options at 375 px and 1440 px in light and dark, create a "Without campaign" campaign, follow the Outreach link to `/campaigns/new`, and run keyboard-only. If no session is available, say the browser check was not run.

## Outcome

- Shipped: `apps/body/src/pages/Campaigns.tsx` has one "Create campaign" button. It opens one dialog with two colour-coded options: Outreach (blue, links to `/campaigns/new`) and Without campaign (violet, opens the name step). Back and Create are in the name step.
- Deviations: no Cancel button in the name step (X and Esc close it). `aria-describedby` uses the static ids `campaign-outreach-desc` and `campaign-empty-desc`. No DOM test added, because body has no component test setup.
- Verified: root gate (`pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`) passed with 0 lint warnings and 0 errors. Not checked in a browser (no signed-in session).
- Follow-ups: check the dialog at 375 px and 1440 px, in light and dark mode, and with the keyboard, once a signed-in session is available.

## Addendum: use case examples (2026-11-14)

- Request: "add a lot of use cases example as well". Each option now lists four "For example" lines inside its described text.
- Outreach examples follow the six workflows in `packages/contracts/src/recipes.ts`: find people from posts, invite and message, warm up by reactions, hand off silent people, and hand off invites with no answer after 21 days.
- Without campaign examples: a new market test, a partner referral list, a one-off event follow-up, and create now and add workflows later.
- Verified: root gate passed (0 lint warnings, 0 errors). Browser layout check still pending.

## Addendum: examples in tooltips (2026-11-14)

- Request: "put example in the hover and on tooltip with question mark so it will look good". The examples leave the option text. Each option gets a circular help button (`CircleHelp`, top right, `aria-label` names the examples) that opens the shared tooltip with the "For example" list.
- The help button sits beside the option, not inside it, because a button cannot nest in the option's link or button. The option text is now one line, and the option has right padding for the icon.
- Uses the existing `components/ui/tooltip.tsx`; no new dependency.
- Verified: root gate passed. Hover, keyboard focus and layout at 375 and 1440 px, light and dark, still to check in a browser.
