# linkedin-profile: read the profile page that has no `data-view-name`

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-28
- Locked by user: yes, 2026-10-28 ("on staging why this task failed, please update this task")

## Goal

A `linkedin-profile` run on staging ended `ERROR` ("The profile of the account could not be opened") although the account's own profile was open. Cause, read from the kept `failure.html` (run `5613e927`, account Tripti Verma, 2026-10-27): LinkedIn served this account the profile layout with no `data-view-name` anywhere (the same family as the post composer of 2026-10-27), so `parseTopCard` found no `profile-top-card` and the task answered `NOT_OPENED` ("The page did not hold a profile"). The task must read this layout as well as the one of 2026-10-24.

## Requirements

Confirmed:

- The readers of the main profile page (top card, about, analytics, people you may know, pages you might like) work on both layouts; the layout of 2026-10-24 keeps working unchanged.
- No guessed selectors: only markers seen in the real page of 2026-10-27, written in the code with that date.

Open questions: none.

## Scope and non-goals

- In scope: `parseTopCard`, `parseAbout`, `parseAnalytics`, `parseSuggestions` in `apps/spider/src/linkedin/profileReader.ts`, a plain-layout fixture and tests.
- Out of scope (unverified on this layout, no page seen): top skills, services, open to work, and the ten detail pages (`/details/...`, activity). They use `componentkey` prefixes, `data-testid`, hrefs and paragraph order, which are present in the page, but the pages themselves were not kept. The next run keeps them if they fail (`snapshots: true`).

## Approach

- [x] 1. Download and read the kept page (`failure.html`).
- [x] 2. Fixture of the plain layout (`profileFixture.ts`, structure only) and failing tests first.
- [x] 3. Readers: look for the marker of the first layout, else for the plain one (the card is the nearest block around the profile photo link `a[componentkey=topcard-logo-image-referencekey]` that holds the name `h2` and the contact link; the about card is the block around the About edit link `a[href*="/edit/forms/summary/"]`; analytics by `a[href*="/analytics/..."]`; people you may know by the member link with a picture and a degree such as "· 3rd"; pages you might like by the company link with a picture, what it is and a count of followers).
- [x] 4. Run the readers over the real page (outside the repo) and compare with what it shows.
- [x] 5. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- [ ] 6. Spider task checklist (`.github/skills/spider-task-writer/assets/checklist.md`): sections 1 to 3 apply to the page evidence; the lifecycle items are n/a: the runner and the lifecycle are not changed. A live rerun on staging is left to the owner (the first one after deploy).

## Edge cases and risks

- Both layouts in one page, or a layout that has some markers: the first layout's marker wins when present, so nothing read before changes.
- A page that is not a profile (no photo link, no contact link): still `undefined`, the task still answers `NOT_OPENED`.
- Own-profile links with a picture on the page (the photo, the mutual-connections line) must not be taken for people you may know: a degree such as "· 3rd" is required.
- Interests companies on the main page (name and followers only) must not be taken for pages you might like: three lines are required, the third starting with a digit.
- Verified mark on the plain layout: unverified (the account seen is not verified); read as a `role="img"` inside the name block, as in the first layout.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- The readers run over the real kept page.

## Outcome

Shipped: `parseTopCard`, `parseAbout`, `parseAnalytics` and `parseSuggestions` read the layout with no `data-view-name` as well; the first layout is read first, as before. Run over the real kept page (account Tripti Verma, 2026-10-27) they give the name, pronouns, headline, place, both pictures, 112 connections, the About text, the three analytics numbers with "Past 7 days", 170 followers, both jobs, five people you may know and two pages you might like. Lint, `ts:check`, unit tests and build pass. Not run live on staging: the next run after deploy is the proof.

Deviations: none. Follow-ups: top skills, services and open to work are unverified on this layout (this account has none). The detail pages were checked offline on the kept pages of capture run `066fa57d` (2026-10-27, same account): the readers gave the contact info, 10 posts, 7 comments, 2 jobs, 1 school, 4 skills, the Interests chip that was kept and a profile that fits the contract (projects, languages and recommendations were empty on the page). The verdict sentence "The profile of the account could not be opened" is also what a page that is open but not read answers; a separate sentence would tell the two apart (not done, not asked).
