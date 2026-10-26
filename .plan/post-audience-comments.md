# Who can see a post and who can comment

- Status: done, not run live <!-- draft | locked | in progress | done -->
- Created: 2026-10-26
- Locked by user: yes, 2026-10-26 ("add an option for comments and view by either anyone and connections only, default will be anyone")

## Goal

Let the owner choose, for each post, who can see it and who can comment on it: **Anyone** or **Connections only**. Anyone is the default. Today both are always Anyone.

## What exists today (checked in code, 2026-10-26)

- The spider task `linkedin-post` already takes `audience` (`ANYONE` or `CONNECTIONS`) and `comments` (`ANYONE`, `CONNECTIONS` or `OFF`), checks them in LinkedIn's dialog, and answers `WRONG_AUDIENCE` or `WRONG_COMMENTS` when the dialog does not show what was asked.
- Brain always sends `ANYONE` for both (`PostPublicationService.dispatchNext`). A draft and a publication hold only the blocks.
- The Posting page shows "Post to anyone" as a fixed line under the account name, and the preview shows a globe.

## Requirements

Confirmed (from your request): two options, "who can view" and "who can comment", each Anyone or Connections only, default Anyone.

Decisions inside that (say if you want any different):

- Both settings apply on the Posting page (kept with the draft and copied to the post) and on the "Write a post" workflow block (two settings of the block).
- "Comments off" stays out: only the two choices asked for.
- A post is posted with the settings it had when it was sent; changing a draft later never changes a post already sent.
- Old drafts and posts read as Anyone for both.

## Scope and non-goals

- In scope: contracts, additive migration (two columns on `PostDraft` and `PostPublication`, default Anyone), brain services and task input, the Posting page (two small choices by the account name, preview icon, confirmation text), the block settings, tests, `MEMORY.md`.
- Out of scope: comments off, per-post settings changed after posting, a default per account.

## Approach

- [x] 1. Contracts, tests first: `POST_AUDIENCES`, `audience` and `comments` on the draft input (default Anyone), two settings on `account.writePost`.
- [x] 2. Brain, tests first: migration, draft save and read, publication copy, `dispatchNext` and `publishFromBlock` send them, the block executor passes its settings.
- [x] 3. Body, tests first for the pure parts: the two choices on the Posting page with autosave, preview icon, confirmation text, block summary.
- [x] 4. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests, `MEMORY.md`.

## Edge cases and risks

- LinkedIn's dialog may not offer a choice for an account (for example an account with no connections or a page): the task already ends `WRONG_AUDIENCE` or `WRONG_COMMENTS`, nothing is posted, and the post shows as not posted with that sentence.
- Old rows and old clients: columns have a default, and the draft input defaults to Anyone, so nothing breaks.
- The repeat check (same words in 7 days) ignores the settings.
- Rollback: the columns can stay unused; brain would go back to sending Anyone.
- Not verifiable here: how LinkedIn's dialog behaves with Connections only on a real post.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; brain integration tests. A live post only with your go-ahead.

## Outcome

Shipped (not run live, page not seen in a browser): `POST_VISIBILITIES` (`ANYONE`, `CONNECTIONS`) in contracts; `audience` and `comments` on the draft input (default Anyone) and as two settings of the "Write a post" block; additive migration `add_post_visibility` (enum `PostVisibility`, two columns with default Anyone on `PostDraft` and `PostPublication`); the draft keeps them, the post copies them, and `dispatchNext` and `publishFromBlock` send them to the `linkedin-post` task, which already checked them in LinkedIn's dialog; Posting page: two small choices by the account name (autosaved with the draft), a preview icon, and the confirmation says who can see and comment; the block's card says when only connections can see or comment. Checks: lint, ts:check, unit tests, build and brain integration tests pass. Follow-ups: a live post with Connections only (LinkedIn's dialog may offer no such choice for some accounts; then the post shows as not posted with the task's sentence); staging needs the migration.
