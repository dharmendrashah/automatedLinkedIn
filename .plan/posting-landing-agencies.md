# Write a post landing page for agencies and teams

- Status: done
- Created: 2026-10-28
- Locked by user: yes, 2026-10-28 (the core plus every later item below)

## Goal

Make `/posting` fast for someone who runs many accounts (agency owner, GTM engineer, sales rep) without making it harder for a founder with one account. Today the page opens with a full-height account picker, an account in Error blocks the first click, and "Your posts" and "Your drafts" are flat lists with no filter. Reviewed by the Agency Owner, Founder and GTM Engineer persona agents (findings below).

## Requirements

Confirmed (agreed by all three reviewers, and by the repo rules):

- Never add: one text posted to many accounts at once, "clone to all accounts", time jitter or text spinning to avoid detection, auto-engagement between accounts, changes to the posting limits or working hours, auto-written posts that go out unseen, a review link that carries access to an account. Every post stays a deliberate, per-account, reviewable action.
- One client never sees another client's posts, drafts or label (the existing per-user scoping stays).
- Only what the page already knows or the brain can state is shown. No engagement numbers unless they are real (see open questions).

Proposed for this round (core):

1. A "New post" control at the top replaces the card grid: one ready account goes straight to the composer; several show a searchable account select that shows photo, name and client label, and lists only ready accounts.
2. A "Needs attention (n)" notice for accounts that cannot post, with the reason in plain words and a real link to the accounts page (no "Test login" or other jargon).
3. A status strip across all accounts: Planned, Posting now, Not posted, Drafts. Each count is a filter.
4. "Your posts" and "Your drafts" become one list with tabs (Drafts, Planned, Posted, Not posted) and filters: account or client label, search by text. The filter lives in the URL.
5. The client label is shown on the account select, post rows and draft rows.
6. A post that did not go shows its reason and the one action that fits (Edit and post again), and a planned post shows when it will go in the viewer's time and the account's zone (already in `waitingText`).
7. The fixed account bar (photo, name, client label, zone) above the composer's Schedule and Post buttons, to stop a post going out under the wrong client.

Decisions (locked 2026-10-28):

- Scope: the core, duplicate as draft, engagement, week calendar, CSV export, starter ideas and the nudge.
- With one ready account, New post opens the composer directly.
- Duplicate: same account only, one at a time, words and settings only (files are not copied).
- Client label is read from `browse.overview` (`linkedInAccount.list` does not return it).
- `postPublication.list` is capped at 100 newest posts and shows 200 characters; the week view and the CSV cover those and say so.
- Engagement: numbers are not stored per post, so a Posted row gets "See results", which saves the post's link on the LinkedIn posts page and opens it, where Read post shows the live numbers. Nothing is invented on the Posting page.
- Starter ideas open a new draft with a short outline; the nudge is a hint only (last Posted older than 7 days or none).
- CSV is built in the browser; cells starting with `=`, `+`, `-` or `@` are prefixed with a quote.

Open questions: none.

## Scope and non-goals

- In scope: `apps/body/src/pages/Posting.tsx` and `apps/body/src/components/posting/*`; a small brain change only if the lists need a client label or a count (`postDraft.list`, `postPublication.list`, `linkedInAccount.list`) that they do not return today.
- Later (not in the core, each with its own plan): week calendar per account (L), engagement next to a posted row (M, depends on data), duplicate as draft (M), starter ideas for a founder (M), "no post in N days" nudge (S), CSV export of posts per client (S), client review and approval state with an expiring read-only preview (L), saved templates (M), bulk move or cancel within one account (M).
- Out of scope: everything under "Never add".

## Approach

- [x] Read `Posting.tsx`, `account-card.tsx`, `accounts.ts`, `publications-list.tsx`, `drafts-list.tsx`, `studio.tsx` and the `postDraft`, `postPublication` and `linkedInAccount` resolvers; list what each already returns (client label, zone, failure).
- [x] Tests first: pure helpers for tab and filter (counts, text search, client label match), the ready or not ready split, the one-account shortcut, and the URL state.
- [x] Reuse `identityOf`, `ineligibleReason`, `stateText`, `canTakeBack`, `waitingText`; move nothing into a shared module until two places use it.
- [x] Build the "New post" control and the "Needs attention" notice; remove the card grid.
- [x] Build the status strip, the tabbed list and the filters; keep the 5 s polling while a post is active.
- [x] Add the account bar to the composer.
- [x] Plain wording pass on the page (no "Test login", no "workflow"; links are real links).
- [ ] Check in a browser with one account, with several accounts including one in Error, and with no accounts at all. Not done: the local sign-in could not be passed from the tool. Not applicable to this task: no sample mode exists for this page.
- [x] Gate: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, all warnings fixed.
- [x] Update this plan's Outcome and `MEMORY.md`.
- [x] Later items: duplicate as draft (brain `postPublication.duplicate` plus the page), see results, week view, CSV export, starter ideas, quiet-account hint.

## Edge cases and risks

- No accounts, or none ready: the page shows the notice and a link to the accounts page, not a dead button.
- Many accounts (40 or more): the select must search, not scroll; lists must not render hundreds of rows at once (the API already caps the list; show "showing the latest N" if cut).
- Drafts autosave and are per account: opening one under the wrong account must be impossible; the account bar and the URL carry the account id.
- A filter that matches nothing needs its own empty text, different from "no drafts yet".
- URL state: an unknown tab or account id in the URL falls back to the default, never errors.
- A post in `UNKNOWN` state is shown as "Not sure if it was posted", never offered as a retry (irreversible step rule).
- Polling: keep one query for posts; do not poll per account.
- Privacy: client labels are the owner's own; nothing is shared across users. No migration is planned for the core.
- Rollback: UI only; revert the commit.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Real path: open `/posting` in the browser with the dev stack and walk through one account, several accounts, an Error account, and a filter; state what could not be run (a real post is not sent).

## Outcome

Shipped (not committed): the landing described above plus every later item the owner chose. Brain: `PostPublicationService.duplicate` and router `postPublication.duplicate` (unit test for the router, two integration cases for the service: both pass). Body: `new-post`, `attention`, `combobox`, `landing-toolbar`, `week-view`, helpers `landing.ts`, `week.ts`, `posts-csv.ts` (17 new unit cases), `use-client-labels`, the two lists rewritten, the composer footer says who it posts as, `AccountCard` removed. Gate (lint, ts:check, unit tests, build) passes with no warnings.

Deviations: "See results" does not show numbers on the Posting page (none are stored per post); it saves the link on the LinkedIn posts page, where Read post reads them live. The starter outlines are plain prompts, not generated text.

Not verified: the page in a browser (sign-in blocked the check), the combobox search with many accounts, a real Duplicate and See results click, the CSV opened in a spreadsheet.

Follow-ups: client approval state with an expiring read-only preview, saved templates, bulk move or cancel within one account, engagement stored per post.
