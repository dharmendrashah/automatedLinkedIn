# View a company: open a company page, wait 5 seconds, scroll the whole page

- Status: built, waiting for the live run <!-- draft | locked | in progress | done -->
- Created: 2026-10-24
- Locked by user: yes, 2026-10-24 (every default of the seven open questions accepted: built even though it alerts nobody by name, saved companies and pasted links, one shared cap of 15 a day with the 30 day rule and a 3 minute gap, task `linkedin-view-company` titled "View a company", wait 5 to 6 s, the profile code made generic, branch `feat/view-company-task` on top of `feat/view-profile-task` which was pushed first as PR #93)

## Goal

A second spider task, `linkedin-view-company` (title "View a company"), the same act as "View someone's profile" (`.plan/visit-profile-task.md`) for a company page: open `https://www.linkedin.com/company/<slug>/` as one of the owner's accounts, wait 5 to 6 seconds, scroll to the end, and leave. It reads and changes nothing. Brain gets a "View" action on the owner's saved companies (`/companies`) and a pasted link, under the same limits as profile views.

## Read this before locking: what a company visit does and does not do

For a person's profile, LinkedIn can show the viewer's name in "who viewed your profile". For a company page, LinkedIn shows the page's admins only totals and groups (page views, unique visitors, visitors by job title, industry and company size) in the page's analytics; it does not list who visited. So this task adds to the page's visit numbers and to those groups, and it makes the account look like a visitor; it does not tell anyone that this account visited, so it does not do what the profile visit is for. I could not verify this from here (nothing about a company page's admin view was recorded); it is LinkedIn's documented behaviour as far as I know. If the aim is to get a person's attention, the profile visit does that and this task does not.

## What exists today (checked in code, 2026-10-24)

- Branch `feat/view-profile-task` (committed, not pushed): the spider task `linkedin-view-profile` (`tasks/linkedinViewProfile`: `view.ts`, `answer.ts`, `index.ts`), shared page helpers `linkedin/pages.ts`, the driver fix that scrolls a page's inner container, brain `LinkedInProfileVisit` (table, `ProfileVisitService`, hook `linkedInViewProfile.hooks.ts`, `linkedInProfile.visit`, `visits` on the profile list), and in body the `ViewProfileDialog`, `visit-form.ts` helpers and the optional `onView` action of `RowActions`.
- The owner's saved companies exist: `LinkedInCompany` (`/companies`, link only, soft delete, unique `(userId, slug)`), `core/linkedInUrl.ts` parses `linkedin.com/company/<name>` (`parseLinkedInUrl(raw, 'company')`), and `companies-table.tsx` already uses `RowActions`.
- Not there: any task for a company page, a visit record that knows a company from a person.
- Nothing about a company page's markup has been recorded. Company pages are partly public, so their layout can differ from a profile's (the window may scroll, not a container); the driver now handles both.

## Proposal

### Share, do not copy

The profile task and this one differ only in the address they accept, the paths that count as "a real page", and two sentences. So the code is made shared first, then both tasks are thin:

- **Spider:** `viewProfile` becomes `viewPage(context, baseUrl, address, { landedOn: RegExp, snapshots }, deps)` in `linkedin/viewPage.ts` (open, accept the consent page, check the landed path, wait 5 to 6 s, scroll through, keep the page when asked, `SIGNED_OUT` on a sign-in wall). `answerFor(outcome, noun)` takes the noun ("profile" or "company page"). `linkedin-view-profile` keeps its name, behaviour and tests; `linkedin-view-company` is a second folder `tasks/linkedinViewCompany` with its own input check, verdict labels and registry line.
- **Brain:** the visit record, the service and the hook are made generic by a `kind` (`PROFILE` or `COMPANY`) instead of a second table: the Prisma model is renamed `LinkedInPageVisit` with `@@map("LinkedInProfileVisit")` (the table keeps its name, so the rename is code only), and a migration adds `kind` (default `PROFILE`, so existing rows stay valid) and `companyId` (to `LinkedInCompany`, `SetNull`). `ProfileVisitService` becomes `PageVisitService` with `request(userId, accountId, kind, target, confirmed?)`; the hook file serves both task names through one function.
- **Body:** `ViewProfileDialog` becomes `ViewPageDialog` in `components/links/` taking what differs (noun, link check, the call to make); the profiles page uses it with profile values, the companies page with company values.

### The task `linkedin-view-company` (spider, version 1)

- Input (strict): `companyUrl`, an `https://www.linkedin.com/company/<slug>/` address on LinkedIn's own host, no query, nothing after the name (no `/about/`, `/posts/`, `/jobs/`), plus the `snapshots` flag. Needs an account and a proxy; one at a time per account; 3 minute cooldown; task limit 4 minutes; recording on.
- Steps and rules as for the profile: open through `context.visit`, accept the consent page, count it as a company page only when the landed path starts with `/company/`, `/school/` or `/showcase/` (a company address of a school or a showcase page is sent there by LinkedIn), wait 5 to 6 s, scroll to the end, nothing clicked, nothing read, nothing of the page in a log line.
- Verdicts `DONE` ("Viewed"), `NOT_AVAILABLE` ("Company page not available"), `SIGNED_OUT`, `ERROR`.

### Brain

- **Migration `add_company_visit`** (additive): enum `PageVisitKind` (`PROFILE`, `COMPANY`), `LinkedInProfileVisit.kind` (default `PROFILE`), `companyId` with its foreign key and index. The model is renamed in the Prisma schema with `@@map`; no table is renamed.
- **`PageVisitService.request`:** as for profiles, by kind: the saved company or a pasted link (tied to the saved company of the same slug when there is one), the same slug is refused when this account viewed it (same kind) in the last 30 days, the daily cap counts every visit of the account, profiles and companies together, an account that is not `ACTIVE` is refused. The own-profile rule applies only to profiles.
- **Router:** `linkedInCompany.visit({ accountId, companyId | link, confirmed? })`; the company list returns each company's latest visit.
- **Task hooks:** one hook object for both task names (`linkedin-view-profile`, `linkedin-view-company`), writing the verdict on the visit row.

### Body

- `/companies`: a "View a company" button (a pasted link) and an eye icon on each row, the same dialog with the notice rewritten for a company ("This account will count as a visitor of the page. LinkedIn tells the page's admins how many people visited, not who. This does not alert anyone by name."), and "Viewed 2 days ago by …" under the company.
- Pure helpers with unit tests written first: `isCompanyLink`, and `visitedText` shared.

## Requirements

Confirmed (from your request): another task, "visit company", with the same purpose and the same steps as the profile visit.

Open questions (must be empty before locking; each has a proposed default):

1. **The purpose.** A company page does not tell anyone who visited (see above). Build it anyway, as a way to add to the page's visit numbers and look like a visitor? Default: yes, with the notice above in the dialog so nobody expects an alert.
2. **Which companies.** Saved companies on `/companies` and a pasted link, as for profiles. Default: both.
3. **Limits.** One shared cap of 15 views a day for each account, profiles and companies together; the same company never twice from one account in 30 days; 3 minutes between visits (confirmable); one per click, no bulk. Default: these.
4. **Name.** Task `linkedin-view-company`, title "View a company". Default: yes.
5. **Wait.** 5 to 6 seconds, then scroll to the end. Default: yes.
6. **One code path.** Make the profile code generic (the shared `viewPage`, the `kind` column, one dialog) instead of copying it. Default: yes.
7. **Branch.** `feat/view-profile-task` is not pushed yet. Default: build this on top of it as a new branch `feat/view-company-task`, and push the profile branch first.

## Scope and non-goals

- In scope: the shared spider function and the second task, the migration and the model rename, the generic service and hook, `linkedInCompany.visit`, the dialog and the action on `/companies`, tests, `MEMORY.md`.
- Out of scope: reading anything from a company page, following the company, opening its other tabs (`/about/`, `/jobs/`, `/posts/`), visiting the people who work there, many companies in a row or on a schedule, a workflow block for it, reading page analytics back.

## Approach

- [x] 1. Lock this plan (answer the open questions).
- [x] 2. Branch from `feat/view-profile-task`; spider: extract `linkedin/viewPage.ts` and the noun in `answerFor` with the profile tests passing unchanged.
- [x] 3. Spider task `linkedin-view-company`, tests first: the address check (only `/company/<slug>/`), a company page opens, waits and scrolls to the end, nothing clicked, landed on `/school/` counts, led away is `NOT_AVAILABLE`, sign-in wall, no word of the page in a log line, the 5 to 6 s wait; registry line.
- [x] 4. Migration `add_company_visit` (create-only, check the folder name sorts last, read the SQL, apply locally) and the model rename with `@@map`; rename the code (`linkedInProfileVisit` to `linkedInPageVisit`).
- [x] 5. `PageVisitService` and the shared hook, tests first (each refusal per kind, the shared cap, the 30 day rule per kind, the row saved with the session, verdict to status).
- [x] 6. Router `linkedInCompany.visit` and `visits` on the company list, with resolver tests.
- [x] 7. Body: `ViewPageDialog`, the companies page action and button, helpers with tests first.
- [x] 8. Integration test with Postgres for a company visit (cap shared with profiles, repeat rule per kind, row to status).
- [ ] 9. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, all warnings fixed; one live visit to a company page with `snapshots` and your go-ahead; `MEMORY.md`; plan done.

## Edge cases and risks

- **No alert (the main point above).** The only observable effect is the page's own visit totals, which the owner of this app cannot see either. The dialog says so.
- **Compliance and account risk.** The same as for profiles: one page per click, a daily cap shared with profile views, a gap between visits, a human pace, a proxy, the account's own session, nothing read or changed. Visiting many company pages by automation is still automated activity; the shared cap keeps it small.
- **Company, school and showcase pages.** `/company/<slug>/` can lead to `/school/<slug>/` or `/showcase/<slug>/`; all three count as a page. A company page that is gone or private leads elsewhere (`NOT_AVAILABLE`).
- **Public layout.** A company page may be built differently from a profile (the window may scroll rather than a container). The driver reads whichever scrolls; the real-browser scroll test covers both cases.
- **Logged-out variants.** A company page can show a sign-in prompt over a public page; a real login or checkpoint address ends `SIGNED_OUT`, an overlay on the public page does not (the visit then still counts as made; the live visit with `snapshots` shows what the page does).
- **Slug case.** Saved slugs are lowercase; company slugs are case-insensitive, so this is safe here (unlike `ACoAA...` profile ids).
- **Migration safety.** The rename is `@@map` only; the migration adds columns with defaults, so existing visit rows stay valid. Never reset a database. The new folder name must sort after the existing ones (see MEMORY, Gotchas).
- **Existing profile behaviour.** The generic service keeps every profile rule and message; the profile unit and integration tests must pass unchanged apart from the renamed model.
- **Rollback.** Remove the task line and the action; the extra columns stay unused.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; integration tests with Postgres; the real-browser scroll tests.
- One live visit through the devtools to a company page you name, with `snapshots` on and your go-ahead at that moment, to see what the page is made of and that the scroll reaches the end. State what could not be run (whether the page's admins see anything).

## Outcome

Built on `feat/view-company-task` (steps 1 to 8 done; step 9 waits for a live run and the push). Shipped as planned: spider `linkedin/viewPage.ts` and task `linkedin-view-company`; brain `LinkedInPageVisit` (`kind`, `companyId`, migration `add_company_visit`), `PageVisitService`, one hook for both task names, shared `visitProcedure` for `linkedInProfile.visit` and `linkedInCompany.visit` (input is `id` or `link`, not `profileId`), `visits` on both lists; body `ViewPageDialog` in `components/links/` (with `visit-form.ts`), "View a company" button and row eye on `/companies`, "Viewed ... by ..." under the company.

Deviations: the company notice says LinkedIn may show the page's admins the visit and that the app promises nothing (it does not state "tells the admins how many, not who", which could not be checked). The dialog calls both visit mutations and picks one by kind.

Checks: lint, `ts:check`, unit tests (contracts 167, body 575, brain 1,197, spider 1,022), build, brain integration (157). Two brain integration files (`engine`, `messageImport`) failed on some runs and passed on re-run with no change; they share a database across files. Not run: a live company visit; whether the page's admins see anything.

Follow-ups: one live run of "View someone's profile" after the scroll fix and one "View a company" with `snapshots` on.
