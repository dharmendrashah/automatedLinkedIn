# Companies: import from CSV, bulk read and bulk label

- Status: done
- Created: 2026-11-01
- Locked by user: yes, 2026-11-01

## Goal

On `/companies`, "Add companies" also takes a CSV file, shows what will be added, and can read the companies' details at once. The table gains a bulk "Read" for picked rows next to the existing bulk labels, so a list of hundreds of target companies can be loaded, filled in and sorted in one sitting.

## What exists today (checked in code, 2026-11-01)

- **Add companies** (`add-companies-dialog.tsx`) is the shared `PasteLinksDialog`: a textarea (up to 200 links) and "Labels for everything you add". `linkedInCompany.create({ urls, labels })` → `LinkedInCompanyService.addMany`: new ones get the labels, ones already here get the labels added, archived ones are restored. Answers `{ added, skipped, restored, invalid }`. Nothing is read.
- **Company read** is per company only: the drawer's Read button → `companyPage.readFull` → `CompanyPageService.readFull` → `DataReadService.queue` (refused when reads are paused by the wallet floor, or the company was already read today; a double click returns the queued read). $0.004 per read (`PRICE_MICROS.companyPage`). The worker fills name, industry, website, size, location, country, logo and tagline (`applyRead`).
- **Bulk bar** (`LinkBulkBar`) on `/companies`: Add labels / Remove labels for the picked rows (`linkedInCompany.labelMany`, up to 200 ids). No bulk read, no bulk archive wired on this page.
- **CSV import exists for My network people** (`.plan/network-import-people.md`): `my-network/import-csv.ts` (own RFC 4180 parser, BOM, `,` or `;`, quoted cells, formula cells kept as text, 2 MB, 1,000 rows, `profile_url,labels,notes`, example file), a two-step dialog (choose → review with ticks → import in batches of 200 with a progress bar → result line), and "Read their profile details now" ticked by default. `PersonService.readUnnamed` is the pattern for "queue many reads, count the refused ones".

## Requirements

Confirmed (from the request):

- Companies can be imported from a CSV on `/companies`.
- Bulk read of companies.
- Bulk label of companies.

Locked after the persona review (owner, 2026-11-01):

1. **Columns:** `company_url` (required), `labels` and `notes` (optional), header in any order; a links-only file with no header works too. Header aliases accepted for the link column: `company_url`, `linkedin_url`, `linkedin url`, `company linkedin url`, `url` (case and spaces/underscores ignored). 2 MB, 1,000 companies per import.
2. **Dialog step 1:** tabs "Paste links" | "Upload CSV", "Download example CSV" (one filled row, one links-only row). "Labels for everything you add" stays, pre-filled with an import label `import-2026-11-01` the owner can remove.
3. **Dialog step 2, review:** every company with a tick and its state: **New** (ticked), **Already here** (ticked; labels and notes only), **Archived** (ticked; restored), **Not a company link** (skipped, with the file's row text, and "Download skipped rows" as CSV).
4. **Read at import:** "Read their company details now", ticked by default, reads **new and archived-restored companies only**; a second box "Also re-read companies already here" is unticked. The cost line counts only reads that will really be charged: "About $1.20 for 300 companies (12 read in the last 30 days are skipped)."
5. **Bulk Read** on the `/companies` bulk bar for the picked rows (up to 200): a confirm with the same cost line, then a toast that splits the counts: "Reading 34. 3 were read in the last 30 days. 2 not read: your balance is low."
6. **Bulk label:** the existing bulk bar (picked rows) plus labels at import (CSV column, the picker). A company that would pass 20 labels keeps the first 20; the result names how many companies lost labels.
7. **After import:** the dialog's result has "Show these companies", which filters the table by the import label.
8. CSV notes are appended to existing notes; a note already present is not appended again.
9. **Skip window:** import and bulk reads skip a company with a paid read in the last 30 days. The drawer's Read keeps the "today" rule.
10.   **Billing:** company reads stay booked to no client, as today.
11.   **Worker fairness:** accepted for now; a 1,000-read import can delay other users' reads by minutes (noted in `MEMORY.md`).
12.   **Bulk scope:** picked rows only, up to 200. **Pages:** `/companies` only; the CSV parser is made shared.

Open questions (must be empty before locking):

- None. (Owner answered "yes" to the 30-day question; read as taking the 30-day window.)

## Scope and non-goals

- In scope: the CSV parser made shared, the two-step Add companies dialog, a brain import mutation with labels, notes and reads, a bulk Read on the companies table, tests.
- Out of scope: Excel files; parsing in brain; reading companies through a LinkedIn account (spider visit); scheduled re-reads; a price/billing change; other pages unless question 7 says so.

## Approach

Brain (`apps/brain`):

- [x] `DataReadService.paidSince(userId, kind, slugs, since)`: the slugs with a paid read since then.
- [x] `LinkedInCompanyService.preview(userId, urls)` (read only, up to 1,000): each company's state `NEW | ALREADY_HERE | ARCHIVED`, `readRecently` (paid read in 30 days), the inputs that named it, and the invalid entries as given.
- [x] `LinkedInCompanyService.importMany(userId, rows: { url, labels, notes }[], labels)`: `addMany`, then per-row labels (merged with the shared ones, `LABEL_LIMIT`) and appended notes; answers counts, `full` and the `fresh` slugs (new or restored); idempotent.
- [x] `CompanyPageService.readMany(userId, where)`: one query for the owned, non-archived companies, skip those with a paid read in 30 days, `DataReadService.queue` the rest (shared with `readFull`). Answers `{ reading, readRecently, paused }`.
- [x] tRPC `linkedInCompany.preview`, `linkedInCompany.import` (`{ companies ≤200, labels, read: 'NONE' | 'NEW' | 'ALL' }`), `linkedInCompany.readMany({ ids ≤200 })`. `create` removed (only the dialog called it). No estimate procedure: the cost line uses `readRecently` from preview and the rows' `readAt` on the table.
- [x] Integration tests: preview states; import with labels, notes and read; re-import is idempotent; readMany skips recent reads. Resolver unit tests for limits.

Body (`apps/body`):

- [x] Move the parser to `components/links/import-csv.ts`, parameterised by the url column (`profile_url` | `company_url`); My network imports it from there. Unit tests move with it plus a company case.
- [x] `AddCompaniesDialog`: two steps (choose: paste or CSV, labels picker; review: ticks, states, Select all/none, read option and cost line; import in batches of 200 with progress; result line). Reuse the people dialog's review pieces where they fit; do not fork them.
- [x] Bulk bar: `LinkBulkBar` gets an optional `readMany` action (only `/companies` passes it), confirm with cost, toast with `reading`/`notRead`.
- [ ] Rows fill in as reads land (not checked in a browser; see Outcome).

Wrap-up:

- [x] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; brain integration tests against local Postgres.
- [x] `MEMORY.md` entry and changelog line; plan `done` with Outcome.

## Edge cases and risks

- **Input:** empty file, no `company_url` column, over 2 MB or 1,000 rows → a clear message, nothing sent. BOM, `;` delimiter, quoted cells with commas or new lines handled. Formula cells (`=`, `+`, `-`, `@`) stay text and brain validates every link (`parseLinkedInUrl(…, 'company')`). Profile or post links in a company file show as "Not a company link". `/company/<id>/` numeric links and `/showcase/` pages: check what `parseLinkedInUrl` accepts today and keep that rule.
- **Labels:** over 20 labels (`LABEL_MAX`) per company after merging → capped, the rest dropped and counted in the result; labels are lower-cased by the existing rule.
- **Re-import:** same file twice adds nothing twice, appends no note twice, reads nothing read today.
- **Partial failure:** batches go one after another; on a failed batch the result says how many were added before it, and Import again is safe.
- **Reads and spend:** 1,000 reads ≈ $4. Wallet floor refuses with the existing sentence and is counted as not read. The worker takes 20 due reads per tick, so 1,000 reads fill in over minutes; the dialog can close. Double clicks on bulk Read do not double-charge (one active read per company, `activeKey`).
- **Concurrency:** two tabs importing the same file: `skipDuplicates` and the active-read key keep it single.
- **Security:** the file is read in the browser only; brain caps counts and validates every link, label and note; owner-scoped procedures only.
- **Data and migration:** none expected (existing columns). Rollback is a code revert.
- **Compliance:** reads go through the paid data reader, not the owner's LinkedIn account; no change to account rate limits.

## Persona review (2026-11-01)

| Reviewer       | Wants most                                                                                                                         | Cut                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| GTM Engineer   | header aliases (`linkedin_url`); an import label to find the set; honest cost line; download skipped rows                          | note de-dup; other pages                         |
| Agency Owner   | cost line counting only charged reads, then what was charged; 30-day skip; split "not read" reasons; reads on the client statement | re-reading Already here; filter-wide actions     |
| Founder        | cost before every paid click; "balance is low" instead of "reads paused"; see bad rows; filled example; land on the imported set   | tabs (one drop-or-paste box)                     |
| Platform Admin | book reads to a client; per-user fairness in the read worker; daily cap per client; lean `readMany`                                | `name`/`website`/`industry` columns; other pages |

Taken into the proposal: aliases, import label and "Show these companies", charged-only cost line, split counts with plain wording, skipped rows download, new-only reads by default, lean `readMany`. Left as open questions: 30-day skip, client booking, worker fairness. Not taken: one combined box instead of tabs (the people dialog uses tabs; keep them consistent), a daily cap per client (no client on companies yet; revisit with question 3).

## Verification

- Unit: parser (header order, links-only file, BOM, quotes, delimiters, formula cells, limits, `company_url`), review states and selection, resolver limits.
- Integration: preview, import, readMany as above.
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Staging: download the example, import it with read on, watch rows fill in; pick 5 rows, Read, see the toast; bulk label them.

## Outcome

- Shipped (branch `feat/companies-import-csv`):
   - brain: `DataReadService.paidSince`; `LinkedInCompanyService.preview` and `importMany`; `CompanyPageService.readRecently` and `readMany` (`readFull` shares its queue call); tRPC `linkedInCompany.preview`, `import`, `readMany`; `create` removed. `importedOf`, `appendNote`, `IMPORT_BATCH`, `IMPORT_CAP` moved from `people.service.ts` to `linkedInRecord.ts` and shared by people and companies (`importedOf` now returns the invalid entries, people count them). Integration test `companiesImport.integration.test.ts`; resolver unit tests.
   - body: shared parser `components/links/import-csv.ts` (`CsvKind`, `PROFILE_CSV`, `COMPANY_CSV` with header aliases, `entriesOf`, `skippedCsv`), the two-step `AddCompaniesDialog` (paste or CSV, import label, review with states and a "Read in the last 30 days" badge, skipped rows download, read options and cost line, batches with progress, "Show these companies"), `ReadManyButton` in the bulk bar (`LinkBulkBar` takes children), `read-cost.ts` with tests.
- Deviations: no estimate procedure (the cost line uses preview's `readRecently` and the table's `readAt`, which is the latest snapshot, so it can differ slightly from paid reads); the label limit is 20, not 10; a refused read says "reads are paused for a short while" rather than "your balance is low", because the floor is the shared wallet, not the user's balance; the people dialog was not refactored onto shared review pieces (only the parser is shared).
- Verified: `pnpm lint`, `ts:check`, `test:unit:run` (1,604), `build` (no chunk warning), brain integration tests for companies, pages, people import and filters against local Postgres.
- Follow-up (owner, after a first look): the read options also show on the first step (same choice; the price shows on review), and the import label uses the owner's local date (it was UTC, so late evening in India gave yesterday's date).
- Not run: the dialog and the bulk Read in a browser (sign-in needed), whether queued reads show as reading in the table, the staging check from Verification.
