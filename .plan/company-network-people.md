# Company drawer: your My network people who work there

- Status: done
- Created: 2026-11-01
- Locked by user: yes, 2026-11-01 (answers to the five questions)

## Goal

The company drawer on `/companies` shows the people of My network who work at that company: how many there are, with a small strip of their photos, and a list. Clicking a person opens the same person drawer as `/network` (status, labels, notes, invite, answer, profile, history), with a way back to the company.

## What exists today (checked in code, 2026-11-01)

- **Wrong source.** "Your people there" (`companies/company-view.tsx`) reads `CompanyPageService.detail` → `workflowListMember` rows of the owner's **workflow lists**, matched only by an exact, case-insensitive **company name**. My network people (`Person`) are never looked at, so connections, requests, conversations and invites never show.
- **Name match fails on real data.** On staging the company is "Rivulet Digital Private Limited" while the person's company text is "Rivulet iQ"; the names never match.
- **A better key exists.** `Person.companySlug` is the current company's LinkedIn slug from the newest profile read (`peopleIndex.ts`), the same slug the company has in `/companies` (a profile read saves it there, label "From profiles"). It is only set for people whose profile was read. `Person.company` is free text (from the connection, list row or read).
- **The person drawer already exists from a company.** `DetailDrawers` opens `PersonBySlug` when a row is clicked (`?person=<slug>&back=company:<slug>`, "Back to the company"). `PersonBySlug` uses `people.find` and shows the full My network panel (`PersonPanel`) when the person is on My network, else a plain profile view. So the drawer part works; only the list feeding it is wrong.
- **Clients.** `Person` is per client (`@@unique([clientId, slug])`); companies are per owner. One profile can be a `Person` in two clients.
- **Indexes.** `Person` has `@@index([userId, slug])` but nothing on `companySlug`.

## Requirements

Confirmed (from the request):

- The company drawer shows the My network people who work at the company.
- It shows how many, with a small visual (see question 1).
- Clicking a person opens the `/network` person drawer with all its options and values.

Locked (owner, 2026-11-01):

1. **Who counts:** a `Person` of the owner whose `companySlug` equals the company's slug, **or** whose `company` text equals the company's name or its read name (case-insensitive, trimmed). Name-only rows carry a small "matched by name" note. One row per profile; when the same profile is in two clients, show it once with both client names.
2. **Matching is live, not stored.** It runs at query time, so when a person's profile is read later (Purvi, say) and gets `companySlug`, she shows under the company from then on with no extra step; the read also saves that company to `/companies` as today. Nothing has to be re-linked by hand.
3. **Section "Your people there (N)"** at the top of the Overview tab, with a client picker: **All clients** by default, or one client. Each row: photo, name, title or headline, client chip, status chip and the reason line ("Connected · 99 days ago"). Sorted: needs me first (`priority`), then last touch. Up to 50 rows, then "Show all N on My network" (`/network` with the company filter).
4. **Gist on hover:** hovering (or focusing) a person shows the same small card as the chat window (`unibox/person-card.tsx`: photo, headline, which accounts are connected, other accounts talking, list, Do not contact, View profile). The card is reused, with its account made optional.
5. **Click** opens the existing `/network` person drawer (`PersonBySlug`); Back returns to the company.
6. **Do not contact** people are listed greyed with the badge and counted.
7. **Companies table** gets a "People" column: the count and 3 small photos, each with the same hover card; all clients; in the column menu like the others.
8. Workflow list members are no longer read separately (every list member of a client is already a `Person` through the index).

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: the brain query (with an optional client) and its index, the drawer section with the client picker and hover cards, the table column, tests.
- Out of scope: reading profiles to fill missing `companySlug`; changing how `Person.company` is written; a company filter by slug on `/network` (the link uses the existing company text filter); the `/posts` drawer.

## Approach

- [x] Brain: `CompanyPageService.detail` swaps the `workflowListMember` query for `PeopleService.atCompany(userId, { slug, names, clientId? })` (one query, `OR` on `companySlug` and lower(`company`)), returning id, slug, name, photo, title or headline, client names, status, reason, `doNotContact`, `matchedBy`; total count separately. Grouped by slug. The drawer's client picker passes `clientId` (owner's client checked).
- [x] Brain: additive migration `@@index([userId, companySlug])` on `Person`.
- [x] Brain: `LinkedInCompanyService.list` adds `people: { count, photos[3] }` per row, one grouped query for the page's slugs and names.
- [x] Body: `PersonCard` takes an optional `accountId` so the company drawer and table reuse it; the new "Your people there" section (client picker, rows with photo and chips, "matched by name" note, greyed Do not contact, "Show all on My network").
- [x] Body: People column in `companies-table.tsx` and `COMPANY_COLUMNS` (count plus 3 photos, each with the hover card; click opens the person drawer).
- [x] Tests first: integration test for the matching (slug, name, case, two clients, other owner's people never seen, Do not contact per Q3); unit tests for the strip's "+N" and the resolver shape.
- [ ] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` (also with `DATABASE_URL` unset for brain unit tests), integration tests (done), then check on staging with Rivulet (not done).

## Edge cases and risks

- **No read, different name** (the staging case if Purvi's profile was never read): nothing matches yet. As soon as her profile is read, `companySlug` is set by the index and the live match picks her up (requirement 2). The empty text says so: "People show here once their profile is read or their company name matches."
- **Common names** ("Google" vs "Google Cloud", two different "Acme"): name match is exact, so near names miss and identical names of different firms both match; the "matched by name" hint makes that visible.
- **Same person in two clients:** one row, both clients named; the drawer opens the client `people.find` picks (today: the first found). Check `PeopleService.find` order.
- **Ownership:** every query is scoped by `userId`; a foreign company slug returns null as today.
- **Performance:** the slug lookup uses the new index; the name lookup scans the owner's people by `userId` (thousands at most). The table column adds one grouped query per page of 25 to 50 rows.
- **Archived company:** the section still shows (read-only data), as today.
- **Data and rollback:** one additive index; code revert is enough to roll back.

## Verification

- Integration: matching rules above against local Postgres.
- Unit: avatar strip, resolver output.
- Staging: open Rivulet in `/companies`, see Purvi Pandya (or the empty-text reason), click her, get the `/network` drawer, press Back.

## Outcome

- Status: built on branch `feat/company-network-people`, not yet seen in a browser or on staging.
- Brain: `CompanyPeopleService` (`database/companyPeople.service.ts`: `atCompany` for the drawer, `counts` for a table page; one Prisma query each, `OR` on `companySlug` and case-insensitive `company`, grouped per profile, Do not contact last, at most 5,000 rows read). `CompanyPageService.detail` no longer returns `people`; new `CompanyPageService.people(userId, slug, clientId?)` and tRPC `companyPage.people`. `linkedInCompany.list` rows carry `people: { count, first[3] }`. Migration `20261101150000_person_company_slug_index` (additive).
- Body: `companies/company/company-people.tsx` (section at the top of Overview, client picker when there are 2+ clients, hover card, status, clients, Do not contact greyed, "matched by name", "Show all N on My network"), People column in the table, `PersonCard` with an optional account.
- Deviations: the separate `companyPage.people` query (instead of inside `detail`) so the client picker refetches only the people and `readFull`'s cached detail stays valid. The "Show all" link filters My network by the company's name, so people matched only by link may not all appear there.
- Verified: lint, ts:check, unit tests (also with `DATABASE_URL` unset and no `.env.test`, like CI), build, all 50 brain integration test files serially (new `companyPeople.integration.test.ts`; `page.integration.test.ts` now proves a list member reaches the drawer through My network).
- Not run: the page in a browser, staging (needs the migration and new brain/body images).
- Follow-up (owner, 2026-11-01, in PR 169): former employees show too. Every position of the owner's saved profile reads (`PersonSnapshot.data.experience`) at the company, by its link or name, brings the person in; when none of their positions there is open (`end` null) and their current company is another, they are **Former**, with the year or month they left. Drawer: a "Former · left 2023" badge, current people first; table: the current count plus "N former", former photos greyed. Derived from the saved read each time, so a new read that shows a move turns them Former with no extra step.
