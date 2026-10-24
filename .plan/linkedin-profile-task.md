# Spider task `linkedin-profile`: read an account's own profile

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-10-24
- Locked by user: yes, 2026-10-24 ("all defaults are fine": the two steps, all detail pages up to 14 loads, suggestions and recommenders read as shown and never opened, analytics read, 10 posts and 10 comments, no schedule, recordings as for messages, synthetic fixtures only)

## Goal

A spider task that signs in with an account's saved session, reads the account's own LinkedIn profile, and hands it to the platform as one `profile.json` that follows `accountProfileSchema` (`packages/contracts/src/profile.ts`, the shape the profile page already shows on sample data). It gathers everything the page needs: header (cover, photo, name, headline, location, followers, connections), open to work, about, top skills, services, analytics, activity, experience, education, projects, skills, recommendations (received and given), languages, interests, and the suggestions (people you may know, you might like). This plan is the spider only; storing it in brain and switching the page from sample data to the real thing is the next plan.

## What exists today (checked in code, 2026-10-24)

- The task framework (`tasks/defineTask.ts`, `registry.ts`): a task is a folder plus one line in the registry; the runner opens the saved session behind the proxy, takes the account lease, records the run, applies the allowlist, robots exemption and rate limit in `context.visit`, and publishes the `TaskResult`. A file of any size goes out with `context.attach(name, content, type)` and is served to the owner by a signed link in `/sessions`.
- The browsing toolkit used by `linkedin-messages` and the daily visit: `browsing/hands` (inspect, html, clickNth, clickSelector, scrollOver, fetchFile), `reader` (human pacing), `snapshot` (`createKeep`: the page's HTML and `inspect.json` kept with the run), `targets` (budget and failures in a row), `linkedin/session` (`SignedOut`, consent), `linkedin/pace`.
- `linkedin-messages` was built in two steps and the same two steps apply here: a capture of the real page first (selectors come from recorded markup, never from guesses), then readers written test-first over pages made like the real one (`messageReader.ts`, `messagingFixture.ts`, a stand-in page for a real-browser test).
- The profile contract and the page that shows it exist (PR #90). Its "Read profile" button is disabled until this task and the brain side exist.
- Nothing in the spider knows the markup of the profile page. The only profile-related code is the feed reader's links to other people's `/in/<slug>/` pages (it skips `/in/me/`).
- The account's page language is the main language of its proxy's exit country (MEMORY, 2026-10-15), so headings and dates come in that language, not always English.

## Proposal

### Capture first (step 1 of the build)

- The task `linkedin-profile` is registered with only a capture mode: it opens `/in/me/` (LinkedIn sends it to the account's own address), scrolls the page slowly to the end so lazy sections draw, and keeps the page as `snapshots` (HTML and `inspect.json`); then it opens each "Show all" detail page (experience, education, projects, skills, recommendations received and given, languages, interests, recent activity posts and comments) the same way and keeps each one. No parsing yet.
- You run it locally on one account with `pnpm --filter @automatedLinkedIn/spider dev:record` (Run a task, `snapshots` on), as for messages, and share the recording. The findings (stable attributes, how sections and "Show all" are marked, how lists load) go in `MEMORY.md`, and the readers are written from the real pages.
- Without that recording the readers would be guesses on a page that changes often; I will not write them before it.

### The task (after the capture)

- Folder `apps/spider/src/tasks/linkedinProfile/` (`index.ts`, `read.ts`, `answer.ts`, `profileFile.ts`) and pure readers `linkedin/profileReader.ts` with fixtures (`profileFixture.ts`); selectors in `linkedin/markup.ts`. One line in `tasks/registry.ts`; the version is 1.
- Account required, proxy required, one at a time per account. Input: `sections` (which to read, default all; a section can be asked for alone to retry it) and `snapshots`.
- Order, human-paced, one page after the other:
  1. The profile page: header, open to work, about, top skills, services, analytics, the first of each list, activity preview, and the two suggestion cards.
  2. For each list that has "Show all": open its detail page by its own link and read the whole list (experience, education, projects, skills, recommendations received and given, languages, interests by tab, recent posts and comments).
  3. Build `profile.json`, check it with `accountProfileSchema`, and attach it.
- Rows are found by structure (the section's anchor or detail-page address), not by the heading text, because the headings come in the account's language. Dates, durations and counts stay as the text LinkedIn shows (the contract says so); `followers` is parsed to a number only when it reads as one in any locale, else left out.
- Result: `profile.json` as a sensitive file artifact; the report has counts only (sections read, items per section, sections that failed). Verdicts: `DONE` (every wanted section read), `PARTIAL` (some sections failed or the time ran out; the rest is in the file), `SIGNED_OUT`, `ERROR` (nothing could be read). A section that cannot be read is left empty and named in the report by its fixed title; it never fails the whole run.
- Budget and pace: no new page is begun after 8 minutes (task limit 12 minutes), at most 14 page loads, a human pause between pages, scrolling at a person's pace; three pages in a row that fail end the run.
- Logging rule as for messages: names, headlines and words of the profile never reach the log, a warning or the report (a test checks it); counts and fixed sentences only.
- Nothing is ever clicked that changes the profile or sends anything: no edit pencils, Add section, Connect, Follow, Message, Endorse or Open to work. The clickable set is only the profile's own "Show all" links, tabs of Interests and Activity, and "see more" expanders (an allowlist of clicks; everything else is `NEVER_CLICK`).
- Reading other people's pages is out: the suggestion and recommendation cards are read as they are shown (name, headline, degree, followers text, their `linkedin.com` address as text); none of those profiles is opened.

### Out of this plan

- Brain: the table that holds the profile, the hook and import of `profile.json`, the tRPC procedure, the "Read profile" button, a schedule, retention. The page keeps showing sample data until then.
- Downloading or keeping pictures: only their `https` addresses go in the file (they expire); a later plan keeps copies in the bucket as it does for received images.

## Open questions (answered 2026-10-24: all defaults accepted)

The nine questions were answered "all defaults are fine"; the defaults are the ones written in the Proposal above. The capture is run by the owner on one account of their choice, chosen in the devtools menu.

## Approach

- [x] 1. Lock this plan (answer the questions).
- [x] 2a. Capture-only task registered (`snapshots` pages of the profile and its detail pages) with unit tests (built 2026-10-24: `tasks/linkedinProfile/`, task `linkedin-profile` v1; the profile keeps its markup, links and controls and a picture, each of the ten detail pages its markup and a picture, because a run keeps at most 20 files).
- [x] 2b. First capture run by the owner (2026-10-24, 11 pages, 171 s, one account with a sparse profile). Findings below and in `MEMORY.md`.
- [x] 2c. Third capture (2026-10-24, run `b91a6088`, a fuller account: 11 pages, 154 s) with projects, recommendations received and given, languages, services, open to work, a top-voices chip and 20 posts (3 reposts). The Interests chips were still not clicked (fixed, see below), so the Companies, Groups, Newsletters and Schools chips are still unseen; one more capture is needed for those.
- [x] 3. Readers in `linkedin/profileReader.ts` (top card, about, analytics, followers, experience, education, skills, interests, suggestions, posts, comments), written from the two captures, with synthetic fixtures (`profileFixture.ts`) and tests; also run over the real captured pages (outside the repo) and fixed to read them.
- [x] 3b. Readers added from the third capture: projects, languages, recommendations (received and given, one reader), services, open to work; fixed on the real pages: posts (reposts by a person or a company, reactions, comments, reposts, impressions, picture; before, a repost by a company was dropped and one by a person got the wrong author), Top Voices (degree, headline and followers each in its own place), and the missing space around a mention or a hashtag in every text.
- [x] 4. `tasks/linkedinProfile/read.ts` (the walk, budget, failures, chips, contract check that drops a section that does not fit), `pages.ts` (shared with the capture), `answer.ts` (`answerForRead`, counts only), `index.ts` (task version 2: input `capture` and `snapshots`); unit tests with a stateful fake page. Now opens the same ten detail pages as the capture (`DETAIL_PAGES`).
- [x] 4b. Chip fix: the chips are `div[role=radio]` blocks at the top of the page, and the page had been scrolled to its end, so the click found nothing in view. The fourth capture (`bb413008`) showed the real cause for that run: the detail addresses were built on `/in/me/`, which LinkedIn answers for Interests and activity with the profile page, so there were no chips; `openOwn` now takes the vanity address from the top card's photo link. The fifth (`ae47281a`) showed that the Home key does not scroll the page back up, so `eachInterestTab` scrolls up with the wheel until `scrollY` is 0. Not seen to work live yet.
- [ ] 5. A real-browser test against a stand-in profile page. Not done (the unit tests use a fake page; the readers were checked on the real pages).
- [ ] 6. A local run of the reading on a real account (`dev:record`, LinkedIn profile, `capture` off), read `profile.json` and the log; one more capture for the four Interests chips; `MEMORY.md`; plan done.

## Edge cases and risks

- **Markup unknown (the main risk):** the profile page is the flagship app, not the classic messaging app; classes may be generated and change often. Hence the capture first, structural anchors, and a reader per section that fails alone. A page change makes a section empty and the run `PARTIAL`, never a crash and never wrong data under another heading.
- **Language and number formats:** a German or Spanish page (the account's language follows its proxy). Sections are found by anchor or address, text is kept as shown, counts are parsed only when unambiguous. The readers' tests include a non-English fixture.
- **Not every profile is full:** no cover, no photo, no about, no services, no open to work, a creator profile with other cards, Premium badges, "Show all" absent when the list is short. Every field is optional in the contract; the reader returns what exists.
- **Lazy lists and "see more":** lists draw as the page scrolls; "…more" expanders hide long texts. Scrolling stops when nothing new arrives after a few steps; expanders on the owner's own text are clicked (read only); caps per list (the contract's maxima) keep the file small.
- **Redirects and sign-out:** `/in/me/` redirects to the vanity address; a login or checkpoint page ends the run `SIGNED_OUT` (the sign-in check runs next, as for messages). A security check mid-run is not handled here.
- **Detail-page addresses:** built from the final profile address the page redirected to, never from text of the profile.
- **Volume and detection:** up to 14 page loads in a row is more than a person opens when looking at their own profile; the cap, the pauses and the manual-only start keep it small, and the lease keeps it away from the messages read and the daily visit on the same account.
- **Privacy:** the file holds third parties' names, headlines and recommendation texts. It is `sensitive`, owner-only, behind a signed link, never in logs or the report. The brain plan decides storage, retention and erasure for it before anything is kept.
- **Compliance:** this reads the signed-in user's own profile through LinkedIn's own interface at a human pace, read only; it sends nothing, edits nothing and opens no other person's profile. Third-party data is limited to what LinkedIn shows on the owner's own page.
- **Picture addresses:** `https` only, as the contract demands; one that is not (a data address, `blob:`) is dropped.
- **Large output:** per-list caps and a text cap keep `profile.json` far under the run's file limit; past a cap the list is cut and the section is marked in the report.
- **Concurrency and replays:** one run per account (the lease); a command delivered twice is skipped by the runner's done marker; the task only reads, so a second run is harmless.
- **Rollback:** a new task and a registry line; remove the line. No migration, no change in brain.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Readers tested on synthetic fixtures made like the real pages, one per section plus a sparse profile and a non-English one; a test that no name or word of the profile reaches the log, a warning or the report.
- A real-browser test against a stand-in profile page.
- A local run with `dev:record` on a real account: read `profile.json` against the live page and the log. Not possible from here; it needs your account and proxy.

## Capture findings (first run, 2026-10-24)

- The page is LinkedIn's server-driven app: class names are generated and short-lived (`l4j…`), so selectors are `data-view-name`, `data-testid`, `componentkey` prefixes, `aria-label` and `href` patterns. The page was in English.
- Seen on the profile page: the top card (`profile-top-card`: cover `img[alt]`, `profile-top-card-member-photo`, name in an `h2`, `profile-top-card-verified-badge`, pronouns and headline as text, a link to `/overlay/contact-info/` after the location, `profile-top-card-view-all-connections` with "N connections"; no follower count there), `profile-card-about` (`expandable-text-box`), `profile-card-insights` (links `insights-wvmp`, `insights-content-impressions`, `insights-search-appearances`; each shown twice in the markup, once per layout), `profile-card-recent-activity` (the followers link `/feed/followers/`), `profile-card-experience` (items `entity-collection-item-*`), `profile-card-pymk-recommendation-*` and `profile-card-company-recommendation`. Education, skills and the rest were not drawn on the profile page: they are read from their detail pages.
- Seen on detail pages (`section[aria-label="Primary content"]`): experience (same items as the profile page), education (`profile_EducationDetailsSection_*`, lines school, degree, dates), skills (groups with the experience each belongs to), interests (chips are `input[type=checkbox] + label`, items in `data-testid="lazy-column"`), recent activity posts and comments (header with followers, tabs, feed posts). Every detail page also carries ad and "who your viewers also viewed" blocks to leave out.
- `/in/me/` stayed `/in/me/` and `/in/me/details/...` opened fine, so the base address needs no redirect.
- Not seen populated (the account has none): recommendations, projects, languages, services, open to work, top voices, newsletters, schools, posts with pictures.

## Capture findings (third run, 2026-10-24, a fuller account)

- Projects (`/details/projects/`): each is a block that starts with a link to its edit form (`/details/projects/edit/forms/<id>/`) holding the name and the dates in two paragraphs; the text is a paragraph after it, the skills a link to `skill-associations-details` ("A, B and +7 skills"), and the company is a logo in a figure with its line ("Associated with X") in the block next to it. The same link again at the end of the block is empty; Add leads to `.../edit/forms/project/new/`. The company line is kept as the page writes it, so the contract field `associatedWith` is now the whole line (the page shows it as it is).
- Languages: a row with two paragraphs (name, level) and, next to them, a link `/details/languages/edit/forms/<id>/` (Add ends in `/new/`).
- Recommendations (`/details/recommendations/`, given: `?detailScreenTabIndex=1`): each card is a link `a[href*="/in/"]` holding a figure, then the lines name, `· 1st`, headline and the relationship line ("August 27, 2024, X was senior to Y ..."), with the text in an expandable box in the same block. Received cards have an edit link and a privacy switch; given ones a revise-or-delete button. No pending count was seen.
- Profile page: services (`profile-card-services`, one paragraph each, `Show all` has none) and the open-to-work box (a `li` of the carousel that holds `button[data-view-name="profile-edit-open-to"]`: a bold line "Open to work · Recruiters only", then the titles as one line "A, B and C roles", kept split on ", " so a join puts the line back).
- Posts (`ProfileRecentActivity...`, no `data-view-name` on this page): a repost has a first line "X reposted this" with the reposter's name in bold inside a link; the original author's row follows (a company has neither degree nor headline). Own posts have a line "501 impressions" before the link `/analytics/post-summary/`. The row of buttons: reaction button (nested), reactions menu, Comment, Repost; a count is the digits in its text, a zero-width space when there is none. A picture sits in `a > figure > img` in the block after the text.
- Interests: five chips are `div[role=radio]` blocks (checkbox plus label) above the list; Top Voices items are members (`· 2nd`, headline, followers). Mentions, hashtags and company names in a text are links between empty elements, with no space in the markup.
- Still not seen: the Companies, Groups, Newsletters and Schools chips (the click found nothing in view, fixed), top skills, endorsement counts, pending recommendations.

## Outcome

Filled in when done.
