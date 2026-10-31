# Companies filter drawer: filter on everything a company read holds, with ICP matching

- Status: done
- Created: 2026-11-01
- Locked by user: yes, 2026-11-01
- Ships in: the same PR as `.plan/companies-table.md` (#165, branch `feat/companies-table`)

## Goal

Add a Filters drawer to the LinkedIn companies table that filters on all the company read data (the JSON snapshot), not only the row's columns. Design it from the seat of the people who build and work ICP account lists. Reviewed by the GTM Engineer and Sales Rep personas, 2026-11-01; their input is summarised below.

## What exists today (checked in code, 2026-11-01)

- **Toolbar:** search, status, added, labels, show archived, plus Industry and Country pickers (`linkedInCompany.facets`). Columns menu. Sort by Name and Added.
- **Row columns** (filterable with plain Prisma): `name`, `industry`, `website`, `size` (band), `location`, `country`, `status`, `tags`, `createdAt`, `archivedAt`, `notes`.
- **Read data** lives only in `PageSnapshot.data` (jsonb, kind `COMPANY`, joined by `userId` and `slug`, no FK):
  - `founded`, `employees` (exact count on LinkedIn), `employeeRange`, `followers`;
  - `verified`, `active`, `pageType` / `showcase`;
  - `industryCategory`, `address`, `locations[]`, `specialities[]`, `about`, `tagline`, `jobsUrl`, `ctaUrl`;
  - breakdowns of up to 15 rows each: `byFunction`, `bySkill`, `byLocation`, `bySchool`, `byFieldOfStudy`, `byServiceCategory`;
  - `fetchedAt` is the time of the read.
- **Visits:** `LinkedInPageVisit` holds the latest visit per company and account.
- **Saved ICPs:** `Icp` has `industries`, `companySizes`, `locations`, `problemKeywords`, plus `includeTitles`, `excludeTitles` and `seniorities`. The last three are about people, not companies.
- **Reusable pieces:** the Sessions and My network drawers (`Sheet`, `MultiPick`, `Choice`, `YesNo`, `TextField`, `DateTimeRangeField`, chips).

## Persona input (summary)

- **GTM Engineer.** The five that matter most:
  1. Matches ICP;
  2. employee count;
  3. "at least N people in department X";
  4. specialities or about text contains;
  5. last read, or never read.

  They also want: a count before applying; counts per option; "unknown" for companies not read yet, not counted as failed.

  Breakdowns are only the top 15, so offer "at least N" only, never "none" or "fewer than", and label them "among the top 15 listed". The jobs link is not proof of hiring. Specialities are free text, so match by "contains".
- **Sales Rep.** Size band, "has people in department X", "staff in country or city" (not the same as HQ), "not read yet / read over 30 days ago", "not visited by us / visited in the last 7 days" (so two reps do not hit the same company), and founded after a year.

  They see as noise: followers, verified, active, page type, school, field of study, has a website. These go under "More".

  They ask for plain words ("Department", not "function"), a match count before applying, Clear all, and saved views.

## Requirements

Confirmed (from the request):

- A Filters drawer for the companies table.
- It filters on all the read JSON data.
- Designed from the ICP users' perspective.
- Ships in the same PR as the companies table.

Open questions: none. Answered 2026-11-01:

1. **Saved views: in this PR.**
   - A `CompanyView` table (`userId`, `name`, `filters` Json, `createdAt`, `updatedAt`, unique `(userId, name)`), in an additive migration.
   - Procedures `companyView.list`, `save` (create, or overwrite by name), `remove`.
   - A Views menu on the toolbar applies a view (its filters and sort), saves the current filters under a name, and deletes a view.
   - A view stores the filter JSON of the address, re-checked with the same zod schema when applied; a view that no longer parses is shown as "cannot be opened" and can be deleted.
2. **Matches ICP: all of the ICP's set criteria.** Unread companies are hidden unless "Include companies not read yet" is on.
3. **Offer "Has a jobs link"** (yes / no / either, under More), worded as a link, not as hiring.
4. **Employees: both.** "Size (company says)" is a size-band multi-pick in Fit, and "People on LinkedIn" is a range under More.
5. **Wording: keep "read".**

The questions as they were asked:

1. **Saved views** (both personas asked): build them now, or later in their own plan? Recommended: later. The filters live in the address in this PR, so a view can already be bookmarked and shared.
2. **Matches ICP:** pick one saved ICP and match on its company fields only:
   - industries: the company industry or category contains one of them;
   - company sizes: the size band;
   - locations: the HQ country, city or state, or an office;
   - problem keywords: specialities, tagline or about contains one of them.

   Pick one:
   - **(a)** "all of the ICP's set criteria";
   - **(b)** "at least N of them".

   Recommended: (a), with a toggle "Include companies not read yet" (off by default). An unread company is unknown, not failed. Titles and seniorities are left out, because they are about people.
3. **"Hiring now":** do not offer it. Every read has a `jobsUrl`, which is only a LinkedIn search link, not proof of open jobs. Recommended: leave it out.
4. **Employee filters:** offer both the size band (multi-pick) and the exact count on LinkedIn (range, under "More")? Recommended: yes, labelled "Size (company says)" and "People on LinkedIn".
5. **Wording:** the app says "Read" elsewhere (Read again, Last read). Keep "read", or switch to "checked" as the Sales Rep asked? Recommended: keep "read", for consistency with the drawer and the table.

## Design (proposed)

### Drawer groups

The drawer is a `Sheet`, like Sessions. Chips sit under the toolbar with Clear all. The footer button says "Show N companies", a live count as filters change (debounced). Groups:

1. **ICP:** Matches ICP (pick a saved ICP), plus "Include companies not read yet".
2. **Fit:**
   - size band (multi);
   - founded between (year range);
   - HQ state or city (multi, beside the toolbar's country);
   - office location (multi);
   - industry category (multi).
3. **Team** (labelled "among the top 15 listed"). Each filter is a list of rows, each row a value picker plus a minimum number (default 1):
   - "At least N people in department";
   - "with skill";
   - "based in";
   - "in service category".
4. **What they do:**
   - specialities (multi, with counts);
   - "Tagline or about contains" (several words, any or all).
5. **Activity:**
   - last read: never, in the last 7 or 30 days, or older than 30 or 90 days;
   - last visit by your accounts: never, or in the last 7 or 30 days;
   - notes contain.
6. **More:**
   - people on LinkedIn (range);
   - followers (range);
   - verified, active and showcase page (yes / no / either);
   - has a website;
   - has a jobs link;
   - school;
   - field of study.

### Brain

- **Shared filter shape:** one zod `companyFilters` object, shared by `list`, a new `count`, and the new drawer facets.
- **Row filters** stay Prisma `where` clauses:
  - size bands, HQ city or state (`location` contains), notes contain;
  - last visit, through `visits: { some / none }`.
- **Read filters** are one parameterised SQL query (`Prisma.sql`, never string-built), `snapshotSlugs(userId, filters)`, over `PageSnapshot.data` (jsonb). It returns the matching slugs, and the Prisma query adds `slug: { in }`.
  - Breakdowns: `EXISTS (SELECT 1 FROM jsonb_array_elements(data->'byFunction') e WHERE e->>'label' = ANY($1) AND (e->>'count')::int >= $2)`, once per team row.
  - Ranges use casts on `founded`, `employees` and `followers`.
  - Booleans: `verified`, `active`, `showcase`.
  - Contains: `ILIKE` with escaped `%` and `_`, on `specialities`, `tagline` and `about`.
  - Last read: from `fetchedAt`.
  - It runs only when a read filter is set. "Never read" means `NOT EXISTS` a snapshot, handled with `slug: { notIn }`.
- **Matches ICP:** turns the ICP's company fields into the same filters (any of its industries, any of its sizes, any of its locations, any of its keywords). This is pure and unit tested.
- **New procedures:**
  - `linkedInCompany.count(filters)` returns the match count for the footer.
  - `linkedInCompany.drawerFacets` returns the distinct values with company counts, for: departments, skills, staff locations, service categories, schools, fields of study, specialities, HQ states and cities, office locations and industry categories. It is one SQL query with `jsonb_array_elements`, top 200 each, and only for the owner's non-archived companies.
- **Indexes:** none new. Snapshot filtering scans the owner's `COMPANY` snapshots through the unique `(userId, kind, slug)` index.

### Body

- **Filter model:** `components/companies/filters/model.ts`. It holds the zod filter shape in the address (a `filters` JSON param, as on Sessions and My network), `apiFilters`, and `chipsOf`, with unit tests.
- **Drawer:** `components/companies/filters/company-filters.tsx`, with the sheet, a team-row editor and chips, built on the My network field components.
- **Page:** a Filters button with a count. The toolbar's Industry and Country stay where they are; the drawer does not repeat them.

## Scope and non-goals

- In scope:
  - the drawer, chips and live count;
  - all the groups above;
  - Matches ICP;
  - saved views (table, procedures, Views menu);
  - brain filters, `count` and `drawerFacets`;
  - tests.
- Out of scope:
  - "N new since you last opened a view";
  - sharing views between users;
  - a "hiring" signal beyond the jobs link;
  - merging similar specialities;
  - person-level ICP fields;
  - the Profiles and Posts tables.

## Approach

- [ ] Tests first:
  - brain unit tests for the ICP-to-filters mapping and the SQL builder (parameters, escaping);
  - an integration test that seeds snapshots and checks each filter group, never read, last visit, Matches ICP, `count` and `drawerFacets`;
  - body unit tests for the filter model.
- [ ] Brain: `companyFilters` zod, `snapshotSlugs`, `count`, `drawerFacets`, and the list wiring.
- [ ] Brain: the `CompanyView` model and migration, `CompanyViewService`, the `companyView` router, and tests (a duplicate name overwrites; a foreign id answers not found).
- [ ] Body: the model, the drawer, chips, the live count, and the page button.
- [ ] Checks, and a browser check on the local data (Nova and Du Toit), the plan Outcome, `MEMORY.md`, and a push to #165.

## Edge cases and risks

- **Top-15 breakdowns:** only "at least N" is offered, and it is labelled. A missing value never counts as zero people.
- **Unread companies:**
  - read filters exclude them, unless "Include companies not read yet" is on (ICP) or the filter is "never read";
  - chips say how many are unknown.
- **Old snapshots** lack the new fields (`detailed: false`), so `address`, `bySchool` and similar are missing. Those filters treat the data as unknown and do not match; the drawer hints "Read again".
- **Injection:** every value is a bound parameter. `ILIKE` escapes `%` and `_` and `\`. Labels are capped at 200 characters, lists at 50 values, and team rows at 5.
- **Large `IN` lists:** slugs come from read companies only. A guard caps them at 20,000 and answers a plain message beyond that, a limit no owner is near. Revisit with a jsonb index or a join if needed.
- **Performance:** the jsonb scan is per owner, bounded by their read companies. The live count is debounced (300 ms) and cancelled on change.
- **Security:** everything is scoped to `userId`. The ICP must be the owner's (a foreign id answers not found).
- **Migration:** additive, the `CompanyView` table only. Rollback is a code revert; the table stays unused.
- **No Docker or CI impact.**

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, plus the companies integration tests.
- In the browser with the local data:
  - "At least 5 people in Sales" keeps Nova and drops Du Toit;
  - "Founded after 2001" keeps Nova;
  - Matches ICP with industry "Maritime" keeps Du Toit;
  - "Never read" is empty;
  - chips, Clear all and the live count work.

## Outcome

Shipped on `feat/companies-table` (#165):

- **Brain:**
  - `database/companyFilters.ts` holds the drawer filters and Matches ICP, as one parameterised SQL query over `LinkedInCompany LEFT JOIN PageSnapshot` that returns ids for the Prisma query. jsonb keys are code constants. ILIKE escapes `%`, `_` and `\`. Bands compare without spaces and with en dashes made hyphens. Results are capped at 20,000 ids.
  - `LinkedInCompanyService.count` and `drawerFacets` (top 200 per kind).
  - The `CompanyView` table and `CompanyViewService`, in migration `20261101120000_company_views`.
  - New procedures on `linkedInCompany`: `count`, `drawerFacets`, `views`, `saveView` and `removeView`. The list takes the drawer filters, and `icpId` must be the owner's (NOT_FOUND otherwise).
- **Body:**
  - `companies/filters/model.ts` keeps the filters in the address (`filters` JSON), with chips and the brain input. Schools and fields of study go to brain as team rules with at least one person.
  - `company-filters.tsx` holds the sheet, with groups for ideal customer, fit, team, what they do, activity and more. Team rules are editable rows. The button shows a live count, refreshed 300 ms after a change.
  - `views-menu.tsx`, and the page's Filters button and chips.

Deviations:

- A view stores the page's address query (`query`, a string) instead of a `filters` JSON. It keeps the drawer filters, Industry and Country, sort, labels and added. Search, status and archived are not in the address, so a view does not keep them.

Verified:

- Lint, ts:check, build and unit tests pass, and four company integration files (12 tests) pass.
- In the browser on local data:
  - "At least 5 in department Sales" left only Nova;
  - the drawer showed "Show 1 company", and "Show 2 companies" after the rule was removed;
  - the HQ picker listed Minnesota and Plymouth with counts;
  - the Views menu opened.
- Saving a view in the browser was not tried; the integration test covers saving, overwriting and deleting.
