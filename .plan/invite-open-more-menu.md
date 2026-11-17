# Open the profile's More menu for real, and call a run that sent nothing "No invite sent"

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-11-17
- Locked by user: yes, 2026-11-17 (the owner supplied the recording that answers question 1; the verdict is a failure with status FAILED, as `NONE_DONE` is for engage)

## Goal

The invite task presses the profile's More (three dots) button when the top card shows no Connect, because for many 2nd and 3rd degree profiles (Follow and Message first) Connect lives in that menu. On staging it never presses it, so every such person is answered "no Connect button" and ended for good. Also, a run that sent nothing must not read "Partly done".

## What staging showed (read only, 2026-11-17)

Session `1a512f2c-49f7-4f9e-802a-b86f50311661` (account tripti.verma, build `ebc6df87`, which is `main` after PR #231), one invite to `imran-ali-safin`:

- Steps: `goto /feed/`, `goto /in/imran-ali-safin/`, nothing else. Log: "The profile shows no Connect button, nor one in its More menu", 6.7 s after the page loaded. The verdict was `PARTIAL`, status `SUCCEEDED`, headline "0 of 1 invites sent, 0 of 0 withdrawn.", and the invite row was `FAILED` "LinkedIn showed no Connect button on the profile."
- The video (read frame by frame) shows the profile ("· 3rd", buttons Message, Follow, Visit my website, and a three-dots button) and never an open menu. The kept page (`files/no-connect-1.html`) has the three-dots button, so the menu was never pressed.
- Cause, in code: `moreButtons` (`apps/spider/src/linkedin/inviteReader.ts:114`) only accepts a button whose visible text is "More" and that has no `aria-label`. The real button is `<button aria-label="More" aria-expanded="false"><span><svg/></span></button>`: it has an `aria-label` and no text. Both tests fail, so the list is empty and `openMenu` returns at once. The unit fixture (`inviteFixture.ts:50`) models an older shape (`<button aria-expanded="false"><span>More</span></button>`), so the tests never saw the real one. Every kept `no-connect` page I opened (10 Nov, 11 Nov, 15 Nov, 16 Nov) has three such `aria-label="More"` buttons, so this is not new today.
- Effect: since 10 Nov, 63 people (63 invite rows) were answered "no Connect button" and 64 people are `ENDED`, which means they are never invited again. Since 16 Nov 16:07 nearly every scheduled invite session is one person, one visit, `PARTIAL`, nothing sent. Some of those people may truly have no Connect even in the menu (unverified, see below); the 87 old "already connected" rows are a separate, fixed problem (#225).
- Why "Partly done": `runInvites` sets `PARTIAL` unless every invite is sent or settled without a press (`settled && allWithdrawn` gives `DONE`, anything else gives `PARTIAL`; `apps/spider/src/tasks/linkedinInvite/run.ts:717`). There is no verdict for "none happened", so 0 of 1 is `PARTIAL` with status `SUCCEEDED` and a neutral tone.

## Requirements

Confirmed (stated by the owner, or settled by reading the code):

- When the top card shows no Connect, the task opens the profile's More menu and presses Connect there if it is offered, as the existing code already intends.
- A run in which no invite was sent and no withdrawal was done, and nothing was settled without a press (already pending or already connected), is not "Partly done". It reads as a failure.
- A person answered "no Connect" because the menu was never opened must be asked again once.

Open questions (must be empty before locking):

- None. The owner's recording `session-2026-11-17T04-22-15-188Z` (account dharmendrashaheagle, a wide layout) shows a 3rd degree profile (Daniel Nixon, Message, Follow, More) whose More menu offers Connect: Send profile in a message, Save to PDF, Connect, Report, Block, About this member. The Connect item is `<a role="menuitem" href="<profile>" componentkey="ConnectButtonstate:invitation:urn:li:member:<id>_connect">` with the label on an inner div, which the existing menu reader already reads. In that layout the top card's More shows the word "More" (no `aria-label`, but a `componentkey`); in the narrow layout the spider gets, it is an icon with `aria-label="More"` and a `componentkey`. The site's top-bar More has an `aria-label` and no `componentkey`.

## Scope and non-goals

- In scope: `moreButtons` and its fixture and tests; a new verdict `NONE_SENT` in the task (`index.ts`, `answer.ts`, `run.ts`); brain's `HANDS_OVER` (`linkedInInvite.hooks.ts`); a one-time data change that makes the 63 wrongly ended people askable again; MEMORY.md.
- Out of scope: the Invite workflow, limits and spacing, the connected detection, other tasks.

## Approach

- [x] 1. Tests first. In `inviteReader.unit.test.ts`: `moreButtons` finds the real button shape (`aria-label="More"`, no text, `aria-expanded`), still finds the old shape, and leaves out a More inside `nav` or `header` (the site's top bar). Update `inviteFixture.ts` to the real shape for the top card and keep the nav one as the named distractor. In the task test: a profile whose only Connect is in the menu is pressed; a profile whose menu has no Connect ends `NO_CONNECT` with the page kept.
- [x] 2. `moreButtons`: accept a `button[aria-expanded]` that has a `componentkey` and whose name is "More" (visible text or `aria-label`, trimmed, case-insensitive). The `componentkey` is what leaves out the top bar's More (recorded 2026-11-17), instead of looking at `nav` or `header` ancestors, which the kept pages do not show. Keep the position-among-buttons contract so `pressButton` and `clickNth` keep working; hidden copies (the sticky header's) fail to press and the loop goes on to the next, as today.
- [x] 3. Verdict: when `sent` and `withdrawn` are not empty and no entry is `SENT`, `SENT_WITHOUT_NOTE`, `WITHDRAWN`, or in `DONE_WITHOUT_PRESS` or `NOT_PENDING`, and nothing is unsure, the outcome is `NONE_SENT`. Add the verdict to the task: label "No invite sent", tone failure; `answerFor` gives status `FAILED`, message "No invite could be sent; each says why.", the same headline report, and no `commitSession`. A mixed run stays `PARTIAL`.
- [x] 4. Brain: add `NONE_SENT` to `HANDS_OVER` in `apps/brain/src/database/linkedInInvite.hooks.ts` so each invite is still settled from the file, and make sure it is not in `NOTHING_PRESSED` (a press was not the problem: a visit was made). Test in `linkedInInvite.hooks.unit.test.ts`.
- [x] 5. Data: a data-only migration that turns the invite rows with state `FAILED` and the reason "LinkedIn showed no Connect button on the profile. Nothing was sent." created on or after 2026-11-10 into `SKIPPED` with a fixed reason ("Asked again after the More menu fix."), so those people are `NONE` again and the Invite workflow picks them up once. A person who truly has no Connect ends again after one more visit. Do this only after open question 1 is answered yes.
- [ ] 6. Staging check after deploy (read only): the next invite sessions show clicks on More in the steps, `SENT` rows for people who were `FAILED` before, and `NONE_SENT` (red) for a run of only truly impossible people.

## Edge cases and risks

- The menu can be opened on a profile that has no Connect in it: the existing code closes it with Escape and answers `NO_CONNECT` (or `ALREADY_CONNECTED` when it offers Remove connection).
- Opening More is a click on LinkedIn that changes nothing; the existing "irreversible step" rules apply only to Connect and Send.
- A more visible fix of the verdict means more red runs: sessions of one person with no Connect become "No invite sent". That is intended, but the dashboard's "Recent runs" and the failure counts will show them; check the account-health rules do not treat a `FAILED` invite session as a sign-in or block problem (only `SIGNED_OUT`, `RESTRICTED`, `BLOCKED`, `LIMIT_REACHED` stop an account's invites today).
- Deploy order: spider and brain must go together (brain must know `NONE_SENT` before a spider hands it over); the selective deploy builds both when `apps/spider` and `apps/brain` change.
- Re-asking 63 people is a burst of profile visits on the owner's accounts; invites are already spread 30 minutes apart and limited per day and week, so they come back through the normal Invite run and its limits.
- Rollback: revert the commits; the re-asked rows stay `SKIPPED`/`FAILED` as they end.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build && pnpm test:integration:run`
- Spider unit tests with the real-shape fixture; a recorded 3rd degree More menu page as a fixture (open question 1).
- Staging after deploy, read only: session steps, invite states, and the verdict list for `linkedin-invite`.

## Outcome

Built on `fix/invite-open-more-menu`; not deployed. Step 6 is for after the deploy.

- Shipped: `moreButtons` recognises the icon-only and the wide-layout More by `aria-label` or text plus a `componentkey`; the synthetic fixture now defaults to the icon-only shape (and has a `more: 'text'` option); a new verdict `NONE_SENT` ("No invite sent", failure tone, status `FAILED`, message "No invite could be sent; each says why.") in the task, and in brain's `HANDS_OVER` so each invite is still settled from the file; migration `20261117100000_reopen_invites_without_more_menu` turns the "no Connect" FAILED rows since 10 Nov into SKIPPED (askable again) and marks the people index dirty.
- Tests: the real-shape fixture reproduced the bug first (5 failing cases); reader cases for both layouts and the top bar; task cases for `NONE_SENT` versus `PARTIAL`; an answer case; a hook case; a migration case that runs the migration text.
- The recordings stay local (`.devtools-recordings` is gitignored); no real name or page was added to the repo.
- Not done: step 6; no run on live LinkedIn.
