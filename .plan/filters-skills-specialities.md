# Filters: specialities on companies, skills on My network

- Status: done
- Created: 2026-11-01
- Locked by user: yes, 2026-11-01

## Goal

The filter drawers gain two "what they know" filters: companies by **specialities**, and My network people by **skills**, so the owner can narrow a list to, say, companies that do "managed security" or people who know "Salesforce".

## What exists today (checked in code, 2026-11-01)

- **Companies: a Specialities filter already exists.** Filters drawer, group "What they do": a "Specialities" picker (options = the top 200 specialities of the owner's read companies, `drawerFacets.speciality`) plus "Tagline, about or specialities say" (free words, any/all). Brain: `companyFilters.ts` matches any picked speciality in `PageSnapshot.data.specialities` (exact text, case-insensitive). It only knows companies that were read (`Read company page`); unread companies have no specialities, so the picker is empty when few companies are read.
- **My network: no skills filter.** Skills live only in the saved profile read (`PersonSnapshot.data.skills`, up to the read's cap). `Person` (the row the list and its filters run on) has no skills column, and filters are plain Prisma conditions on `Person` (`peopleFilters.ts`), so skills cannot be filtered today.
- **Filters plumbing on My network:** schema in `packages/contracts/src/peopleFilters.ts` (copied in body `my-network/filters/model.ts`, a parity test keeps them equal), conditions in `brain/database/peopleFilters.ts`, picker options from `PeopleService` options (top 200 countries, companies, labels per client), drawer `my-network/filters/filters-sheet.tsx`, chips from `model.ts`, and the filters travel in the address (`?filters=`) and into Export.
- **Who fills a person's facts:** the people index (`peopleIndex.ts` `profileFacts`) copies title, company, country, premium from the newest profile read onto every `Person` of that profile, on each read and rebuild.

## Requirements

Confirmed (from the request):

- Companies can be filtered by specialities.
- My network people can be filtered by skills.

Locked (owner, 2026-11-01):

1. **Skills on My network:** a "Skills (from a profile read)" picker in the drawer's "Who" group with an **All of them / Any of them** switch, **All by default**. A chip "Skills: Salesforce, HubSpot" shows when on; it goes into the address and into Export like the other filters.
2. **Specialities on companies, all of these:** the picker gets the same **All / Any** switch (All by default; today it is any only); a **quick Specialities picker on the toolbar** next to Filters (same filter, same chip); the options come from the server as you type (below); the free-text match stays the existing "Tagline, about or specialities say" field.
3. **Options load from the server as you type** for both pickers (skills and specialities can grow large): the most common values first, then the values containing the typed text, with counts; values already picked always stay listed. Matching stays exact on the picked values (picker only, as LinkedIn wrote them).
4. Both filters only know what a read gave: unread people and companies never match. The pickers say "from a profile read" / "from a company read".

Open questions (must be empty before locking):

- None. Behaviour change: the companies Specialities filter now defaults to All (it was Any); a saved view or link with several specialities narrows more than before.

## Scope and non-goals

- In scope: a `Person.skills` column filled by the index, its backfill, the skills filter end to end (contracts, brain, body, chips, Export), Any/All on specialities (if Q3 is yes).
- Out of scope: reading profiles or companies to fill missing skills or specialities; endorsement counts; skills on `/profiles` or in workflows' ICP; normalising spellings.

## Approach

- [ ] Brain, data: additive migration `Person.skills String[] @default([])` with a GIN index, and a backfill in the same migration from `PersonSnapshot.data->'skills'` by owner and slug.
- [ ] Brain, index: `profileFacts` returns `skills` (as the read has them, at most 50); `draftOf` writes them, so every read and rebuild keeps them current, and a person whose read is deleted (Do not contact) gets `[]`.
- [ ] Contracts: `skills: values(text)`, `skillsMode: 'any' | 'all'` (default any) in `peopleFiltersSchema`; the body copy and its parity test.
- [ ] Brain, filter: `peopleWhere` adds `skills: { hasSome | hasEvery }`; options add `skills` (unnest, count, top 200 per scope).
- [ ] Body: Skills picker plus Any/All in `filters-sheet.tsx`, chip in `model.ts`, the drawer's "N filters on" count.
- [ ] Companies (if Q3): `specialitiesMode` in the company filter model, `companyFilters.ts` any/all, drawer switch, chip text.
- [ ] Tests first: contracts schema; `peopleWhere` (any/all); `profileFacts` skills; integration: index writes skills, list filters by them, options count them, backfill on existing rows; body model chips and the address round trip.
- [ ] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` (brain unit tests also with `DATABASE_URL` unset), integration tests; staging after the migration.

## Edge cases and risks

- **Unread people / companies:** no skills or specialities, never match; the label says where the values come from. "Profile read: yes" already exists to see who can match.
- **Spelling variants:** exact values; two spellings are two options (question 2).
- **Same profile in two clients:** the index writes the same skills to both rows; options are per client scope (All clients sums them).
- **Old reads:** reads made before skills were kept have none; the backfill copies what each read has.
- **Do not contact / erase:** the read is deleted, so the next rebuild clears the skills; erase deletes the row.
- **Limits:** 20 values per filter (the schema's limit), 200 options; a person keeps at most 50 skills (the read's cap).
- **Performance:** GIN index on `skills`; options query is one `unnest` per scope, like labels.
- **Migration:** additive column and index; the backfill is an `UPDATE ... FROM "PersonSnapshot"` on existing rows (staging: a few thousand people, seconds). Rollback: the column can stay unused.
- **Export:** uses the same filters, so a skills filter narrows the CSV too; skills are not added as a CSV column (out of scope unless asked).
- **Saved views:** companies' saved views store the address query, so a specialities mode is kept; My network has no saved views.

## Verification

- Unit and integration tests above.
- Staging: open My network, Filters, Skills, pick one, see only people whose read lists it; Export gives the same people. Companies: Specialities with All picks only companies with every one.

## Outcome

- Shipped (branch `feat/filters-skills-specialities`):
  - brain: `Person.skills` (migration `20261101180000_person_skills`: column, GIN index, backfill from `PersonSnapshot`), filled by `profileFacts` through the people index; `peopleFiltersSchema` `skills` + `skillsMode` (default `all`); `peopleWhere` `hasEvery`/`hasSome`; `people.skillOptions({ clientId, search })` and `linkedInCompany.specialityOptions({ search })` (50 per answer, most common first, `ILIKE` with the typed text escaped); company filter `specialitiesMode` (default `all`).
  - body: `MultiPick` takes a server `search` (no local filtering, picked values always listed); `useDebounced` (250 ms); `SkillsPick` in the My network drawer, `SpecialitiesPick` in the Companies drawer and as a compact toolbar button; All/Any switch when two or more are picked; chips say the mode.
- Deviations: the drawer's facet list still carries `speciality` (unused by the picker now).
- Verified: lint, ts:check, unit tests (with `DATABASE_URL` unset), build; brain integration tests for people, company filters and the index; the backfill filled 2 of 2 local people whose read has skills; the full integration suite serially (the known shared-state flakes pass alone).
- Not run: the pickers in a browser; staging needs the migration.
