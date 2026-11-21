# Release preview 2026: lead with value instead of asking for a call

- Status: done
- Created: 2026-11-22
- Locked by user: yes, 2026-11-22

## Goal

Replace the "book a call" pitch in the live "Release preview 2026" campaign on staging with a value-first message: tell the person we built something for them and their company that can roughly double their weekly lead pipeline and revenue, and offer to send the research and lead list we made for them, instead of pushing a 30-minute booking link.

## Requirements

Confirmed (owner answers, 2026-11-22):

- Workflow: `https://app.staging.elitale.com/workflows/01a1afe4-1570-72bf-a735-69a081a4af0a` ("Release preview 2026 · 4 First message"), block `Send message`. Edit live, through the app UI (no DB/API access from this session; the owner signed in to the browser tab opened for this task).
- Drop the `https://cal.com/elitale/30min` booking link entirely from the first message; end on a soft yes/no offer to send the research, not a booking CTA.
- Personalize with `{first_name}`, `{company}`, `{title}`, `{headline}`, `{previous_company}`, `{top_skill}` (all six), each with a safe fallback so a person missing a value still reads naturally.
- Keep the "detailed research + lead list" claim confident and specific (not softened), per the owner's own wording.
- Also update the connection-request note (`Invite` workflow of the same campaign) so it leads with the same value angle, not just the first message.
- Update `.plan/release-preview-outreach.md`'s "Templates and message sequence" section to match the new first message and invite note (it currently documents the old cal.com wording as the source of truth); it stays `rejected`/not done otherwise.

Open questions: none — all locked above.

## Scope and non-goals

- In scope: the `text` setting of the `Send message` block in the one workflow at the URL above, the note text of the `Invite` workflow's connect block in the same "Release preview 2026" campaign, `.plan/release-preview-outreach.md` docs, `MEMORY.md`.
- Out of scope: any other campaign or workflow; `packages/contracts/src/template.ts` sample templates or recipes (no code change — this is campaign content, not a built-in default); the booking page itself; re-approving already-queued sends from the old template (none exist yet on this campaign per the plan's "not done" status).

## Approach

- [x] 1. Read `.plan/release-preview-outreach.md` and `MEMORY.md` for the existing message, variables available (`packages/contracts/src/template.ts`), and the block's settings shape (`packages/contracts/src/workflow.ts`, `account.sendMessage`).
- [x] 2. Draft the new first message and invite note as spintax, validate both with the real engine (`templateProblems`, `countVariants`, `renderAll` from `template.ts`) for: no unknown variables, no unbalanced braces, longest rendered variant under the block's character limit (message 4000, invite note 200), and that the sentence still reads well when an optional personalization clause has no value.
- [x] 3. Confirm the new wording and variable choices with the owner.
- [x] 4. In the browser (already signed in to staging), open the `Send message` block on the workflow above, replace its message text with the new template, save.
- [x] 5. Open the campaign's `Invite` workflow, open its connect/note block, replace the note text with the new value-led version, save.
- [x] 6. Update `.plan/release-preview-outreach.md`'s templates section to the new wording (docs only, plan stays `rejected`).
- [x] 7. Update `MEMORY.md` with this change.

## Edge cases and risks

- Character limits: the invite note is capped at 200 characters after fill (`INVITE_LIMITS.noteChars`); the message at 4000 (`MESSAGE_MAX_CHARS`). Both validated against the longest of all variants with example values, not just one random render.
- Missing values: `company`, `title`, `headline`, `previous_company`, `top_skill` are not always known for a person (only filled when the profile/list data holds them). Each use has a generic fallback (`your business`, `a founder`, `your profile`, `your last role`, `your craft`) so the sentence still reads naturally rather than leaving a gap; the block's own "skip people I have no value for" setting is untouched (left as is), since the owner did not ask to change it.
- Compliance/overclaiming: "detailed research we did on you" and "a lead list of people actually interested" must be true of what the team actually prepares before any send goes out "for real" — this plan only changes the words of the message, not the Act for real setting, which the owner controls per workflow.
- No sends are queued yet for the old message on this campaign (the release-preview-outreach plan is marked rejected/not done), so there is nothing to retroactively change or re-approve.
- This is a UI/content edit on staging, not a code change: no lint/build/tests apply. Verification is reading the saved block back and the rendered example.
- Rollback: the old wording is kept verbatim in this plan and in git history of `.plan/release-preview-outreach.md`; reverting means pasting it back into the same two blocks.

## Verification

- After saving, reopen the `Send message` block and the `Invite` block and confirm the saved text matches exactly what was typed (the editor's own live preview, on a real person if available, shows no missing-variable warnings and a sensible render).
- No `pnpm` commands apply (no source files changed besides `.plan/` and `MEMORY.md`).

## Outcome

Done, 2026-11-22. Edited live in the app (no code change): the `Send message` block of `Release preview 2026 · 4 First message` (`/workflows/01a1afe4-1570-72bf-a735-69a081a4af0a`) and the note of the `withNote` `Send connection request` block of `Release preview 2026 · 2 Invite` (`/workflows/01a1afe4-152e-76fa-91ae-8294063f49a5`) now carry the value-led text (see `.plan/release-preview-outreach.md` for the exact wording, before and after). Both drafts were validated first with the real engine (`packages/contracts/src/template.ts`'s `templateProblems`/`countVariants`/`renderAll`): no unknown variables, no unbalanced braces, longest variant 503/4,000 characters for the message and 139/200 for the note. Saved and confirmed by reloading the page and reopening both blocks.

Deviation found during execution, not assumed in the plan: the campaign was not idle. It had already sent 80 real invites and 25 acceptances with the old invite note, and the `Send message` block had already sent 1 real first message with the old cal.com wording (seen in that block's Output tab, person "Daniel S.", status SENT) before this edit. Saving a changed message or note text turns that block's own "Act for real" off again (a built-in safety check, "Changing what goes out switches it off again"); both blocks are now off and must be switched back on deliberately after a preview, same as any first edit. Nothing already sent was or could be changed retroactively.

Not done: re-enabling "Act for real" on either block (left to the owner after a preview); any change to the `withoutNote` branch of the Invite workflow, which sends no note and so needed no wording change; any code change (this was content on a live staging workflow, not `packages/contracts` or `apps/body`).
