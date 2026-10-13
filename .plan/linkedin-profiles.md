# LinkedIn target profiles (CRUD and list)

- Status: done
- Created: 2026-10-14
- Locked by user: yes, 2026-10-14 (all proposed defaults accepted)

## Goal

Let a signed-in user keep a list of target people by pasting their LinkedIn profile URLs, then list, search, edit, tag, set a status on, and remove them. Storage only: nothing is scraped or sent by this task.

## Requirements

Confirmed (from the owner's answers):

- A profile is a target person, not one of the user's own accounts (those stay `LinkedInAccount`, `/accounts`).
- The user pastes URLs; every other field is optional and edited afterwards.
- Fields: URL, full name, headline, company, location, notes, tags, status (`NEW`, `CONTACTED`, `REPLIED`).
- List has text search and paging, newest first.
- Delete is soft (archived, restorable).
- Brain (model, migration, service, tRPC, tests) and body (`/profiles` page, full width).

Proposed, not yet confirmed (see open questions):

- The paste box takes one or many URLs (one per line, or separated by spaces or commas) and saves them in one call.
- URLs are normalised to `https://www.linkedin.com/in/<slug>`; query strings, trailing slashes, locale prefixes and case are dropped. Only `/in/` person URLs are accepted (no company, school, post or sales navigator URLs).
- Unique per owner on the normalised slug. Pasting a URL that already exists is skipped; one that is archived is restored.
- Owner-scoped like `linkedInAccount`: every call filters on `ctx.user.id`, through `ownerProcedure`.

Open questions (must be empty before locking):

- Is `ownerProcedure` right (same as accounts), or should any signed-in user get this? Proposed: same as accounts.
- Paging: page size 25 with Prev/Next and a total, or infinite scroll? Proposed: page size 25, Prev/Next, total shown.
- Status for an archived row: keep the status and show "Archived" through a separate `archivedAt`? Proposed: yes, status unchanged, `archivedAt` set.
- Tags: free text, lowercased, max 10 per profile, max 30 characters each? Proposed: yes.
- Bulk limit per paste: 200 URLs? Proposed: yes.

## Scope and non-goals

- In scope: Prisma model `LinkedInProfile` and one additive migration; `LinkedInProfileService` in `src/database`; tRPC router `linkedInProfile` (`create`, `list`, `get`, `update`, `archive`, `restore`); `/profiles` page, sidebar entry and header title; unit tests (URL normalisation, service, resolver) and an integration test for the service.
- Out of scope: fetching or scraping profile data (spider fills name, headline and so on later), sending messages or connection requests, import from CSV, hard delete, sharing profiles between users, per-account assignment, a background job.

## Approach

- [x] Pure helper `normalizeProfileUrl` in `src/core` with unit tests first: accepts `linkedin.com/in/x`, `www`, `http`, locale host (`in.linkedin.com`), trailing slash, query, `%`-encoded slugs; rejects non-`/in/` paths and other hosts.
- [x] Schema: model `LinkedInProfile` (`id` uuid7, `userId` cascade, `slug`, `url`, `fullName?`, `headline?`, `company?`, `location?`, `notes?`, `tags String[]`, `status` enum default `NEW`, `archivedAt?`, timestamps), `@@unique([userId, slug])`, `@@index([userId, archivedAt, createdAt])`. Additive migration `add_linkedin_profile`.
- [x] `LinkedInProfileService` (static class, tests first): `addMany(userId, urls)` returns `{ created, restored, skipped, invalid }`; `list(userId, { search, status, tag, includeArchived, page, pageSize })` returns `{ items, total }`; `get`; `update` (partial, URL is not editable); `archive`; `restore`. Every query has `userId` in the where clause.
- [x] tRPC resolver `linkedInProfile` with zod input (lengths bounded, `.strict()`), a `NOT_FOUND` error for foreign or missing ids, registered in `trpc/api/router.ts`; add the `database` export in `src/database/index.ts`.
- [x] Body: `/profiles` page (full width: `grid w-full gap-4 px-4 lg:px-6`), table with search box, status filter, "Show archived" toggle, paging; an Add dialog (textarea for URLs, result summary); an Edit dialog (fields, tags, status); archive and restore actions. Add the route, the sidebar entry and the `site-header` title. Reuse the `accounts` components for the table, dialogs and badges where they fit, instead of copying them.
- [x] Verify end to end (see Verification), update `MEMORY.md`, set the plan to `done`.

## Edge cases and risks

- Empty paste, only whitespace, over 200 URLs, or one bad URL among good ones: valid ones are saved, bad ones are reported back by value; nothing throws for a mix.
- Same URL twice in one paste, or with different casing or a trailing slash: de-duplicated by slug before the write.
- Concurrency: two pastes of the same URL at once. The unique `(userId, slug)` index plus `createMany` with `skipDuplicates` keeps it safe; no read-then-write.
- Archived row re-pasted: restored, its old notes and tags are kept.
- Another user's profile id on any call returns `NOT_FOUND` (the same answer as a missing one), never a leak.
- Search input is passed to Prisma `contains` with `mode: insensitive` (parameterised, no raw SQL). Max search length 100.
- Page past the end returns an empty page with the real total; `pageSize` is capped at 100.
- Existing data: one new table and one enum, no change to other tables. Rollback is to drop the table in a follow-up migration; the feature has no other state.
- Secrets: none involved. Notes are user text, shown as text only (no HTML rendering).
- Compliance: this stores URLs the user pasted for their own outreach list. It does no collection of other people's data. Anything that fills the fields automatically later must follow the project rules on LinkedIn limits and privacy law, and a person added here can be removed (archive now; erase on request is a follow-up, see below).
- Dev vs production: no new env vars, no Docker, CI or deploy changes. The migration runs through the existing init container.
- Body types: the page imports `AppRouter` types, so no new bare alias is needed.

## Verification

- `pnpm --filter @automatedLinkedIn/brain db:migrate:dev --name add_linkedin_profile` against local Postgres, then `pnpm --filter @automatedLinkedIn/brain db:generate`.
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` for the whole monorepo, clean of warnings.
- `pnpm test:integration:run` for the service (needs Postgres).
- Real path: run brain and body, sign in, paste a mix of good, duplicate and bad URLs, search, filter, edit, tag, archive, restore; confirm another user cannot read the rows. State what could not be run.

## Outcome

Shipped as planned: `LinkedInProfile` model and additive migration `add_linkedin_profile`; `core/profileUrl.ts` (the helper is named `parseProfileUrl` and `parseProfileUrls`); `LinkedInProfileService`; tRPC `linkedInProfile` (`create`, `list`, `get`, `update`, `archive`, `restore`); the `/profiles` page with search, status filter, tag filter (click a tag), Show archived, 25 per page, an Add dialog with a result summary and an Edit dialog. Tests: URL helper, service and resolver unit tests, a service integration test (passed against local Postgres), and a body test for the edit form's change detection.

Deviations and extras:

- The tag filter is also in the UI (click a tag), small and free with the API.
- The owner asked that every lint and build warning is fixed after each task, so this change also cleared old ones: `object-curly-newline` in brain and spider tests, `use-mobile` and the dashboard chart (no state set in an effect), the sidebar skeleton width, the unused `schema` export, `react/only-export-components` off for `src/components/ui/**` in `.oxlintrc.json`, and the body build's chunk-size warning (Dashboard is lazy-loaded; vendor chunks in `vite.config.ts`).

Verified: `pnpm lint`, `pnpm ts:check`, `pnpm test:unit:run` and `pnpm build` for the whole monorepo, all clean. A throwaway script drove the real router against local Postgres (paste, list, search, update, archive, restore, paste again), and the running brain answers `linkedInProfile.list` with `401` without a token. Not run: the page in a browser behind sign-in (needs a real login), and e2e tests.

Follow-ups: erase on request (hard delete), filling the details from spider, assigning a profile to one of the user's accounts.
