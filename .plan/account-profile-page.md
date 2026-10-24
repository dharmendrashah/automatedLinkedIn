# Account profile page: a LinkedIn-style profile for each account, UI first

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-24
- Locked by user: yes, 2026-10-24 (every default below confirmed: sample data with a banner on every environment, schema in `contracts` now, "references" are the Recommendations, People you may know and You might like included, header actions Test login, Visit now and a disabled Read profile, main column plus right rail, entry points the email link and the row menu)

## Goal

Each account on `/accounts` gets a page at `/accounts/:id` that looks like the account's own LinkedIn profile: cover image, photo, name, headline, location, followers and connections, then about, activity, experience, education, projects, skills, recommendations (received and given), languages, interests and the suggestions (people you may know, you might like). This plan is for the UI only, on sample data. Reading the profile from LinkedIn (a spider task) and the backend that stores and serves it come later, with their own plan.

## What exists today (checked in code, 2026-10-24)

- `/accounts` is a table (`pages/Accounts.tsx`, `components/accounts/accounts-table.tsx`) with the email as plain text; nothing links to an account. `linkedInAccount.get` (owner only) already returns one account by id; `linkedInAccount.list` returns email, status, last verified, daily visit and the rest. The Unibox already keeps each account's `displayName` and `imageUrl`, read from the page's top bar.
- Routes are in `App.tsx`; the tab title and the heading of a page come from one table, `lib/page-title.ts`. The sidebar entry "LinkedIn accounts" is already active for `/accounts/...` (`nav-main.tsx` matches a prefix).
- Pages are full width: `grid w-full gap-4 px-4 lg:px-6`, no `max-w-*`, no `mx-auto` (MEMORY, 2026-10-14).
- The main chunk is 489 kB, near the 500 kB build limit (MEMORY, 2026-10-24): a heavier page is loaded on demand like `Unibox`.
- UI kit in `components/ui`: `avatar`, `badge`, `button`, `card`, `tabs`, `accordion`, `skeleton`, `separator`, `tooltip`, `hover-card`, `scroll-area`. Nothing new needs adding. `components/unibox/account-avatar.tsx` holds a picture-over-initials component with the rules for LinkedIn images (https only, no referrer, initials stay when the picture fails).
- The Unibox was built the same way this page will be: UI first on sample data behind a source, then the real source (`components/unibox/sample/`, `chooseSource.ts`).
- Body has unit tests for pure logic only (no component test library); components are checked in a browser.
- The brain already has `LinkedInProfile` (target profiles to contact), which is another thing: this page is about the account's own profile.

## What the page shows (from the profile as the owner sees it, 2026-10-24)

Main column, top to bottom (each section is hidden when the profile has nothing for it):

1. Header card: cover image, round photo overlapping it, name with a verified mark, pronouns, headline, location, "Contact info" label, followers and connections ("905 followers", "500+ connections"; LinkedIn caps connections at 500+, so it is text).
2. Account strip inside the header: the account's email, its status badge (reuse `status-badge.tsx`), last verified, when the profile was last read ("Read 3 hours ago", full date on hover), and the actions the app has for an account: Test login, Visit now, and "Read profile" (shown disabled, "Not available yet", until the task exists).
3. Open to work: "Open to work · Recruiters only" with the job titles and "Show details".
4. About: text clamped to three lines with "more", then "Top skills".
5. Services: chips.
6. Activity: followers count, tabs Posts and Comments, a horizontally scrolling row of cards (a post or a repost: author, date, text clamped, optional picture, reactions, comments, reposts, impressions).
7. Experience: logo, title, company and type, dates and duration, location and work mode, description, skills line.
8. Education: logo, school, degree and field, years.
9. Projects (n), Skills (n), Recommendations (tabs Received (n) and Given (n), each with name, degree, headline, relationship line and text clamped, and a "pending" count), Languages (n) with proficiency, Interests with tabs Top voices, Companies, Groups, Newsletters, Schools.
10. Each list shows its first items and a "Show all" that opens the rest in place (LinkedIn goes to another page; here the data is already on this one). Counts in headings are LinkedIn's totals, which can be larger than what was captured.

Right rail on wide screens (stacks below the main column on narrow ones):

- Analytics (private to the account): profile views, post impressions, search appearances, with the period.
- Public profile address (the `linkedin.com/in/...` link) and profile language, as on LinkedIn.
- People you may know and You might like (suggested people and pages), each a small card list.

What is left out on purpose: LinkedIn's own edit actions (the pencil icons, Add section, Enhance profile, Resources, Create a post, Draft a post, the "Suggested for you" tips). They change a profile; this page only shows one.

## Design

- Route `/accounts/:id`, lazy-loaded in `App.tsx` (`Suspense fallback={null}`), page `pages/AccountProfile.tsx`; `lib/page-title.ts` gets one line: `/accounts/:id` is "Account profile" (a person's name does not belong in a browser history, as for a conversation). Page root `grid w-full gap-4 px-4 lg:px-6`; inside, `lg:grid-cols-[minmax(0,1fr)_22rem]` (main column and right rail), one column below `lg`.
- Entry points: the email in the accounts table becomes a link to the page, and the row menu gets "View profile". The page has a "LinkedIn accounts" back link at the top.
- Data: the shape of a profile is a zod schema in `packages/contracts/src/profile.ts` (neutral names, no supplier name), because the future spider task will write exactly this and brain will validate it. The UI reads it through one function `loadProfile(accountId)` in `components/account-profile/source.ts`; today it returns the sample, later it calls tRPC. Nothing else in the UI knows where the data comes from.
- Shape (one strict object; every list also has an optional `total`): `capturedAt`, `profileUrl`, `name`, `verified`, `pronouns?`, `headline?`, `location?`, `imageUrl?`, `coverUrl?`, `followers?`, `connections?` (text), `openToWork? { titles[], audience }`, `about?`, `topSkills[]`, `services[]`, `analytics? { profileViews, postImpressions, searchAppearances, period }`, `activity? { followers?, posts[], comments[] }`, `experience[]`, `education[]`, `projects[]`, `skills[]`, `recommendations { received[], given[], pending? }`, `languages[]`, `interests { topVoices[], companies[], groups[], newsletters[], schools[] }`, `peopleYouMayKnow[]`, `youMightLike[]`. Dates and durations are kept as the text LinkedIn shows ("Mar 2025 - Present · 1 yr 8 mos"), as for messages (`when`): the page does not compute them.
- Sample data: three fixtures in `components/account-profile/sample/`: `full` (every section), `sparse` (a new account: name and headline only, no cover, no photo) and `empty` (not read yet). All invented: no real person's name, photo or text from the owner's screenshots is committed. Images in the sample are plain generated shapes (data or gradient), not LinkedIn addresses.
- Components, one job each, in `components/account-profile/`: `profile-header`, `open-to-work`, `about-card`, `activity-card`, `experience-card`, `education-card`, `projects-card`, `skills-card`, `recommendations-card`, `languages-card`, `interests-card`, `analytics-card`, `suggestions-card`, plus a small `Section` shell (title, count, children, "Show all") that the cards share. Pure helpers in `lists.ts` (first N and the rest, "n of total"), `counts.ts` (compact numbers), `safe-link.ts` (a profile or company address is only linked when it is `https` on `linkedin.com`), each with unit tests written first.
- Shared picture: the picture-over-initials logic is extracted from `unibox/account-avatar.tsx` into one `components/photo.tsx` that both use (no second copy); the cover has a neutral gradient when it is missing or fails.
- States: loading (skeleton shaped like the header and two cards), account not found (the existing `FailureCard`, "Account not found"), profile not read yet (header with the account strip and an empty message, no sections), sparse (only the sections that have data).
- Accessibility: one `h1` (the name), `h2` per section, tabs by the Radix `Tabs` (keyboard), every picture with an `alt` (name) or `alt=""` when decorative, text contrast from the existing theme tokens, light and dark.

## Scope and non-goals

- In scope: the route, page, components, contract schema, sample fixtures, the link from the accounts table, tests of the pure parts, `MEMORY.md`.
- Out of scope (later plan): the spider task that reads the profile, the brain storage and tRPC procedures, keeping pictures in the bucket, the "Read profile" action, scheduling, retention and erasure of what is stored about other people, anything that edits a LinkedIn profile.

## Approach

- [x] 1. Contract: `packages/contracts/src/profile.ts` (schema and types), exported; test that the three sample fixtures parse and that a profile with an unknown key or an `http` image address is refused.
- [x] 2. Sample fixtures (`full`, `sparse`, `empty`) and `source.ts`.
- [x] 3. Pure helpers (`lists`, `counts`, `safe-link`) with tests first.
- [x] 4. Extract `components/photo.tsx` from `unibox/account-avatar.tsx`; Unibox tests still pass.
- [x] 5. Section components and the shared `Section` shell.
- [x] 6. Page `AccountProfile.tsx`, lazy route, title line, link and menu item on the accounts table.
- [x] 7. States (loading, not found, not read, sparse).
- [x] 8. Check in a browser: light and dark, wide and narrow, the three fixtures, keyboard on the tabs; `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` (the main chunk must not grow past the limit); `MEMORY.md`; plan done.

## Edge cases and risks

- **Sparse or new accounts:** no cover, no photo, no headline, no location, zero followers; every section is optional, the header never leaves a hole (initials on a hue from the name, gradient cover).
- **Very long text:** an about of thousands of characters, a description with line breaks, words with no spaces, emoji, right-to-left scripts; clamp with "more", `break-words`, `dir="auto"` on user text. Text is always rendered as text, never as HTML.
- **Many items:** 56 skills, 40 jobs, 200 recommendations: first items only, "Show all" opens the rest in place; the rest is not rendered until opened.
- **Counts that disagree with the list:** a heading says "Skills (56)" with 2 captured. The heading uses `total` when present, else the list length.
- **Pictures:** LinkedIn picture addresses expire and need no referrer; https only, `referrerPolicy="no-referrer"`, initials or gradient on failure (same rules as the Unibox). A later plan decides keeping copies in the bucket.
- **Links:** only `https` addresses on `linkedin.com` are linked, with `rel="noopener noreferrer"` and a new tab; anything else is shown as text. No address is built from user text.
- **Other people's data:** recommendations, interests and suggestions name other people (names, headlines, text, photos). The sample is invented. For the later backend: that is third-party personal data about people who did not ask to be here, so it needs the same care as the Unibox (kept only for the owner of the account, deleted with the account, never logged), and "People you may know" and "You might like" are LinkedIn's suggestions to this account rather than data about the account: decide in the backend plan whether to read and keep them at all.
- **Sample data in production:** a page showing someone else's invented profile can be taken for real. It carries a visible "Preview with sample data" banner (see the first open question), and the real source replaces it without touching the components.
- **Bundle:** the page is lazy-loaded; the build must keep the main chunk under 500 kB. Nothing heavy is added (no new dependency).
- **Names in the tab title:** none (generic "Account profile").
- **Route safety:** an id that is not the owner's, or not an id at all, gets the same "Account not found" (the server already scopes `linkedInAccount.get` to the owner).
- **Rollback:** the page is new and read-only; remove the route and the link.

## Open questions (answered 2026-10-24: yes to every default)

1. Sample data on every environment with a "Preview with sample data" banner. Yes.
2. Schema in `packages/contracts` now. Yes.
3. "References" are the Recommendations section. Yes.
4. People you may know and You might like as two cards in the right rail. Yes.
5. Header actions: Test login, Visit now and a disabled Read profile. Yes.
6. Main column plus right rail on wide screens. Yes.
7. Entry points: the email link and the row menu item. Yes.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- A browser check of the three fixtures, light and dark, wide and narrow, keyboard on the tabs and "Show all"; state what could not be run (the page behind sign-in on staging).

## Outcome

Shipped as planned: `/accounts/:id` (lazy, "Account profile" in the tab), reached from the email in the accounts table and "View profile" in the row menu. It shows the invented sample profile (full, new account, not read yet; chosen by `?sample=` and the buttons of the banner) with every section of the plan, and the account strip (status, last verified, profile read time, Test login, Visit now and a disabled Read profile). The profile shape is `accountProfileSchema` in `packages/contracts/src/profile.ts`; the page reads it only through `loadProfile` in `components/account-profile/source.ts`, which is the one place that changes when the real source exists.

Deviations:

- The contract uses `captured_at` (snake case), as `messages.json` does.
- "Contact info" is not shown (it opens a LinkedIn overlay we have no data for); the header has a "View on LinkedIn" link from `profileUrl`. The separate "public profile address" card of the right rail is dropped for the same reason.
- The right rail is used only when the profile has analytics or suggestions; a new account's main column takes the whole width.
- A list that kept fewer items than LinkedIn's total says "Showing 3 of 56. The rest is on LinkedIn."
- The sample has no pictures (the contract allows only https addresses and none is invented): initials and a plain cover show instead.
- `apps/body` now has a dev dependency on `@automatedLinkedIn/contracts`, for types and for the tests that check the sample against the schema. It must be imported with `import type { ... }`: the inline `import { type X }` form leaves a side-effect import that loads the CommonJS package in the browser and breaks the page (found in the browser check and fixed).
- The page shows an `Account not found` card when the owner has no such account.

Verified: lint, `ts:check`, unit tests (body 550, contracts 167, brain 1139, spider 872), build (the page is its own 27 kB chunk; the main chunk is 308 kB). A temporary preview page (deleted) was opened in a browser: wide and narrow, light and dark, the full and the new-account samples; it found two layout bugs (a scrolling row widening the page, a screen-reader-only span extending the document) that are fixed. Not run: the page behind sign-in on staging, and keyboard use of the tabs.

Follow-ups (the later plan): the spider task that reads the profile, brain storage and tRPC, keeping pictures in the bucket, the Read profile action, and the privacy decisions for the third parties named in recommendations, interests and suggestions.
