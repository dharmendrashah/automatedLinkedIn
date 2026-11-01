# Post authors join My network (or /companies) and show in the post drawer

- Status: done
- Created: 2026-11-01
- Locked by user: yes, 2026-11-01 (answers below)

## Goal

When a post is read, its author becomes someone the owner can work with: a person joins My network and their profile is read, a company page joins /companies and is read. The post drawer shows a short gist of the author; a click opens their own drawer on top, as on /companies and /network.

## Requirements (locked 2026-11-01)

- The author is known only from the post read, so this happens when a post read finishes (drawer Read, bulk Read, or "Get their details now" on import).
- A person not yet known (no `Person`, no saved profile, not suppressed or do not contact) is saved as a target profile in the default client, labelled `from posts` (Found by: target), and their profile is read at once ($0.004) unless read in the last 30 days.
- A person already on My network (or saved, or in a list) is left as they are; the drawer shows their newest read. No new paid read.
- A company author is added to /companies (labelled `from posts`) and its page is read ($0.004) unless read in the last 30 days; an existing company is left as it is.
- Posts read before this change: their authors are added once by a data migration, without reads.
- The post drawer shows the author gist: photo, name, headline, company, where they are (My network or /companies) and the read state (read N ago, reading, not read). A click opens the person or company drawer stacked on top (`useDetailStack`), falling back to the page drawer.

Open questions: none.

## Design

- Brain `database/postAuthor.service.ts`: `PostAuthorService.keep(userId, author)` called by the POST read's `store` in `dataReads.ts` after the post is kept. Person: `LinkedInProfileService.addMany` + `PeopleIndexService.refresh` + `PersonService.readFull` (skipped when `PersonSnapshotService.recent` has them; `ConflictError` ignored). Company: `LinkedInCompanyService.addMany` + `CompanyPageService.readMany`.
- `postPage.detail` returns `author` (the gist) instead of only `authorSlug`; it polls while the author's read runs.
- Migration `add_post_authors`: inserts `LinkedInProfile` rows (default client, label `from posts`) for person authors of stored POST reads whose slug is plain (`[a-z0-9_-]{2,100}`), skipping known, archived, suppressed and do-not-contact people; inserts `LinkedInCompany` rows for company authors the owner does not have. The `people_index` trigger marks them for the index job.
- Body: `AuthorGist` in `post-view.tsx` under the post card.

## Edge cases and risks

- An author URL that is not a `/in/` or `/company/` link (internal id): nothing is added.
- A target the owner archived: never restored by this (an archived profile counts as known).
- Do not contact or suppressed: never added, never read.
- Reads paused or read today: the add still happens; the read is skipped.
- A re-read of the same post: the author is already known, so nothing new happens and nothing is paid.
- Cost: one profile or company read per new author, booked to no client.
- Import cycles: `dataReads` → `postAuthor` → `person.service` → `dataRead.service` → `dataReads`; all calls happen at run time, not at load.
- Migration: data only, additive; slugs with other characters are left for the next read.

## Approach

- [x] Tests first: `PostAuthorService` integration (new person added and read; known person left; company added and read; do not contact skipped); `postPage.detail` returns the gist; migration on a test database.
- [x] Brain service, store hook, detail gist, migration.
- [x] Body gist and stacked drawer.
- [x] Checks, `MEMORY.md`, commit.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests.

## Outcome

Shipped: `PostAuthorService.keep` (brain `database/postAuthor.service.ts`) runs in the POST read's store after the post is kept, so a read post's author joins My network (target profile, `from posts`, default client) or /companies, and the person's profile or the company page is read once unless read in the last 30 days. `postPage.detail` returns `author` (kind, slug, name, headline, photo, company, `reading`, `read`, `readAt`) in place of `authorSlug`. Body: the post drawer shows an "Author" section (`AuthorGist` in `posts/post-view.tsx`) that opens the person or company on the stacked drawer (`useDetailStack`), or the page drawer when there is no stack; the detail query polls while the author's read runs. Migration `20261101210000_add_post_authors` (data only, no reads, one statement) adds the authors of posts read before this change, skipping known, archived, suppressed and do-not-contact people, and non-plain slugs.

Deviations: a company slug in the migration allows `.` as well (`[a-z0-9._-]`), as the earlier company migration does; a person slug is `[a-z0-9_-]` as planned. The author is kept before the paid-read check, so a refused or paused read still adds the author (per the plan).

Verified: lint, ts:check, unit tests, build, and all 51 brain integration files (324 tests) against local Postgres, including the migration run twice on a seeded owner. Not verified: a browser walk-through of the gist and the stacked drawer behind sign-in; a body test covers neither the reading nor the failed state of the gist.

Follow-ups: browser check on staging; authors of posts whose slug has non-ASCII or encoded characters are left for the next read.
