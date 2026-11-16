# Look only at new posts and new people on every run

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-11-16
- Locked by user: yes, 2026-11-16 (answered both open questions: mark the old posts, 30 days)

## Goal

Every Discover run should spend its reads and its AI scoring on posts and people it has not looked at before. Today it re-reads and re-scores people it already read, and no post is ever marked as processed. After this plan a post is marked processed once its run finished cleanly, and a person who is already connected, already invited, or already read in the last 30 days is dropped before anything is paid.

## What staging showed (read only, 2026-11-16)

Everything below was read from staging with queries that change nothing. Numbers are for the "Release preview 2026" campaign.

- Posts are never marked processed. All posts kept since 8 Nov are `UNPROCESSED` (78 when first read, 83 later the same day, all 83 under the campaign label `lead-release-preview-2026`, plus 2 untagged posts from 27 Oct that the owner added by hand), and every scheduled Discover run ends with the step message "0 posts marked done." (itemsIn 0, itemsOut 8 or 9 on 13 and 14 Nov). Cause in code: `markPosts` (`apps/brain/src/worker/engine/executors.ts:864`) marks by `postId`, but a post found by Find posts has `postId: null` (the row is made later by the keep step, which does not write the id back onto the item). So `ids` is empty and nothing is marked. The existing test (`dedupePosts.integration.test.ts`) sets `PROCESSED` by hand, so it never ran the real path.
- The posts of one day are mostly new, because Find posts searches "last 24 hours" and asks again every time (`SHORT_WINDOWS`). So the post repeat is a protection that is missing, not yet a measured cost. The repeat risk is a run that is retried or run by hand within the window, or a longer window.
- People are re-processed. On 13 Nov the People "Remove duplicates" block took 305 people in and passed 281; the Get full profile step then said "125 read in the last 30 days, not paid again", and the score step kept 54 of 281. So 125 of 281 (44 percent) were people read before and not listed (rejected earlier), and they were judged by the AI again. The block only drops people already in a list or in /profiles (`WorkflowListService.seenAmong`), not people already read or already connected.
- Already-connected people are not dropped before the read. Staging has 829 people with `connectedAt` set (the daily connection read keeps this fresh: 2 to 3 `linkedin-connections` sessions every day), but the dedupe block never looks at `Person`. The Invite workflow drops them later (`logic.ifPerson` "Not connected" and the `invites: NONE` filter), after the read and the score were paid.
- The 44 "Already connected" skips on 13 Nov were mostly a wrong guess, not real connections: only 4 of the 88 skipped rows from 12 to 14 Nov were people known as connected. That is fixed on `main` (#225) and is not part of this plan.
- The paid profile read does not say whether someone is connected: `PersonSnapshotData` has `connections` (a count) and no degree. So "is this person connected" can come only from our own records (the daily connection read, accepted invites, and the invite visit that now answers "already connected" only when the More menu offers Remove connection).

## Requirements

Confirmed (stated by the owner, or settled by reading the code):

- A post that a clean run processed is never processed again by a later run (it goes to the Else output of the posts dedupe, as today).
- A person already connected to any of the owner's accounts is skipped by Discover and is not read, scored or listed again.
- A person already invited (queued, pending, accepted or ended) is skipped the same way.
- A person whose full profile was read in the last 30 days is skipped by Discover for those 30 days (the same window the read cache already uses, `RECENT_DAYS`), so a person rejected once is not judged again the next day.
- The posts Discover already kept are marked processed once, by a data migration (the owner said yes). Only posts that carry one of the owner's campaign labels are touched; a post the owner added by hand (no tag) stays as it is.
- Existing workflows get this without editing their graphs. The block settings default to on, and a saved block with no value for them behaves as on (the same way `skipListed` and `skipDone` work today). An owner can still switch either off on the block.
- People the owner picked by hand, or a workflow handed over by name, are not dropped by the new rules (as with lists today: "known" people only lose the do-not-contact check).
- No new block. The existing "Remove duplicates" block (`process.dedupe`) gets two more settings.

- The window for "read recently, skip" is 30 days (the owner confirmed; it is the existing profile cache window, `RECENT_DAYS`).

Decided by assumption (the owner can still overturn it):

- The read-in-30-days rule is owner-wide, like the lists rule: a person read and rejected by one campaign is not judged by another campaign for 30 days. The alternative (per workflow memory with a new table) is more code for a small gain.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope:
  - `output.markPosts` marks by slug (the same key the dedupe uses to read the status).
  - `process.dedupe` gets `skipConnected` and `skipRead` (both default on), their field labels and hints, and a step message that counts what each rule left out.
  - `WorkflowListService.seenAmong` (or a sibling next to it) learns the two rules without changing what the list-adding path drops.
  - A one-time data migration that marks the campaign-kept `UNPROCESSED` posts `PROCESSED`.
  - Tests, golden snapshot update, `MEMORY.md`.
- Out of scope:
  - The invite task and its connected detection (#225), the Invite workflow graph, limits.
  - A per-workflow "already evaluated" memory table.
  - Changing which posts Find posts returns or its time windows.
  - Editing saved graphs (nothing needs it).

## Approach

- [x] 1. Tests first, and watch them fail.
  - `apps/brain/src/worker/engine/dedupePosts.integration.test.ts`: a real path case. Find posts (fake data client, `keep: true`) then Remove duplicates then Mark posts done, on one run: afterwards the post row is `PROCESSED`, and a second run that finds the same post sends it to the Else output and does not read its commenters. Today this fails ("0 posts marked done").
  - A unit or integration case for the gate that already exists: a run with a `PARTIAL` or `FAILED` step leaves the posts `UNPROCESSED` (so a retried run reads them again).
  - A new integration test file `apps/brain/src/worker/engine/dedupePeople.integration.test.ts` (real Postgres, pattern: `dedupePosts.integration.test.ts`): people with these states go in: new; `connectedAt` set; `inviteState` `PENDING`; `QUEUED`; `ACCEPTED`; `ENDED`; `inviteState NONE` and not connected; one with a `PersonSnapshot` read 5 days ago; one read 40 days ago; one in a list; one marked do-not-contact; one "known". Expected out of Remove duplicates with the defaults: only the new, the NONE-not-connected, the read-40-days-ago and the known one. With `skipConnected: false` the connected and invited come back; with `skipRead: false` the recently read one comes back. The step message names the counts.
  - `packages/contracts/src/workflow.test`-style unit case: the block parses `{}` to both settings on, and an explicit `false` is kept.
- [x] 2. `markPosts`: take the slugs of the post items (not the ids), mark them with a new `LinkedInPostService.setStatusBySlugs(userId, slugs, 'PROCESSED')` (same `updateMany`, `where: { userId, slug: { in } }`), keep the preview rule and the "every other step finished cleanly" gate as they are, and make the step's `itemsIn` and message count the slugs. A post that has no row in the owner's posts (a post of pasted links that was not kept) simply matches nothing.
- [x] 3. Contracts: in `process.dedupe` add `skipConnected: toggle(true)` and `skipRead: toggle(true)` and two `fields` entries after `skipProfiles`:
  - `skipConnected`, label "Leave out people I am already connected to or have invited", hint "Uses what your accounts' daily connection read and your invites already know."
  - `skipRead`, label "Leave out people whose profile I read in the last 30 days", hint "They were judged then. They can come back after 30 days."
  - Update the block `summary` to mention connected, invited and recently read people. Update the golden snapshot (`packages/contracts/src/__snapshots__`) and the block docs test that lists fields, and nothing else in the recipes (their `{}` or `{ skipCompanyLabel }` configs get the defaults).
- [x] 4. Brain: extend `SeenSkip` with optional `connected` and `read` (absent means off, so `addFromRun` and `SKIP_ALL`/`SKIP_NONE` keep their meaning). In `seenAmong`, when `skip.connected`: one query on `Person` (`userId`, `slug in`, and `connectedAt not null` or `inviteState` not `NONE`). When `skip.read`: `PersonSnapshotService.recent` (already a batched read by slug and 30-day window). The `process.dedupe` executor passes `connected: config.skipConnected !== false` and `read: config.skipRead !== false` for the not-known group only, in the same 1,000-slug chunks. Count each rule separately for the message: "N already connected or invited and M read in the last 30 days were left out." (only when above 0, so a quiet run stays quiet).
- [x] 5. Verify on the real path (the item that most often fails): after the code gate, run the two new integration cases, then read the Discover step list of a local run and confirm "N posts marked done" with N above 0 and a dedupe `itemsOut` below `itemsIn`.
- [ ] 6. Staging check after deploy (by the owner or by read-only queries): the next scheduled Discover run shows "N posts marked done" with N above 0; `LinkedInPost` has `PROCESSED` rows; the People dedupe step drops people (it was 305 in, 281 out on 13 Nov, with 125 of the 281 read before); the profile step pays for fewer reads and the score step judges fewer people than the same-day input.
- [x] 7. Backfill migration `apps/brain/prisma/migrations/20261116200000_posts_processed_backfill/migration.sql` (SQL only, no schema change, safe to run again, same style as `20261110120000_campaign_labels_backfill`):

  ```sql
  -- Marks the posts a campaign's Discover runs already kept as processed (one-time backfill; safe to run again).
  UPDATE "LinkedInPost" p
  SET "status" = 'PROCESSED'
  WHERE p."status" = 'UNPROCESSED'
    AND p."tags" && ARRAY(SELECT c."label" FROM "Campaign" c WHERE c."userId" = p."userId");
  ```

  It touches only posts whose tags hold one of the same owner's campaign labels, so the 2 hand-added posts (no tag) stay. It leaves `updatedAt` as it is (Prisma sets it in the client, not the database), which is fine. Forward-only: no reverse statement (the owner can set a post back on the Posts page). A migration runs once, so posts found after it are decided by the fixed `markPosts`.
  Test: an integration case that inserts one tagged `UNPROCESSED` post, one untagged, one tagged for another owner's label, and one already `PROCESSED`, runs the SQL text of the migration, and asserts only the first changed (read the SQL from the migration file so the test cannot drift).
- [x] 8. `MEMORY.md`: a decision line for the two rules, the cause of the 0 marked posts, and the changelog line.

## Edge cases and risks

- Existing saved workflows change behaviour on the next run, on purpose. Every `process.dedupe` block in every owner workflow and automation (`recipes.ts:276,279`, `automations.ts:258,337,411,519`, `workflow.ts:7714`) now also drops connected, invited and recently read people. A workflow that wants those people (for example, deduping a commenter list in order to message connections) must switch the settings off on its block. Mention it in the changelog and in the block hints.
- A person the paid read judged "not a fit" is skipped for 30 days even if today's post makes them more relevant. That is the intent (no re-judging); the 30-day window ends it. Owner-wide: a rejection under one campaign's customer also skips them for another campaign's Discover for 30 days.
- A person read by something else (the owner opened their drawer, another workflow read them) and never judged for this campaign is skipped too. Rare; accepted with the owner-wide rule.
- Failures and retries: posts are marked only when every other step is `DONE` (kept as is), so a failed or partial run leaves its posts `UNPROCESSED` and the next run reads them again. Nothing is marked in a preview.
- Concurrency: only one run of a workflow is live at a time (`workflow_run_one_live`), and `setStatusBySlugs` is an idempotent update, so a repeated mark is harmless.
- Posts with no row (a link-pasted post, a post that was not kept) are not marked and cannot be recognised later; the dedupe already says "Turn on Keep in Find posts to remember posts" for them.
- A connection the owner made outside the app is known only after the next daily connection read (hours). A person Discover lists in between can still be invited once; the invite visit then answers "already connected" (#225) and records it, and the person is dropped from then on.
- `Person` rows may not exist yet for brand-new people ("54 people have no row yet"): they have no `connectedAt` and no invite, so they pass, correctly.
- Performance: one extra indexed query on `Person` (`userId, slug`) and one on `PersonSnapshot` per 1,000 slugs. Both are bounded by the dedupe input (a few hundred a day).
- Migrations: one data-only migration (step 7), no schema change; it runs in the brain migrate init container before brain and brain-worker start. Rollback: switch the two settings off on a block, or revert the commit; marked posts stay `PROCESSED` (the owner can set them back on the Posts page).
- The backfill also hides these posts from any workflow that takes waiting posts through "Posts I have" (`input.posts`, status `UNPROCESSED`). That is the owner's decision; checked on 2026-11-16 by reading every saved graph on staging: no workflow has an `input.posts` block, and no saved Remove duplicates block sets any of its settings to false (all are `{}` or `skipCompanyLabel` only), so the new defaults reach all of them.
- Security: no new input, no secrets, no new route.
- Docker, CI, deploy: none; brain and brain-worker run the same image, the body only shows two more toggles, so a body deployed first or last is fine.
- Cost: fewer paid profile reads and fewer AI judgements per run (on 13 Nov, up to 125 of 281 judgements avoided), no new paid call.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`
- `pnpm test:integration:run` (the new `dedupePeople` and the real-path `dedupePosts` cases must fail before the change and pass after)
- On staging after deploy, read only: the Discover step messages, the count of `PROCESSED` posts, and the dedupe in and out numbers, as in Approach step 6.
- Not testable here: the owner's body view of the two toggles (the body has no DOM test setup); look at the block settings on the Discover workflow in a browser.

## Outcome

Built on branch `fix/skip-known-posts-and-people` (not deployed; step 6 is for after the deploy).

- Shipped: `markPosts` marks by slug (`LinkedInPostService.setStatusBySlugs`); `process.dedupe` has `skipConnected` and `skipRead` (default on) and a step message with both counts; `SeenPeopleService.among` (new, `database/seenPeople.service.ts`) reads `Person` (connectedAt or invite state not NONE) and `PersonSnapshot` (fetched in the last 30 days) by slug; migration `20261116200000_posts_processed_backfill`.
- Tests: the real-path posts case (it printed "0 posts marked done." before the change), the people states case (11 people, both settings on and off), the backfill case (runs the migration text twice), and the contract case for the defaults. The people case failed on the defaults before the change.
- Deviations: step 1's "a failed or partial run leaves posts unmarked" case was not added (the gate is unchanged and a test for it was awkward to build with the fake client); the existing gate message is still there. The contract change needed no golden snapshot update (none covers this block).
- Existing tests changed: `campaignDiscover.integration.test.ts` now resets the posts and the profile reads before each run (a clean run marks its posts processed and a person read in the last 30 days is skipped, which is the new behaviour, so cases that reuse the same posts and people each need a fresh day); `engine.integration.test.ts`'s "use a full profile read in the last 30 days" case turns `skipRead` off on its dedupe block, because it tests the profile step's own reuse. The campaignDiscover cases now run the real mark-by-slug path.
- Not done: step 6, the staging check after the deploy; the settings were not looked at in a browser.
