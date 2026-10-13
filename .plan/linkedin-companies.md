# LinkedIn target companies (CRUD and list)

- Status: done
- Created: 2026-10-14
- Locked by user: yes, 2026-10-14 (paste links only; status same as profiles; no link to profiles yet)

## Goal

Let a signed-in user keep a list of target companies by pasting their LinkedIn company links, then list, search, edit, tag, set a status on, and archive them. Same behaviour as the target profiles (`.plan/linkedin-profiles.md`, shipped in PR 35). Storage only: nothing is scraped or sent.

## Requirements

Confirmed (from the owner's request and the profiles decisions that carry over):

- A company is a target company, pasted as `linkedin.com/company/<name>` links. Everything else is filled in by hand.
- Owner-scoped (`ownerProcedure`), unique per owner on the slug, soft delete (archive and restore), search and paging (25 per page, newest first), at most 200 links per paste, tags (max 10, 30 characters, lowercase).
- Brain (model, migration, service, tRPC, tests) and body (`/companies` page, full width).

Proposed, not yet confirmed (see open questions):

- Fields: link, name, industry, website, size (free text such as "51-200"), location, notes, tags, status.
- Status: `NEW`, `CONTACTED`, `REPLIED` (own enum `LinkedInCompanyStatus`, same values as profiles).
- No link between a profile and a company yet; a profile's company stays free text.
- Reuse over copy: one link parser for both kinds, the shared zod pieces and the shared UI pieces (see Approach). Per-entity code stays separate where the shape differs.

Open questions (must be empty before locking):

- Are the proposed fields right (name, industry, website, size, location, notes, tags, status)?
- Same three statuses as profiles, or a different pipeline for companies?
- Should a profile be able to point at a company now (an optional `companyId` on `LinkedInProfile`), or leave that for later? Proposed: later.

## Scope and non-goals

- In scope: `LinkedInCompany` model and enum with one additive migration; `LinkedInCompanyService`; tRPC router `linkedInCompany` (`create`, `list`, `get`, `update`, `archive`, `restore`); `/companies` page, sidebar entry and header title; unit tests and one integration test; the small refactor that shares code with profiles.
- Out of scope: scraping or enriching company data, linking profiles to companies, other link kinds (school, showcase, jobs), CSV import, hard delete, a background job.

## Approach

- [ ] Generalise the link parser: `core/profileUrl.ts` becomes `core/linkedInUrl.ts` with `parseLinkedInUrl(raw, kind)` and `parseLinkedInUrls(text, kind)` where `kind` is `'profile'` (`/in/`) or `'company'` (`/company/`). Tests first; the existing profile cases keep passing unchanged, and new cases cover company links (reject `/in/`, `/school/`, `/company/` without a name, and sub-pages like `/company/x/jobs`, which reduce to the company).
- [ ] Share the zod pieces both routers use (`byId`, `text`, `tag`, `tags`, `found`, the create-error mapping) from one small module in `trpc/api/resolvers`, and point the profile router at it.
- [ ] Schema: model `LinkedInCompany` (`id` uuid7, `userId` cascade, `slug`, `url`, `name?`, `industry?`, `website?`, `size?`, `location?`, `notes?`, `tags String[]`, `status` enum default `NEW`, `archivedAt?`, timestamps), `@@unique([userId, slug])`, `@@index([userId, archivedAt, createdAt])`. Additive migration `add_linkedin_company`.
- [ ] `LinkedInCompanyService` (static class, tests first): `addMany`, `list`, `getForUser`, `updateForUser`, `archiveForUser`, `restoreForUser`, same semantics as the profile service. Search fields: name, industry, slug, website.
- [ ] tRPC resolver `linkedInCompany`, registered in `trpc/api/router.ts` and `resolvers/index.ts`; export from `database/index.ts`. `website` is validated as an `http` or `https` URL (max 300 characters), stored as typed after trimming.
- [ ] Body: `/companies` page. Share what is identical (status badge, tags cell, pager, the paste-links dialog taking its wording and mutation as props); keep the table and the edit dialog per entity. Add the route, sidebar entry and `site-header` title.
- [ ] Verify end to end, update `MEMORY.md`, set the plan to `done`.

## Edge cases and risks

- Empty paste, whitespace only, over 200 links, or one bad link among good ones: valid ones are saved, bad ones are reported back; a mix never throws.
- A person link pasted into the companies box (and the reverse) is reported as not valid for that list, never saved in the wrong table.
- Same company pasted twice, or with different casing, trailing slash, query or sub-page: de-duplicated by slug before the write. An archived one is restored with its notes and tags.
- Concurrency: unique `(userId, slug)` plus `createMany` with `skipDuplicates`, no read-then-write.
- Another user's id on any call answers `NOT_FOUND`, the same as a missing one.
- Website: a value that is not a valid http or https URL is rejected with a plain message; `javascript:` and similar schemes can never be stored. The table renders it as a link with `rel="noreferrer noopener"` and `target="_blank"`, only when it starts with `http`.
- Refactor risk: renaming the parser touches code that shipped in PR 35. The profile tests are the safety net and must stay green with no edits to their expectations.
- Existing data: one new table and one enum, nothing else changes. Rollback is a follow-up migration that drops the table; the feature has no other state.
- Secrets: none involved. Notes are user text, shown as text only.
- Compliance: stores links the user pasted for their own outreach list; no collection of data about other people or companies. Any later enrichment follows the project rules on LinkedIn limits and privacy law.
- Dev vs production: no new env vars, no Docker, CI or deploy changes. The migration runs through the existing init container.

## Verification

- `pnpm --filter @automatedLinkedIn/brain db:migrate:dev --name add_linkedin_company` against local Postgres, then `db:generate`.
- Whole monorepo: `pnpm lint`, `pnpm ts:check`, `pnpm test:unit:run`, `pnpm build`, all clean of errors and warnings.
- `NODE_ENV=test DATABASE_URL=... ` integration test for the company service.
- Real path: a throwaway script drives the router against local Postgres (paste a mix, list, search, update, archive, restore, paste again) and the running brain answers `linkedInCompany.list` with 401 without a token. State what could not be run (the page behind sign-in).

## Outcome

Shipped as planned: `LinkedInCompany` model and enum (additive migration `add_linkedin_company`), `LinkedInCompanyService`, tRPC `linkedInCompany` (`create`, `list`, `get`, `update`, `archive`, `restore`), and the `/companies` page with the sidebar entry and header title. The owner confirmed: paste links only, statuses same as profiles, no link to profiles yet. Fields stay as proposed (name, industry, website, size, location, notes, tags, status) and are filled in by hand after pasting.

Shared instead of copied:

- Brain: `core/linkedInUrl.ts` replaces `profileUrl.ts` (`parseLinkedInUrl(s)` with a `kind`); `database/linkedInRecord.ts` (list filter, paging, owner-scoped write, add-many rules); `trpc/api/resolvers/linkedInRecord.ts` (zod pieces, NOT_FOUND, link reading). The profile service and router now use them, with their tests passing unchanged.
- Body: `components/links/` (list state, toolbar, pager, tag badges, row actions, state rows, paste dialog, edit frame, record fields, status badge and form rules). Edit forms send `undefined` for fields left alone, so no object-building casts were needed.

Deviations:

- A link name may now be 2 characters long (was 3 for profiles), so short company names such as `3m` are accepted.
- Tests for the company service are a short set that covers what is specific to it; the shared rules are covered once, through the profile service tests.

Verified: `pnpm lint`, `pnpm ts:check`, `pnpm test:unit:run` and `pnpm build` for the whole monorepo, all clean with no warnings. Both list integration tests pass against local Postgres. A throwaway script drove the real router against local Postgres (paste a mix, list, search, update, reject a `javascript:` website, archive, restore, paste again), and the running brain answers `linkedInCompany.list` with 401 without a token. Not run: the page in a browser behind sign-in, and e2e tests.

Follow-ups: link a profile to a company (`companyId`), erase on request (hard delete), filling details from spider.
