# Write a post: button on the right, drafts and plans without an active account

- Status: done
- Created: 2026-10-27
- Locked by user: yes, 2026-10-27

## Goal

Move the "Write a post" button to the right of its row, let the owner write drafts and plan a time with an account that is not signed in (only posting right now needs a signed-in account), and show one clear "no account" state for the whole page when the owner has no account at all.

## Requirements

Confirmed (from the request and the answers of 2026-10-27):

- "Write a post" sits on the right side, next to Export posts in the toolbar (not on the heading row). The account picker and the starter ideas move to the right with it.
- A draft can be written with an account that is not active; the account only has to exist, with any status.
- An account that is not active cannot post now, but can schedule: scheduling creates a real planned post. If the account is still not signed in at that time, the post ends as Not posted with a sentence.
- With no account at all, the whole page shows "no account is available" (like the "No account is signed in" card on `/network`), not the toolbar, tabs and a disabled button.

Context (what the code does today):

- `Posting.tsx` gates the start on `readyAccounts` (ACTIVE only), `studio.tsx` lists only ACTIVE accounts (plus the current one) in "Post as" and blocks both Schedule and Post now with `ineligibleReason`, and brain `PostPublicationService.checkPost` refuses both `publish` and `schedule` unless the account is ACTIVE.

Open questions (must be empty before locking):

- none.

## Scope and non-goals

- In scope: `apps/body/src/pages/Posting.tsx`, `components/posting/new-post.tsx`, `studio.tsx`, `landing.ts` (helper), a shared "no account" empty state reused from `/network` if one exists, and in brain `postPublication.service.ts` (`checkPost` for schedule) with its unit and integration tests.
- Out of scope: posting limits, browsing budget and office hours (unchanged, they still apply at the time the post is sent), the accounts page, the spider task, other pages that read accounts.

## Approach

- [x] Tests first (body): not applicable, no new pure helper was needed (the page change is layout and gating; `readyAccounts` is unchanged and tested).
- [x] Tests first (brain): `schedule` accepts a PENDING account and creates a SCHEDULED post; `publish` still refuses it (existing test); limits, repeat and content checks still run for `schedule`.
- [x] Brain: `checkPost` got a `needsSession` flag; `schedule` skips only the ACTIVE check; `publish` and `publishFromBlock` keep it. The hook (`linkedInPost.hooks.ts`) still refuses at dispatch time, so an unsigned account ends as Not posted.
- [x] Body `Posting.tsx`: zero accounts returns one empty state for the whole page, reusing `EmptyState` and `ToAccounts` from `components/network/notices.tsx`.
- [x] Body `new-post.tsx` and `landing-toolbar.tsx`: the picker, Ideas menu and Write a post button sit in the toolbar's right group before Export posts; every account can be picked, a signed-out one is hinted; the "No account can post right now" branch is gone. The starter ideas became an Ideas menu.
- [x] Body `studio.tsx`: "Post as" lists all accounts; the alert says the account cannot post now and that writing and planning still work; Post now stays blocked with the reason; Schedule is blocked only by an empty post, uploads or a missing time; the confirm dialog for a plan on a signed-out account warns.
- [x] `readyAccounts` stays (quiet-account hint).
- [x] Verify: lint, types, unit tests and build pass for the whole monorepo; the brain post-service integration tests pass. Not done: a browser check, the local sign-in cannot be passed from the tool.
- [x] Update `MEMORY.md`.

## Edge cases and risks

- Zero accounts but old drafts exist: not possible today (drafts are removed with their account), but the page shows the empty state first and the drafts are not shown; confirm there are none left after an account delete.
- An account is deleted or turns inactive while a draft is open: the Studio keeps working; sending shows the sentence from brain, never a silent failure.
- A post planned from a broken account that stays broken: ends Not posted at its time (existing `FAILED` path, also after 1 hour late by `dispatchDue`), visible in the "Not posted" tab with Back to draft. The owner is only warned on screen, not by email or notification (none exists).
- Safety: the compliance rules do not change. A post that is posted still needs an ACTIVE account, one owner confirmation each time, and the account limits at the time of sending; scheduling is the owner's own decision and stays cancellable.
- Several accounts where all are broken: the page works, the picker marks them, nothing hidden.
- Existing data and migrations: none; no schema change.
- Rollback: revert the commit; brain change is a single condition.
- Other pages that gate on `ineligibleReason` (`/network`, the account picker) stay as they are.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` all pass, warnings fixed.
- Integration test for `schedule` on a non-active account (needs Postgres).
- Browser check of the three account states.

## Outcome

Shipped as planned, status `done`. Deviation: the starter ideas are an Ideas menu (dropdown) in the toolbar instead of a row of buttons. Not seen in a browser. The brain integration run showed failures in unrelated files (`messageImport`, `accountProfile`, `taskDispatch`, `engine`) that share one database; the post service tests pass. Follow-up: nothing notifies the owner when a planned post from a signed-out account ends as Not posted.
