# LinkedIn target posts (CRUD and list)

- Status: done
- Created: 2026-10-17
- Locked by user: yes, 2026-10-17 (link only, nothing typed; statuses processed and unprocessed; both link forms)

## Goal

Let a signed-in user keep a list of LinkedIn posts by pasting post links, then list, search, mark as processed or unprocessed, and archive them. Same behaviour as target profiles (`.plan/linkedin-profiles.md`) and target companies (`.plan/linkedin-companies.md`), except that the link is the only data: the user types nothing else. Storage only: nothing is scraped or sent.

## Requirements

Confirmed (owner, 2026-10-17):

- The new entity is posts. Full stack: model and migration, service, tRPC router, `/posts` page, sidebar entry, tests.
- Works like companies: paste links, owner-scoped, soft delete (archive and restore), search, paging (25 per page, newest first), at most 200 links per paste.
- The link is all that is saved. The user types no name, excerpt, notes or tags (so no tags, no edit dialog).
- Status: `UNPROCESSED` (default) and `PROCESSED`, in its own enum `LinkedInPostStatus`. The user flips it with a button on the row.
- Both link forms are accepted: `linkedin.com/posts/<author>_<text>-activity-<id>-<code>` and `linkedin.com/feed/update/urn:li:activity:<id>`, with the `activity`, `share` and `ugcPost` types, and the URL-encoded urn. Anything else on linkedin.com is reported as not a post link.
- Identity of a post: its numeric id plus type, stored as `slug` (`activity-<id>`, `share-<id>`, `ugcpost-<id>`). The stored `url` is always `https://www.linkedin.com/feed/update/urn:li:<type>:<id>`.
- Added 2026-10-17 (owner): a short link `https://lnkd.in/p/<code>` is a valid post link too. It is kept as it is (slug `lnkd-<code>`, case kept, url `https://lnkd.in/p/<code>`); the redirect is not followed (no server-side fetch of pasted links), so it is not matched with the same post pasted in the long form.
- No link from a post to a profile or company.

## Scope and non-goals

- In scope: `LinkedInPost` model and enum with one additive migration; `LinkedInPostService`; tRPC router `linkedInPost` (`create`, `list`, `get`, `update` (status only), `archive`, `restore`); `/posts` page, sidebar entry, header title; the `post` kind in the shared link parser; making the shared list code work with another status set; unit tests and one integration test.
- Out of scope: scraping or enriching post data (including Mindcase), commenting or reacting through the tool, linking posts to profiles or companies, other link kinds (jobs, schools, groups), CSV import, hard delete, background jobs.

## Approach

- [ ] Parser (tests first): add `post` to `LinkKind` in `core/linkedInUrl.ts`. Posts need their own extraction (the id is inside the last path segment or in a urn), so add a small `parsePostUrl` branch next to the existing one and keep the shared host check, the 200 link cap and de-duplication. The existing profile and company expectations stay unchanged.
- [ ] Schema: model `LinkedInPost` (`id` uuid7, `userId` cascade, `slug`, `url`, `status` enum default `UNPROCESSED`, `archivedAt?`, timestamps), `@@unique([userId, slug])`, `@@index([userId, archivedAt, createdAt])`, and `linkedInPosts LinkedInPost[]` on `User`. Additive migration `add_linkedin_post`.
- [ ] `database/linkedInRecord.ts`: make `RecordListQuery`/`recordWhere` generic over the status type (today typed to the profile enum). Profile and company tests stay unchanged.
- [ ] `LinkedInPostService` (static class, tests first), built on `database/linkedInRecord.ts` like `LinkedInCompanyService`: `addMany`, `list`, `getForUser`, `updateForUser` (status), `archiveForUser`, `restoreForUser`. Search field: `slug` only. Export from `database/index.ts`.
- [ ] tRPC resolver `trpc/api/resolvers/linkedInPost/linkedInPost.ts` with its unit test next to it, using the shared zod pieces in `resolvers/linkedInRecord.ts` (its own `list` input with the post statuses and no tag); register in `resolvers/index.ts` and `trpc/api/router.ts`. Error noun: `post`.
- [ ] Body: `/posts` page. Make `useListState`, `ListToolbar` take the status set (profiles and companies pass the existing one), split a `StatusBadge` out of `LinkStatusBadge`, and let `RowActions` omit the edit button. Per-entity files in `components/posts/`: `types.ts`, `post-statuses.ts`, `posts-table.tsx`, `add-posts-dialog.tsx`. Columns: post link, status, added, actions (mark processed or unprocessed, archive or restore). Add the route in `App.tsx`, the sidebar entry and the `site-header` title. Full width page: `grid w-full gap-4 px-4 lg:px-6`.
- [ ] Verify end to end, update `MEMORY.md`, set the plan to `done`.

## Edge cases and risks

- Empty paste, whitespace only, over 200 links, or one bad link among good ones: valid ones are saved, bad ones are reported back; a mix never throws.
- A profile or company link pasted in the posts box (and a post link in the other boxes) is reported as not valid for that list. The profile and company parsers must keep refusing `/posts/...` and `/feed/update/...` (today they do, since they require `/in/` or `/company/` as the first segment).
- The same post pasted twice, with tracking query strings (`?utm_source=...&rcm=...`), or in both link forms with the same id: de-duplicated by slug. The same post reached through two different ids (activity versus share) is not detected as a duplicate; accepted, since LinkedIn does not expose the mapping in the link.
- Very long numeric ids or a malformed urn: rejected by a strict pattern (digits only, 15 to 25 long), never stored.
- Concurrency: unique `(userId, slug)` plus `createMany` with `skipDuplicates`, no read-then-write. An archived post pasted again is restored and keeps its status.
- Another user's id on any call answers `NOT_FOUND`, the same as a missing one.
- Refactor risk: the parser change and the generic list code touch code that shipped for profiles and companies. Their existing tests are the safety net and must pass with no edits.
- A processed post that is pasted again is left as it is (skipped), never reset to unprocessed.
- Existing data: one new table and one enum, nothing else changes. Rollback is a follow-up migration that drops the table; the feature has no other state.
- Secrets: none involved. Dev vs production: no env, Docker, CI or deploy change; the migration runs through the existing init container.
- Compliance: stores links the user pasted for their own outreach list; no collection of data about other people. Any later enrichment follows the project rules on LinkedIn limits and privacy law (see `.plan/mindcase-integration.md`).

## Verification

- `pnpm --filter @automatedLinkedIn/brain db:migrate:dev --name add_linkedin_post` against local Postgres, then `db:generate`; check `prisma migrate diff` shows no drift.
- Whole monorepo: `pnpm lint`, `pnpm ts:check`, `pnpm test:unit:run`, `pnpm build`, all clean of errors and warnings.
- Integration test for the post service (`NODE_ENV=test DATABASE_URL=...`).
- Real path: a throwaway script drives the router against local Postgres (paste a mix of post, profile and company links, list, search, update, archive, restore, paste again), and the running brain answers `linkedInPost.list` with 401 without a token. State what could not be run (the page behind sign-in).

## Open questions

None. Locked on 2026-10-17.

## Outcome

Shipped as planned: `LinkedInPost` model and enum (additive migration `add_linkedin_post`), the `post` kind in `core/linkedInUrl.ts`, `LinkedInPostService`, tRPC `linkedInPost` (`create`, `list`, `get`, `update` for the status, `archive`, `restore`), and the `/posts` page with sidebar entry and header title.

Shared instead of copied: `database/linkedInRecord.ts` is generic over the status type; in body `useListState` and `ListToolbar` take the status set (profiles and companies now pass `linkStatuses`), `StatusBadge` is split out of `LinkStatusBadge`, and `RowActions` omits the edit button when there is no `onEdit`.

Deviations: none from the locked scope. Posts have no tag filter, so the post list input omits `tag`.

Verified: `pnpm lint`, `pnpm ts:check`, `pnpm test:unit:run`, `pnpm build` clean; integration tests for the post, company and profile services pass against local Postgres; the compiled brain answers `linkedInPost.list` with 401 without a token. Not run: the page in a browser behind sign-in, and e2e tests.

Follow-ups: erase on request (hard delete), duplicate detection across activity and share ids.
