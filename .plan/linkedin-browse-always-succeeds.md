# LinkedIn daily visit: always succeed when LinkedIn can be reached

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-10-28
- Locked by user: yes, 2026-10-28 for the three requirements below ("plan it and show me the plan and work on it"). The open questions at the end were answered by the defaults written there; the user can change one before the PR is merged.

## Goal

The daily visit (`linkedin-browse`) must finish as success whenever the account can reach LinkedIn: when LinkedIn changes its markup, the visit goes to the links directly; when the account is signed out in the middle of a visit, it signs in and carries on. A good run ends DONE with the feed and at least one post or profile opened. A failed run is one that LinkedIn itself refuses, a sign-in that does not work, or a time out; each says why in one fixed sentence. The 13-minute run of 2026-10-28 (account tripti.verma, session 7132d862) found 0 posts in a feed that had 12 and ended ERROR.

## Requirements

Confirmed (the user, 2026-10-28):

- The daily visit must always succeed. What that means in practice: a run that cannot succeed says why, and nothing is hidden.
- If the page structure changes, open the links directly, and get the post markup as close as possible to the real one.
- If the account is signed out, sign in and continue. The code signed in only at the start of a run; a sign-out in the middle ended the visit as SIGNED_OUT.

Answered by the defaults (open questions, now closed):

- An empty or unrecognised feed is ERROR, after about two to three minutes, not after 13.
- A mid-visit sign-in is attempted once per visit, with the stored password and the two-step key, as the runner does at the start. A second sign-out, or a sign-in that does not work, is SIGNED_OUT.
- When the feed shows no post, up to three of its profiles are opened by their addresses, read only.

## Scope and non-goals

- In scope: the feed's post markup (`linkedin/markup.ts`, `POST_BLOCK`) and the reader's rules for it, the mid-visit sign-in, the profile fallback for a feed with no post, the fast end, tests and a structure-only fixture from the real page of 2026-10-28, and the notes in `MEMORY.md` and the spider-task-writer skill.
- Out of scope: sending, posting, connecting or any write; the browse budget and pacing; other tasks; the 12-minute limit.

## Approach

Checklist from `.github/skills/spider-task-writer/assets/checklist.md`:

### 1. Plan
- [x] Plan exists in `.plan/` from `_template.md`; the goal says what a good run and each failed run look like.
- [x] Open questions answered by defaults; the user locked the requirements above.
- [x] Task name unchanged (`linkedin-browse`), version stays 1. The answers are the same DONE, SIGNED_OUT, ERROR, plus one new ERROR answer `NO_FEED` with its own fixed sentence (the verdict is unchanged).
- [x] Not a write task.

### 2. Lifecycle
- [x] The task assumes a signed-in feed at the start and repeats no sign-in of its own (the runner does those steps).
- [x] Every page the task lands on is checked for the sign-in page; a second sign-out is SIGNED_OUT and tested.
- [x] `commitSession: true` on DONE, as before.
- [x] Left on a normal signed-in page at the end, as before (`openFeed` at the end).
- [ ] The task run twice in a row on a test account: pending the staging visit after the merge.
- [x] Run folder files: unchanged runner; a failed run keeps `failure.html`.
- [x] A deliberate failure: the 2026-10-28 run folder is the failure this change answers.
- [x] No new runner file kind; the runner change is the `signInAgain` function in the context only.

### 3. Evidence from the real page
- [x] Real markup captured: `failure.html` of session 7132d862 (account tripti.verma, 2026-10-28). Only the structure is kept in `linkedin/feedFixture.ts` (member, company and feed links with sizes, the ad label; no names, text or addresses).
- [ ] Other accounts: only one account was seen. The layout on other accounts is unverified.
- [x] Selectors are plain attributes, not generated class names: `componentkey` prefix `expanded` and the id suffix `FeedType_MAIN_FEED_RELEVANCE`, in `linkedin/markup.ts` with the date. The old `data-view-name` selector stays in the same comma list.
- [x] Real-browser check on the saved page (probe in the temp folder, not committed): `POST_BLOCK` matches 12 blocks; `readFeed` reads 11 posts (the one "Promoted by" block is left out), 11 with an author link, 10 with an image, 1 with an address (only the posts with comments carry an id in their markup).
- [x] Own-profile detection: lost in this layout (no `identity-self-profile` view). Known gap: the visit can open its own profile as an author; that is read only.

### 4. Tests first
- [x] Fixture for the current layout (`feedFixture.ts`) from the real page, structure only.
- [x] Reader tests: current layout read in order (11 of 12), promoted block left out in either layout, older-layout block without an action bar left out, `profilesOnPage` (own, company, post, repeat, limit).
- [x] Task tests: NO_FEED with the fixed sentence, three profiles opened by address and DONE, one sign-in in the middle and the walk goes on from its target, a second sign-out is SIGNED_OUT, a sign-in that does not work is SIGNED_OUT without a second try. The old "no post of a person" test now expects NO_FEED.
- [x] Runner test: the task can sign in again once during its run; it waits and scrolls only when that worked; a failed one answers false.
- [x] No new driver call except the `promoted` flag in the block inspection (`camoufoxDriver.ts`, `driver.ts`); the recording session forwards blocks as before.
- [x] Real-browser run of the e2e file `browse.e2e.test.ts` with `--testTimeout=120000`: 3 passed. A separate e2e stand-in for the current page shape was not added; the probe above is the real-browser check.

### 5. Build
- [x] `tasks/linkedinBrowse` changed in place; the registry is unchanged.
- [x] `defineTask` change: one optional field `signInAgain` on the context (absent without an account).
- [x] Waits are bounded; the feed reading (2 to 3 minutes) runs before the empty-feed check, so a slow draw is not read as empty.
- [x] Pacing as before.
- [x] Fixed sentences only in logs and results (`FEED_EMPTY`, the NO_FEED message).
- [x] Deviation from the first plan: one `signInAgain` function from the runner (validate, then the 5 s wait and scroll), not two callbacks. The start-of-run sign-in in the runner is unchanged.

### 6. Brain side
- [x] No contract change; no new verdict.
- [x] No brain change.
- [ ] The spider worker is redeployed (CI on merge to `main`) so brain sees the task definition.

### 7. Verify
- [x] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root (1294 spider unit tests before the runner test; 103 runner tests after).
- [x] Real browser on the fixture page: the new selector finds the 12 posts; the reader reads 11.
- [ ] A staging visit on the same account after the deploy, read from its run folder: DONE, with posts or profiles opened.
- [ ] Failed runs read from `logs.json`, `timeline.json` and `failure.html`, not guessed.

### 8. Close
- [ ] Plan status `done` and the Outcome below checked after the staging visit.
- [x] `MEMORY.md`: the markup seen (account, date), the sign-in rule change, open items, one changelog line.
- [x] `.github/copilot-instructions.md` and the spider-task-writer skill: the sign-in rule now names the one exception (`signInAgain`).
- [ ] Conventional commits; no recordings, no `.env` files, no `failure.html` or `saved-feed.html` in the repo (they stay in the temp folder).

## Edge cases and risks

- **The layout changes again.** The old and new selectors are both tried. If neither matches, the visit opens up to three profiles by address; if there are none, it ends NO_FEED with "The feed showed no post and no profile to open." after about 2 to 3 minutes.
- **A feed with posts, none of which can be opened.** Not covered by the fallback: the walk still goes target by target (4 failures in a row, about 13 minutes, NO_CYCLE). Possible follow-up.
- **Profile links are not people the account knows.** They are the feed's own links to members. The visit only opens them, reads nothing, and goes back. Three per visit at most.
- **Own profile as an author.** Not known in this layout; the account's own post could be opened as "someone else's" (read only).
- **Sign-out in the middle of a click.** The visit signs in once through the runner's sign-in, waits 5 s, scrolls, reopens the feed, and continues with the targets it had not begun. A second sign-out ends the visit SIGNED_OUT.
- **A sign-in that needs a person** (a security check). The runner's sign-in answers that as not working, so the visit answers SIGNED_OUT. No takeover mid-visit.
- **Sign-in changes the saved session.** The session is saved on DONE (`commitSession`), so a visit that signed in again keeps its new session.
- **Timeouts.** The visit still ends by its 12-minute limit; the fast end is the normal path for an empty feed.
- **Proxy slowness.** The feed draws in 15 to 30 s; the bounded loops are unchanged.
- **Concurrency.** One browser per account (`oneAtATime: account`), unchanged.
- **Idempotency.** The visit only reads and opens links; nothing irreversible.
- **Rollback.** Revert the PR; the old selector only matches the old layout again, so a rollback brings back the 13-minute failure on the current layout.
- **Security.** No names or text in fixtures; no password or code in logs; the sign-in uses the runner's path only.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root: passes.
- `pnpm --filter @automatedLinkedIn/spider exec vitest --run <linkedinBrowse, feed reader and runner tests>` with full paths: passes.
- Real browser, the 2026-10-28 page, in the local Camoufox: `POST_BLOCK` gives 12 blocks, `readFeed` gives 11 posts.
- After the merge and the deploy: one staging visit on the same account, read from its run folder.

## Outcome

Built on branch `fix/linkedin-browse-current-feed-layout` (not yet merged, not yet run on staging):

- `POST_BLOCK` takes both layouts; the reader reads posts of the current layout from their structure, leaves out the ad by its label, and keeps the action-bar rule for the older layout only.
- A feed with no post after the feed reading opens up to three of its profiles by address and ends DONE; with no profile either it ends NO_FEED (ERROR, fixed sentence) after about 2 to 3 minutes.
- A sign-in asked in the middle of the walk is answered once (`signInAgain` in the task context, from the runner); the walk goes on from the target it was on; a second sign-out or a failed sign-in is SIGNED_OUT.

Deviations from the plan: one `signInAgain` function instead of separate `signIn` and `afterSignIn`; the profile fallback covers only a feed with no post (not a feed with posts none of which can be opened); no separate e2e stand-in for the new page shape (the real-browser probe is the check).

Follow-ups: own-profile detection in the current layout; the feed with posts but none openable (still 13 minutes); the layout on other accounts; the staging visit on tripti.verma after the deploy; the leftover Kubernetes `spider-worker` Deployment, Service and ServiceAccount to delete after PR #124 is merged.
