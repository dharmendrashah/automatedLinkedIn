# A daily visit that browses like a person: feed, posts and profiles, back and forth

- Status: locked
- Created: 2026-10-19
- Locked by user: yes, 2026-10-19 (answers below); the walk code waits for the real page capture (approach step 2)

## Goal

`linkedin-browse` (`apps/spider/src/tasks/linkedinBrowse`) lands on the feed, reads down it for a few minutes, then moves around the way a person does: out of the feed into a post, into an author's profile, or into a post and then its author, and back again, for 5 to 8 of them. It only reads: no like, comment, follow, connect, message, share or save.

## What the local recordings show (`apps/spider/.devtools-recordings`, 2026-10-18)

Four local daily visits (`runs/linkedin-browse/devtools/2026/10/18/*`), two sign-in checks, two human-driven sign-in sessions. Only the visit `a03c2643` got to the feed and the profile (46 seconds, DONE).

- **The feed is the new LinkedIn web app** (`flagship-web`, server-rendered components: requests to `/flagship-web/rsc-action/...` and `voyager/api/graphql`). The page loads slowly: the feed took 6.4 s to reach DOMcontentloaded, the profile 4.2 s, avatars and images arrive later.
- **The current code found no post to open** (log: "The feed showed no post to open") although the screenshots show posts. So the old guess, post links as `href="/feed/update/urn:li:activity:..."` in the page HTML, does not hold on the real feed. The real markup of a post (where its permalink is, if it is a link at all) is not in any recording: the network log keeps no response bodies and no page HTML of the feed was saved. This is the main unknown, and the first step of the work is to capture it.
- **What is on the real feed**, in order: the start-a-post box, a "Recommended for you" card of people with **Follow** buttons, then posts, each with a header ("Lovish Kumar likes this" above the author, name, "3rd+", headline, age such as "2d", a **Follow** button, a menu and a close button), the text, and the action bar. The right rail has puzzle games, "Add to your feed" (people and companies with Follow buttons) and a Premium banner; the left rail has the own profile card with links (profile viewers, analytics).
- **A docked Messaging tray** sits at the bottom right and covers part of the page; a click that lands there would open a conversation list.
- **Profile page** (own): header with cover, photo, name, buttons (Open to, Add section, Enhance profile), a "Tell non-profits" card, then sections that load a moment later (placeholders at first).
- **Failure and sign-out cases already seen**: a feed that loops until a 429 (`320f5fe2`), a stored session that is signed out (`0fe6eea6`, `57751caf`).
- **Timing of the existing visit**: scrolls of 400 to 900 px every 1 to 4 seconds, which is steady and mechanical; no pointer movement at all.

What this changes in the plan: links cannot be assumed to exist as plain anchors with the old patterns, so the first work item is a capture of the real pages (below), and every click target is checked on screen (it is the topmost element at its point, fully in view, not behind the Messaging tray, an overlay or a sticky bar) before it is clicked.

## What exists (2026-10-19)

- `browse.ts` opens URLs with `visit(url)` (a fresh page load each time): feed, `/in/me/`, then 1 or 2 posts and their authors, with links read out of the page HTML by regex. It never clicks anything on the feed and never goes back, so the session looks like a series of address-bar loads, and the run is short (about 2 to 3.5 minutes).
- The driver has `scrollBy` (mouse wheel, down only in practice), `click(selector)` (waits for DOMcontentloaded, which a single-page app does not trigger), `exists`, `pageHtml`. There is no back navigation, no scroll up, no link-in-view lookup, no hover.
- `visit` applies the allowlist, robots exemption and per-host rate limit. A click that navigates would skip all three (the browser-level `WebsiteFilter` still blocks other hosts).
- Task limit is 6 minutes. A throw that escapes (a failed page load outside the post loop) ends as "The browser failed" after 4 attempts (seen on staging; the retries rerun the whole visit).
- The stand-in site in `browse.e2e.test.ts` serves plain multi-page HTML (no single-page navigation, no history).

## Findings of the first capture (2026-10-19, run `22862fe0`, local, the owner's account)

- **The feed never scrolled.** The screenshots after every scroll step are identical and the inspection after the four to eight scrolls says `scrollY 0`. The wheel goes to the element under the pointer, which starts in the top-left corner over LinkedIn's header, so the whole visit stayed at the top of the feed. Fixed in the driver (`scrollBy`): the pointer first rests over the middle of the page, the scroll position is read back, and a wheel that moved nothing (with room to move) is followed by a scroll made by the page itself; tested in a real browser against a header that takes the wheel and a page that cancels it. It still has to be seen working on LinkedIn.
- **A post on today's feed has no link of its own.** The feed holds 0 `/feed/update/...` anchors. A post is `div[data-view-name=feed-full-update]` inside `div[role=listitem]`; the age ("12h • Edited") is plain text; the image, article and reactions anchors carry `href="/feed/"` and do their work in script; the only anchors that lead somewhere are the author (`a[data-view-name=feed-actor]`, an empty overlay anchor over the header plus the name anchor), mentions inside the text (`feed-commentary`), commenters (`comment-container`) and company pages. The post's id exists only inside the page data (`componentkey` of the commentary holds `userGeneratedContentId=<id>`, one header has `data-sdui-anchor-id="feed-header-urn:li:activity:<id>-0"`).
- **Dangers found on the real feed.** The "Recommended for you" and "Add to your feed" rows are whole-row anchors that contain a **Follow button** (`edge-creation-follow-action`), so a click on the row's right side follows a person. The header of a sponsored post has a "Visit website" anchor to `/safety/go?url=...` (leaves LinkedIn). Games (`/games/...`), Premium, the Messaging tray and "Retry Premium" are also links. The click rule therefore needs: the point under the pointer must be inside the author anchor and not inside any button or follow action, and the link must not be in a recommendation block, a promoted post, or the commentary.
- **The own profile opens fine** (`/in/me/`, 52 s visit, DONE), so the profile route works with real clicks on author anchors.
- **Open decision for "feed -> post":** because a post has no link, there are three ways. (A) Open the post by its address, built from the id in the page data (`/feed/update/urn:li:ugcPost:<id>/`), after scrolling it into view and hovering its header, like a person who clicked the age. (B) First find out what a click on the post body does on this feed (the owner can try it by hand once and say what happens). (C) Leave the post page out and make the cycles feed to profile, plus reading the post in the feed (expand "more", scroll). The plan continues with (A) unless the owner prefers otherwise.

## Decision (2026-10-20): feed to post is option A

The owner chose (A): a post is opened by its address, built from the id in its markup (`/feed/update/urn:li:ugcPost:<id>/`), after the pointer rests on its header; profiles are opened by real clicks on the author link. Built as: `feedReader.ts` (posts, ids, author, what is never opened), `walk.ts` (the plan and the timings), `browse.ts` (the walk), the driver's `inspect({ block })`, `clickLink`, `clickSelector`, `back`, `hover`, `drift`. If a post address does not open a post twice, the rest of the walk goes by profiles. A visit is DONE only after one whole cycle; otherwise it ends `ERROR` ("could not open a post or a profile from the feed") or `ERROR` ("stopped early") and is not retried. Not yet seen on live LinkedIn: whether `/feed/update/urn:li:ugcPost:<id>/` opens the post on this feed, and how a profile click behaves; the first local run (`pnpm record`, LinkedIn daily visit, snapshots on) settles both.

## Decision (2026-10-20, probes): a post with an image opens in a window, not by address

Probes on real LinkedIn by the owner: a click on a post's text changes nothing; a click on its image or article card changes no address and opens a window over the feed with the post and its comments beside it; the "N comments" count opens the comments inline; hovering the reactions shows a picker. About half of the posts have no id in their markup, so they cannot be opened by address.

- A post whose image shows is opened by a click inside the image link (`clickInside`, never over a button, never the Send link, `view-likers` or `feed-article`), read with the pointer resting on the comments side, and closed with Escape (verified; one retry, else the visit reloads the feed and the failure counts toward the two-failure fallback to authors).
- A post without a shown image but with an id is still opened by address. A "post, then profile" route reads the window, closes it, scrolls the author's name into view and clicks it.
- Own posts are never chosen. The window's real markup is captured as `window.html` when snapshots are on, to be checked against the live recording.

## Proposal

### 1. The walk (a plan made up front, then performed)

`planWalk(random)` is a pure function (seeded in tests) that returns the walk before the browser opens:

- **Feed reading:** one block of 120 to 180 seconds (random per run). Made of bursts: a smooth scroll (several wheel ticks of 40 to 120 px, 20 to 60 ms apart), then a reading pause of 1 to 6 seconds, longer after a long post; now and then a small scroll back up (100 to 400 px), a short idle (mouse still, 3 to 8 s), a mouse drift. Speed and pauses vary from burst to burst.
- **Targets:** 5 to 8 items, never the same item twice, each with a route chosen by weight:
   - `feed -> post -> back` (about 35 percent)
   - `feed -> profile -> back` (about 30 percent), from the author's name or avatar on the feed item
   - `feed -> post -> profile -> back, back` (about 35 percent), the author from the post page
- **Between targets:** 15 to 60 seconds more feed scrolling, which also brings fresh items into view.
- **Dwell:** on a post 20 to 60 s (scroll down, some up, a pause on the text); on a profile 15 to 45 s (scroll the top sections, a pause, scroll back up a bit).
- **End:** back on the feed, a short scroll, and the feed must still open (a session that LinkedIn cancelled mid-visit is never saved, as today).
- **Budget:** about 7 to 10 minutes in all. At 80 percent of the time limit it stops picking new targets and finishes on the feed.

### 2. Clicking like a person (new browser capabilities)

All navigation inside the walk is done with real clicks and the browser's back, not `goto`:

- `linksInView(kinds)`: the visible links of the page whose address matches an allow-list pattern (post permalink `/feed/update/urn:li:(activity|share|ugcPost):<id>` and `/posts/...`, profile `/in/<slug>`, company `/company/<slug>`; the final patterns come from the capture) with their position on screen. Only anchors, never buttons, and never anything inside a button or a control (like, comment, repost, send, follow, connect, message, reaction menus, the post menu, the close button), never the "Recommended for you" and "Add to your feed" Follow areas, games, Premium or ad links. That is the safety rule: the click target must be an anchor to a read-only page.
- **On-screen check before every click:** the target is fully inside the window, and the element at its click point is the link itself (or inside it), so nothing covers it: the Messaging tray, a sticky bar, a pop-up. A covered target is skipped.
- `clickLink(link)`: moves the mouse along a path to a random point inside the link's box (never the exact centre), hovers briefly, clicks, then waits for the page to change (address changed or the main content replaced), with a time limit. Single-page navigation counts as a change; a click that changes nothing is a failed step.
- `back()`: the browser's back (history), then waits until the feed is shown again; if back leaves the site or lands on a blank page, it opens the feed instead.
- `scrollBy` accepts negative amounts (up) and reports whether there is more page in that direction; smooth multi-tick scroll helper in the task.
- `follow` check: after any click the landed address is checked against the same allowlist, and the per-host gap applies (shared with `visit`, so one rule, not two). A landing off the allowlist or on a sign-in or security page ends the walk (SIGNED_OUT or stop), never continues.

### 3. Safe handling of what a real page does (the "bullet proof" part)

- **Overlays and pop-ups** (messaging tray, notification prompts, cookie or ads consent): consent is accepted as today; other overlays are ignored unless they block the click, then Escape is pressed once.
- **Feed slow or empty:** wait and scroll more before choosing; with nothing to click after a limit, the walk ends with fewer targets.
- **A target that fails** (click did nothing, page would not load, back went wrong): recorded as a warning, the walk recovers to the feed (back, else open the feed) and goes on. After 3 failures in a row the walk stops and finishes on the feed.
- **Sign-in or security page at any step:** SIGNED_OUT (the sign-in check runs next, as today).
- **No unhandled throw:** the whole walk is inside one guard, so a failure becomes a verdict, not 4 retries of a 9 minute run.
- **Report:** the run's report lists what was done (feed minutes, targets visited with their kind, failures), with no names, text or addresses of other people.

### 4. Task and worker settings

- Task limit raised from 6 to 12 minutes; the video stays 640x360. The worker's shutdown grace (540 s) and the pod's 600 s grace stay; a visit stopped by a deploy is handed back as today.
- A new non-retried verdict `ERROR` ("The visit stopped early") for an unexpected failure, so it is not run again 3 times.
- Randomness and timing live in one small module (`walk.ts`) with every number named, so they can be tuned without touching the click code.

## Requirements

Confirmed (the request, and the owner's answers of 2026-10-19):

- Land on the feed, scroll for 2 to 3 minutes, dynamically. The 2 to 3 minutes are the first feed scroll only; the 5 to 8 targets come after it, so a visit takes about 7 to 10 minutes (limit 12), roughly 130 accounts a day per worker.
- Click posts and scroll them; go back and forth between feed and post, feed and profile, feed, post and profile; 5 to 8 targets.
- Route mix about 35 percent post only, 30 percent profile only, 35 percent post then profile; company pages count as profiles.
- Extra interactions, and only these: hover before clicking, scroll back up, drift the mouse while reading, expand "see more" only inside the post being read. Nothing else.
- Pure browsing, no actions of any kind.
- **DONE needs at least one whole cycle**: the feed opened, at least one full route (into the post or profile and back to the feed) was completed, and the feed still opens at the end. A visit with no whole cycle is not DONE: it ends `ERROR` with a message that says what was missing (for example "no post or profile could be opened from the feed"), so the problem shows on the account instead of passing quietly. SIGNED_OUT as today; `ERROR` also for an unexpected stop, which is not retried.
- Once a day at a random time, the 1 hour cooldown and the confirmation for manual runs stay as they are.
- Reliable, and shown working before it is called done.

Open questions: none. The real page markup is not a question to the owner but a work item (approach step 2): it needs one capture run on a real account on the owner's machine.

## Scope and non-goals

- In scope: `planWalk` and the walk, the new browser capabilities (links in view, click link, back, scroll up), the allowlist and rate limit on clicked navigation, the new verdict, the limit change, tests, the stand-in site, MEMORY.md.
- Out of scope: any action on content (reactions, comments, follows, invitations, messages, shares, saves), reading or storing what is seen, search, messaging or notification pages, a UI to tune the walk, changes to the sign-in check or to scheduling.

## Approach

- [x] 1. Lock this plan (answers of 2026-10-19).
- [~] 2. **Capture the real pages first, inside the same task (`linkedin-browse`, not a new one).** Done on 2026-10-19 (run `22862fe0`, see "Findings of the first capture" below). The task takes an input `snapshots` (default false, so the daily job and the web app never keep anything). When true, the first feed (after the scroll), the own profile, the first post and its author are kept with the run: the page markup without scripts and styles (`<name>.html`), `<name>.inspect.json` (every link and control with its box, whether it is in view or covered, and its surrounding elements with their `data-*` names), and a screenshot. Run it locally with `pnpm --filter @automatedLinkedIn/spider dev:record` (Run a task, LinkedIn daily visit, answer `true` to snapshots); the files are in `.devtools-recordings/runs/linkedin-browse/devtools/<date>/<id>/files` and stay local (git-ignored). The driver got `inspect()` (shared with the walk later). **Waiting for the owner's run**; from it I write the real link patterns, the post container rule, the "see more" control and the not-a-control rule. If the feed holds no post permalink anchor, the post route clicks what the capture shows opens a post, and the plan is updated before the walk is coded.
- [ ] 3. Tests first:
   - `planWalk`: counts (5 to 8 targets), route mix, no repeats, durations inside the ranges, deterministic for a seed, total time under the budget.
   - Walk with a fake browser: routes performed in order, back after each, recovery after a failed click, stop after 3 failures in a row, SIGNED_OUT at any step, 80 percent budget rule, nothing is clicked that is not an allowed link or that is covered, no unhandled throw, no whole cycle gives `ERROR` and one whole cycle gives DONE.
   - Driver: `linksInView`, `clickLink`, `back`, negative scroll (real Camoufox, e2e).
   - E2E against an extended stand-in site: single-page navigation (history push), feed with posts that have author links and action buttons (which must never be clicked), post pages, profiles, a sign-in redirect, an overlay in the way.
- [ ] 4. Code: `walk.ts`, driver and context capabilities, the task, the limit, the verdict and its label.
- [ ] 5. Gates, the e2e in real Camoufox, a local `pnpm record` visit by the owner on a real account and a look at the recording (video, steps, timing), MEMORY.md, Outcome.
- [ ] 6. After deploy: one manual visit on staging, check the Sessions video, steps and timing; watch worker memory.

## Edge cases and risks

- **Compliance:** the visit is a read-only day in the life of the owner's own account, once a day, within one session; it does not collect or store what it sees and respects the allowlist and rate limit. A longer visit means more page views per day (about 15 to 25), which is in the range of a normal person; no action is ever sent. Volume per account stays at one visit a day plus confirmed manual ones.
- **Detection:** real clicks, smooth scrolling and variable timing look more like a person than address-bar loads, but this is not a guarantee, and LinkedIn can change its behaviour at any time. Nothing here tries to defeat a security check: a check page ends the visit.
- **Slow pages:** the real feed took 6.4 s to load and its content arrives after that, so every step waits for the page to show a link or settle (up to 15 s) instead of a fixed pause; a page that never shows content counts as a failed step.
- **Markup changes:** link patterns are by address, not class, so a redesign breaks less; when nothing matches, the walk ends with no whole cycle and the run says `ERROR` with that message, which is visible on the account. The capture (step 2) and the first real run are the proof, which is why they need the owner's real account.
- **Single-page navigation:** back and click rely on history entries; LinkedIn may replace history, so back is always verified (the feed is shown) and falls back to opening the feed.
- **Memory and time:** a 10 minute run with video and many pages uses more memory than a sign-in (peak was 1.7 Gi of a 3 Gi limit); watch it on the first staging runs. A deploy during a visit hands it back to the queue (existing behaviour).
- **Retries:** an unexpected failure is a verdict, not a crash, so a failed 9 minute run is not run 3 more times.
- **Clicking the wrong thing:** the allow-list of link patterns plus "never inside a control" is enforced in one function and tested with a feed full of action buttons.
- **Account lease and worker:** one run per account at a time stays; a 10 minute run holds the worker for that time.
- **Rollback:** revert the task and driver change; the previous visit comes back. No migration.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- The real-Camoufox e2e for the driver and the walk against the stand-in (`--testTimeout=90000`).
- A local `pnpm record` visit with a real account, watched by the owner; then one manual visit on staging.
- Not provable by me: how the real LinkedIn pages behave, until the owner's real run.

## Outcome

Filled in when done.
