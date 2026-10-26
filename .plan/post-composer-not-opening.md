# The post composer did not open on staging

- Status: done, not run live <!-- draft | locked | in progress | done -->
- Created: 2026-10-26
- Locked by user: yes, 2026-10-26 ("find the root cause and fix it with the staging environment and recreate it locally")

## Goal

A post from staging (account tripti.verma@elitale.com, 17:58 IST) ended "LinkedIn offers no place to write a post, so nothing was posted" (`NO_COMPOSER`). Find why from the staging run and make the task open the composer reliably.

## What the staging run showed (checked 2026-10-26, run `1f0f6062` in `gs://automate-linkedin-511215-spider/runs/linkedin-post/...`, files copied to `/tmp/staging-post-run`, outside the repo)

- The task opened `https://www.linkedin.com/sharing/compose` (13 s through the proxy), logged "Opened the composer", then looked for the box and the Post button for 45 s and gave up at 68 s.
- The video shows the feed ("Start a post" box, no dialog) for the whole time. The compose dialog never opened.
- The browser log has `Minified React error #418` (a hydration mismatch) 1 s after the page drew. LinkedIn opens the composer as a window over the feed; when the page is loaded straight on `/sharing/compose` and hydration fails, the window never mounts.
- So it was not a slow page: the composer was not going to appear by waiting.

## Requirements

Confirmed (from your request): find the root cause from the staging session and fix it, and be able to recreate it locally.

Decisions inside that:

- When the composer is not there after a short look, the task does what a person does: presses "Start a post" on the page; when that does not open it either, goes to the feed and presses it there; only then answers `NO_COMPOSER`. Nothing is typed before the box is there, so a post is never made twice.
- A test reproduces the staging page: the compose address draws the feed without the composer, so it fails before the fix. Local recreation of a staging run: copy its folder from the staging bucket, play it in the devtools ("Run a task" records a new run), or read it offline (commands in the final answer).
- No change to limits, audience or files.

## Scope and non-goals

- In scope: `tasks/linkedinPost/post.ts`, the "Start a post" selector in `linkedin/markup.ts`, tests, `MEMORY.md`.
- Out of scope: fixing LinkedIn's hydration error itself, a tool that downloads staging runs.

## Approach

- [x] 1. Read the staging run (result, timeline, logs, video).
- [x] 2. Test first: a page whose compose address shows the feed until "Start a post" is pressed; another that needs the feed visited first; one that never opens (still `NO_COMPOSER`, nothing typed).
- [x] 3. Code: short wait, press Start a post, go to the feed and press it, then the long wait as before.
- [x] 4. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, the real-browser stand-in test, `MEMORY.md`.

## Edge cases and risks

- The selector `div[aria-label="Start a post"]` was seen on the feed on 2026-10-25 and the box is in the staging video; its exact markup on this account is not verified. If it misses, the task still ends `NO_COMPOSER` as before.
- A second page load costs a few more seconds through the proxy; the account's browsing time is counted as before.
- Pressing Start a post on a page that already has the composer is harmless: it is only pressed when the box is missing.
- Nothing is typed or marked as attempted until the box and the Post button are there.
- Rollback: remove the fallback; the task goes back to waiting 45 s.

## Verification

- Unit tests for the three pages; the real Camoufox stand-in test of the post task; a live run on the Tripti account on staging after deploy, with your go-ahead (a real post is public).

## Outcome

Root cause: on staging the compose address drew the feed and LinkedIn's page failed to hydrate (React error #418), so the composer window never opened; waiting 45 s could not help. Fix: `sendPost` now waits a short while (6 looks), presses "Start a post" (`POST_START`, `div[aria-label="Start a post"]`), waits 8 looks, then opens the feed, presses it there and waits the long time as before; only then `NO_COMPOSER`. Nothing is typed or marked before the box and the Post button are there. Tests: three new pages in `post.unit.test.ts` (the compose address shows the feed and Start a post opens it; the first press opens nothing and the feed is needed; never opens, still `NO_COMPOSER`, nothing typed). Checks: lint, ts:check, unit tests and build pass. Not run: a live post on the Tripti account on staging (needs a deploy and your go-ahead); the selector is from the 2026-10-25 recording and the staging video, not read from this account's markup.
