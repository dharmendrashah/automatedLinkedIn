# Company drawer: everything the company read returns, with a banner

- Status: done
- Created: 2026-10-31
- Locked by user: yes, 2026-10-31

## Goal

The company drawer shows only part of what a company read returns. Redesign it so the owner sees everything useful about the company in one place:

- the founding year, employee numbers, the full address with postal code, and the website (opening in a new tab);
- every employee breakdown with its counts: skills, schools, functions, locations, fields of study and service categories;
- the industry and its category.

The read has no cover image, so the drawer shows no banner (answer 1).

## What exists today (checked in code, 2026-10-31)

- **Drawer:** `apps/body/src/components/companies/company-view.tsx`.
  - The `Header` is a `Cover` gradient with the logo `Picture`, the name and verified mark, the tagline, and one facts line (industry · range · HQ · followers).
  - Its buttons are Open on LinkedIn, Website and Read again.
  - The sections are About, Overview (founded and specialities), Their people (`Bars` for departments, locations and skills), Your people there, and In your workspace.
- **Stored shape:** `companySnapshotFrom` in `apps/brain/src/core/pageSnapshot.ts` turns the supplier row into `CompanySnapshotData`, which is kept as `PageSnapshot.data`. The raw row is **not** kept. Anything not picked there is lost.
- **Fields dropped today:** `hqStreet`, `hqPostalCode`, `locations[]`, `industryCategory`, `jobsUrl`, `ctaUrl`, `activeStatus`, `pageType`, `employeesBySchool`, `employeesByFieldOfStudy` and `employeesByServiceCategory`. The ids (`companyId`, `companySlug`) are dropped on purpose.
- **Breakdowns are cut to 8.** The supplier sends up to 15 skills and 10 locations.
- **The website is dropped when it is `http://`.** `httpsLink` keeps https addresses only. That is why Du Toit Yacht Design (`http://dutoityachtdesign.co.za/`) shows no Website button.
- **Banner:** the supplier row has **no cover or banner image** (checked against run `8030b9b2`). `Cover` already draws an image when it is given one, and otherwise falls back to the gradient.
- **Old snapshots:** `readCompanySnapshot` parses `PageSnapshot.data` with `companySchema.safeParse`. If a new field were required, every stored snapshot would parse to `null` and its drawer would go empty.

## Requirements

Confirmed (from the request):

- Show as much as the read returns:
  - founded year, employee count and range, postal code (the full address);
  - the website link, opening in a new tab;
  - industry and industry category;
  - employees by skill, school, function, location, field of study and service category, each with counts.
- Banner: none, since the read has none (answer 1).
- Redesign the drawer.

Open questions: none. Answered 2026-10-31:

1. Banner: the read has no cover image, so **no banner is shown**. The header drops the gradient strip and starts with the logo and the name.
2. Old reads: show the "Read again to see more" hint.
3. Breakdowns: top 5, then "Show all N".
4. Extra links: both Jobs and the call-to-action link (when it differs from the website).
5. http websites: allowed (http and https only, new tab).

The questions as they were asked:

1. **Banner:** the read has no cover image. Pick one:
   - **(a)** a designed banner with no new data: a gradient tinted from the industry plus the logo, as today but richer;
   - **(b)** the company's real LinkedIn cover, which needs a new spider step that reads the page with an account (a separate plan and a slower, account-using read).

   Recommended: (a) now, (b) later.
2. **Existing reads:** companies read before this change keep the old fields until Read again, which is a paid read. Is it OK to show the new sections only after the next read, with a small "Read again to see more" hint?
3. **How many per breakdown:** keep everything the read returns (up to 15) and show the top 5 per list with "Show all"? Or show all of them always?
4. **Extra links:** also show Jobs (`jobsUrl`, on LinkedIn) and the page's call-to-action link (`ctaUrl`, when it differs from the website)?
5. **Website over http:** allow `http://` websites (opened in a new tab, `noopener noreferrer`, http and https schemes only)? Recommended: yes.

## Design (proposed)

### Data (brain, `pageSnapshot.ts`)

`CompanySnapshotData` gains these fields. Each new field has a schema `.default(...)` so old snapshots still parse:

- `industryCategory: string | null`.
- `address: { street, city, state, postalCode, country } | null`, from the `hq*` fields. `headquarters` stays for the facts line and the list pages.
- `locations: Array<{ street, city, state, postalCode, country }>` (max 10), the offices.
- `website` keeps http and https. A new `webLink` helper accepts only those two schemes.
- `jobsUrl` (https on `linkedin.com` only) and `ctaUrl` (http or https), if question 4 is yes.
- `active: boolean | null` (from `activeStatus`) and `showcase: boolean` (`pageType !== 'COMPANY'`). These only show a small badge when they are unusual.
- New breakdowns `bySchool`, `byFieldOfStudy` and `byServiceCategory`. Every breakdown cap goes from 8 to 15.

### Drawer (body, `companies/company-view.tsx`, split into small files under `companies/company/`)

1. **Banner header:**
   - No banner (question 1): a plain card with the logo, the name, the verified mark, and "Inactive" or "Showcase page" badges when they apply.
   - The tagline.
   - Buttons: Open on LinkedIn, Website (domain shown, new tab), Jobs, and Read again with the read date.
2. **Key facts grid** (icon, label, value; two columns, one on narrow screens):
   - Industry (and its category when it differs), Founded;
   - Company size (range), Employees on LinkedIn (count);
   - Followers, Website (link, new tab);
   - Headquarters (street, city, state, postal code, country).

   A fact with no value is not shown.
3. **About:** the full description with Show more (`About`, as today).
4. **Specialities:** chips.
5. **Offices:** every location as an address line, when there is more than the headquarters.
6. **Their people:** one card per breakdown, each with its own icon: Departments (function), Skills, Locations, Schools, Fields of study, Service categories. Each card has bars with counts (`Bars`), showing the top 5 with "Show all N" (question 3). Empty breakdowns are hidden.
7. **Your people there**, and **In your workspace**: unchanged.
8. **No snapshot yet:** the existing dashed "show after Read company page" note.
9. **Old snapshot:** a one-line "Read again to see skills, schools and more" hint when the new fields are missing (question 2).

## Scope and non-goals

- In scope: the snapshot fields, schema defaults, `webLink`, breakdown caps, the drawer redesign, and tests.
- Out of scope:
  - a spider cover read (question 1b);
  - storing the raw supplier row;
  - re-reading old companies automatically, since that costs money;
  - the company list page columns.

## Approach

- [ ] Test first: in `pageSnapshot.unit.test.ts`, the new fields from the run `8030b9b2` row, an http website kept, `javascript:` and other schemes dropped, caps of 15, and an old snapshot without the new fields still parsing.
- [ ] Brain: `snapshotFields.webLink`, and the `companySchema` and `companySnapshotFrom` additions with defaults.
- [ ] Body: the header, the facts grid, offices and the breakdown cards. Reuse `Cover`, `Picture`, `Section`, `About` and `Bars` (moved to its own file with "Show all").
- [ ] Body unit test for the pure parts (the facts list, the address text).
- [ ] Checks, a manual look at the drawer with the Du Toit Yacht Design read, the plan Outcome and `MEMORY.md`.

## Edge cases and risks

- **Old snapshots:** the new fields default (`null` or `[]`), so `safeParse` still passes and the drawer shows what it has, plus the hint.
- **Links:**
  - The website and `ctaUrl` must parse as URLs with an `http:` or `https:` scheme; anything else is dropped.
  - All links open in a new tab with `rel="noreferrer noopener"`.
  - `jobsUrl` must be https on `www.linkedin.com`.
- **Text sizes:** every text goes through `text(value, max)`. The cap is 100 for breakdown labels and 300 for address parts.
- **Empty or partial reads:** each fact, section and card hides when it has no value, so there are no empty headings.
- **Privacy:** these are aggregate counts about the company plus its business address, with no person data. The ids are still dropped.
- **Layout:** long labels truncate with the full text on hover, and the drawer stays usable at the smallest drawer width.
- **No migration:** `PageSnapshot.data` is JSON, so there is no schema change. Rollback is a code revert, and the extra stored fields are ignored by old code.
- **Docker and CI:** no impact.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- In the browser:
  - Read Du Toit Yacht Design again. The Website button opens `dutoityachtdesign.co.za` in a new tab, and the postal code 7441, founded 2001, 12 employees and 2–10 show.
  - All six breakdowns show with their counts.
  - An older company still opens with its old sections and the hint.

## Outcome

Shipped (branch `feat/company-drawer`):

- Brain (`core/pageSnapshot.ts`, `core/snapshotFields.ts`): `industryCategory`, `address`, `locations` (max 10), `jobsUrl` (`linkedInLink`, https on linkedin.com), `ctaUrl` (null when it is the website), `active`, `showcase`, `bySchool`, `byFieldOfStudy` and `byServiceCategory`. Breakdowns are capped at 15. `website` now keeps http too (`webLink`, http or https). `detailed: true` marks a full read. Every new field has a schema default, so old snapshots parse with `detailed: false`.
- Body (`companies/company/`): `facts.ts` (the key facts, address text and domain; unit tested), `key-facts.tsx` (the facts grid and Offices) and `breakdowns.tsx` (six cards, top 5 then "Show all N"). `company-view.tsx` has a header with no banner and the Website (domain), Jobs and call-to-action buttons, plus the "Read again to see…" hint on an old snapshot. Overview became Key facts plus Specialities.

Deviations: none. Not checked in a browser: the local page needs an authentik sign-in.
