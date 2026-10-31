# Companies table: the read's name, logo, country and industry, on TanStack Table with scroll paging

- Status: done
- Created: 2026-11-01
- Locked by user: yes, 2026-11-01

## Goal

The LinkedIn companies page shows rows like `nova-communications-inc` with an empty Website column, even after the company was read. Make the table good to look at and useful:

- the company's real name, logo (through `/cdn`), country and industry, plus a few details;
- built on TanStack Query and TanStack Table, with scroll paging instead of the Previous/Next pager.

## What exists today (checked in code, 2026-11-01)

- **Page:** `apps/body/src/pages/Companies.tsx`.
  - Fetches with `trpc.linkedInCompany.list.useQuery(state.query)`. `useListState` sends `page`, `pageSize` 25, search, status, labels, added since and archived.
  - Footer: `Pager` (Previous and Next).
  - Also on the page: `LinkBulkBar` (bulk label and archive), the edit dialog, `ViewPageDialog` and `DetailDrawers kind="company"`.
- **Table:** `components/companies/companies-table.tsx`. It is a plain shadcn table with these columns: select, Company (name or slug), Website, Status, Labels (`LabelCell`), Added, and row actions (view, edit, archive).
- **Brain:**
  - `LinkedInCompanyService.list` answers `{ items, total }` with offset paging, newest first. It searches `name`, `industry`, `website` and `slug`.
  - The row columns `name`, `industry`, `website`, `size` and `location` are only filled when someone types them, or (name only) when a profile read finds the company (`saveFound`, which fills empty names).
- **Why the rows show the slug:** a company read is kept in `PageSnapshot` (kind `COMPANY`, the same `userId` and `slug`). The list never looks at it, and the read never writes its name, industry or website back onto the company row. So the name is empty, the search cannot find "Nova", and Website stays blank.
- **Shared with other pages:** `listInput` (`linkedInRecord.ts`), `useListState`, `ListToolbar`, `LinkBulkBar`, `RowActions` and `LabelCell` are shared with the Profiles and Posts pages.
- **Ready to reuse:**
  - `people-table.tsx` and `sessions-table.tsx`: TanStack Table v9, `useVirtualizer`, `useFillHeight`, `LOAD_AHEAD`, `SortHeader`.
  - `Picture` and `useMediaSource`, which load only through `/cdn`.
  - `flagOf` (country flag), and `domainOf` (`companies/company/facts.ts`).

## Requirements

Confirmed (from the request):

- A better-looking table.
- TanStack Query and TanStack Table, with scroll paging.
- The proper company name and details, country, industry, and the logo through the CDN.

Open questions: none. Answered 2026-11-01:

1. **Write back: always take the newest read.** Each company read overwrites `name`, `industry`, `website`, `size`, `location` and the new `country` with the read's values. A field the read does not have keeps its current value. An owner's edit lasts until the next read.
2. **Backfill: yes.** A one-time SQL migration copies these fields from the saved reads, with the read winning where it has a value.
3. **Columns:** as proposed, and hideable, kept per browser (as on Sessions).
4. **Sorting:** Added (default, newest first) and Name.
5. **Filters:** keep today's, and add **Country** and **Industry** pickers (multi), with options from the owner's companies.

The questions as they were asked:

1. **Write the read back onto the company row?** When a company read is stored, fill `name`, `industry`, `website`, `size` (the range) and `location` (the headquarters) from the read. This makes search and the edit dialog see them. Pick one:
   - **(a)** fill only empty columns, so the owner's own edits win (the same rule as `saveFound`);
   - **(b)** always take the newest read.

   Recommended: (a).
2. **Existing companies:** copy the name and other details from reads already saved, with a one-time additive data migration in SQL from `PageSnapshot`, filling empty columns only. Recommended: yes. Without it, today's rows keep showing slugs until each company is read again (paid).
3. **Columns:**
   - Company: logo, name, and the tagline or slug underneath;
   - Industry;
   - Country: flag and country;
   - Size: the range, plus the exact count on LinkedIn;
   - Followers;
   - Website: domain, opening in a new tab;
   - Status, Labels, Added, Last read (time ago), and the row actions.

   Add or remove any? Should columns be hideable (kept per browser, as on Sessions)?
4. **Sorting:** by Added (default, newest first) and Name? Followers and size sorting need the read in the row, so (b) or more columns. Recommended: Added and Name only.
5. **Filters:** keep today's (search, status, added, labels, archived)? Or also add Country and Industry pickers? Recommended: keep today's for now.

## Design (proposed)

### Brain

- **List rows:** `LinkedInCompanyService.list` also returns a small `page` summary per row, taken from the company's `PageSnapshot` in one extra query by `(userId, kind COMPANY, slug in page)`. The summary has `name`, `logo`, `tagline`, `industry`, `country` (from `address.country`, or the last part of `headquarters`), `employeeRange`, `employees`, `followers`, `website` and `fetchedAt`. It is `null` before a read.
- **Write back on read:** the `COMPANY` store in `dataReads.ts` overwrites the company row with the read's `name`, `industry`, `website`, `size` (the range), `location` (the headquarters) and `country` (answer 1), in the same request. A field the read lacks is left as it is.
- **New column `country` (`String?`)** on `LinkedInCompany`, with an index `(userId, country)`. Additive migration. Country and industry filtering and the facet lists read the row, not the JSON.
- **Migration:** `UPDATE "LinkedInCompany" c SET name = COALESCE(p.data->>'name', c.name), ...`, plus `country` from `data->'address'->>'country'`, else the last part of `headquarters`. It reads from `PageSnapshot` where `kind = 'COMPANY'` and the user and slug match. No data is removed.
- **Filters:** the companies resolver extends the shared `listInput` with `industries` and `countries` (string arrays, max 50), so Profiles and Posts are untouched. A small `linkedInCompany.facets` returns the owner's distinct industries and countries with counts.
- **Sorting:** the input gains `sort: { by: 'createdAt' | 'name', desc }`. Name sorts with nulls last, and then by slug.
- **Paging:** keep `page` and `pageSize` and `{ items, total }`, so Profiles and Posts are untouched. The body asks for page after page. `total` gives the footer count and says when to stop.

### Body

- **Hook `use-companies.ts`:** `trpc.linkedInCompany.list.useInfiniteQuery`, with `getNextPageParam` going to page + 1 while fewer than `total` rows are loaded, page size 50. Rows are de-duplicated by id. Mutations invalidate the list as today.
- **`companies-table.tsx`:** rebuilt on TanStack Table v9 plus `useVirtualizer`, following `sessions-table.tsx`:
  - sticky header, `useFillHeight`, and loading the next page `LOAD_AHEAD` rows before the end;
  - keyboard and click open the drawer;
  - the selected row is highlighted;
  - bulk select kept, with "select all" covering the loaded rows.
- **Company cell:** a rounded-square `Picture` (logo through `/cdn`, initials fallback), the name with the read's name first, then the row's name, then the slug, and a muted second line with the tagline or slug.
- **Country cell:** `flagOf(country)` and the country name.
- **Website cell:** the domain, opening in a new tab, with `rel="noreferrer noopener"`.
- **Last read cell:** time ago, or a muted "Not read".
- **Page:**
  - the same header and toolbar;
  - the `Pager` is replaced by a footer line ("N companies", and "Loading more…" while fetching);
  - the root keeps `grid w-full gap-4 px-4 lg:px-6`;
  - `DetailDrawers` gets the loaded order.
- **Files:** a `components/companies/cells.tsx` file for the cell pieces, if the table file gets long.

## Scope and non-goals

- In scope:
  - the list's `page` summary;
  - writing the read back onto the row, and the backfill;
  - the infinite hook, the TanStack table and the page footer;
  - the Country and Industry filters, sorting by Added and Name, and hideable columns;
  - tests.
- Out of scope:
  - the Profiles and Posts tables;
  - live refresh.

## Approach

- [ ] Tests first:
  - service unit or integration test: the list returns the `page` summary from a snapshot, and `null` without one;
  - the read fills empty columns and leaves edited ones;
  - the migration on a test DB.
- [ ] Brain: the `page` summary in `list`, the write-back in `dataReads.ts`, and the backfill migration.
- [ ] Body: `use-companies.ts`, the TanStack `companies-table.tsx`, and the page footer.
- [ ] Unit test for the pure summary and cell helpers (country from an address or a headquarters line).
- [ ] Checks, the plan Outcome, `MEMORY.md` and the PR.

## Edge cases and risks

- **No read yet:** the row shows the slug, initials and dashes, and "Not read".
- **Old snapshots without `address`:** country falls back to the last part of `headquarters`.
- **Archived companies:** their snapshot is deleted on archive, so with "Show archived" they show the row data only.
- **Paging while rows change:** page offsets can repeat or skip a row when rows are added or archived. De-duplication by id handles repeats. A skipped row comes back on the next refetch after a mutation.
- **Performance:** one extra `PageSnapshot` query per page (at most 50 slugs, on the unique index). The JSON is read in the service, and only the summary is sent.
- **Security:**
  - Everything is scoped to `userId`.
  - Logos go only through `/cdn`.
  - The website opens with `noopener noreferrer` and is limited to http and https (`webLink` at read time).
- **Migration:** adds a nullable column and an index, then fills values from saved reads (answer 2). Owner-typed values are overwritten where a read has a value, as agreed. Safe to re-run. Rollback is a code revert; the column stays, unused.
- **No Docker or CI impact.**

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, plus the linkedInCompany and dataReads integration tests.
- In the browser:
  - Nova Technologies and Du Toit Yacht Design show their logos, names, United States or South Africa with flags, industries, sizes and websites;
  - searching "Nova" finds it;
  - scrolling loads more;
  - the drawer, edit, archive, labels and bulk actions still work.

## Outcome

Shipped (branch `feat/companies-table`):

- **Brain:**
  - `LinkedInCompany.country` plus indexes `(userId, country)` and `(userId, industry)`, in migration `20261101090000_company_country_and_read_backfill`. The migration also backfills from `PageSnapshot`, with the read winning; locally Nova, Du Toit and Cardboard got their names, industries, countries and sizes.
  - `companyRowFrom` and `companyCardOf` (`core/pageSnapshot.ts`).
  - `LinkedInCompanyService.applyRead`, called by the `COMPANY` read store.
  - `list` returns `card` (logo, tagline, employees, followers) and `readAt`, and takes `industries`, `countries` and `sort` (Added, or Name with nulls last).
  - New `facets` (industries and countries with counts).
  - The resolver takes `cursor` and answers `nextCursor` for the infinite query.
- **Body:**
  - `use-companies.ts`: an infinite query, 50 per page, rows de-duplicated by id.
  - `companies-table.tsx` on TanStack Table v9 with virtual rows, sticky header, scroll paging and these columns: logo (through `/cdn`), name and tagline, industry, flag and country, size plus members on LinkedIn, followers, website domain, status, labels, added, last read and visit, and actions.
  - The page has Industry and Country pickers (in the address as repeated `industry` and `country` params), a Columns menu (`companies.hiddenColumns`), sort in the address (`sort=name.asc`), and a count footer in place of the pager.
  - Shared pieces moved to `components/table/`: `SortHeader` (was copied in People and Sessions), `ColumnsMenu` (now takes `columns`) and `useHiddenColumns(key)`.

Deviations: none.

Verified: lint, ts:check, build and unit tests (3,830) pass. The page, dataReads and linkedInCompany integration tests pass, and the migration ran on the test DB and the local DB. Not checked in a browser: the local page needs an authentik sign-in.
