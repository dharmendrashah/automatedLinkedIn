# Company drawer on top of a person drawer

- Status: done
- Created: 2026-11-01
- Locked by user: yes, 2026-11-01 ("plan this first, find edge cases and continue"; the request settles the scope)

## Goal

In a person drawer (My network, and every page that opens one), clicking a company of their Experience opens that company in a second drawer on top, exactly the `/companies` company drawer. Closing it returns to the person.

## What exists today (checked in code, 2026-11-01)

- `people/person-sections.tsx` `Experience` shows a briefcase icon and the company name per position. When the read gave the position a LinkedIn company link (`companyUrl`, reads since 2026-10-31), the name is a link that opens `/companies?company=<slug>` in a **new tab** (`companyPageOf`). The icon does nothing.
- The person drawer is `PersonDrawer` on `/network` and `DetailDrawers` (`PersonBySlug`) on `/companies`, `/posts` and Unibox. `ProfileDetails` (with `Experience`) renders inside both.
- `CompanyView` (the `/companies` drawer body) works by slug for any company in the owner's `/companies`, archived ones included. A profile read saves every LinkedIn company of the experience to `/companies` (`companiesOf` + `saveFound`, label "From profiles").

## Requirements

- Clicking the company (its icon or its name) of an Experience entry opens the company drawer on top of the person drawer, the same view as on `/companies`.
- Closing it (X, Esc, outside, Back) shows the person drawer again, unchanged.

## Approach

- [x] `components/details/use-detail-stack.ts`: a context with `open(ref)`; null outside the provider.
- [x] `components/details/detail-stack.tsx`: `DetailStackProvider` in `DashboardLayout`; a stack of `{ kind: 'company' | 'person', slug }` shown in its own right drawer above everything. Company shows `CompanyView` (a person in it is pushed onto the stack and shown with `PersonBySlug`), Back pops, closing clears the stack, a page change clears it.
- [x] `Experience`: the icon and the name become one button when the position has a company link and a stack is there; otherwise the name stays plain text. `companyPageOf` becomes `companySlugOf` (the new-tab link goes; the drawer has Open on LinkedIn).
- [x] Tests: `companySlugOf` unit test; lint, types, unit tests, build.

## Edge cases and risks

- **Old reads** (before 2026-10-31) have no company link: the name stays plain text, nothing to click. Read the profile again to get links.
- **Company not in `/companies`** (deleted from the database, or saved before reads saved companies): the drawer shows the existing "Company not found in your companies" message; no new add flow (out of scope).
- **Archived company:** opens as archived, as on `/companies` (Restore is there).
- **Layering:** the stacked drawer is a separate Radix/vaul layer rendered later, so it sits on top; Esc and an outside click close only it. Its own dialogs (Read confirm, edit, labels) stack above it.
- **Person inside the company:** clicking someone in "Your people there" pushes them on the stack ("Back to the company"); closing the stack returns to the original person, whose drawer never changed.
- **Page change** with the stack open clears it, so it never shows over another page.
- **Shared data:** changes made in the stacked company (labels, status, read) use the same queries, so the `/companies` table and the person's drawer refresh as they do today.
- **Paid read:** "Read company page" in the stacked drawer is the same paid action with the same confirm.
- **Mobile / narrow screens:** same width as the person drawer, covering it; Back is at the top.
- **Rollback:** body-only change; revert the commit.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Staging: on `/network`, open Gregor Lederer, Profile, click "Du Toit Yacht Design" in Experience: the company drawer opens on top; Esc returns to Gregor.

## Outcome

- Shipped (branch `feat/company-drawer-from-person`): `DetailStackProvider` in `DashboardLayout` (stack kept with the page path, so another page starts empty, no effect needed), `useDetailStack`, clickable icon and name in `Experience`, `companySlugOf` (was `companyPageOf`; the new-tab link to `/companies` is gone).
- Works wherever a person drawer shows `ProfileDetails`: `/network`, and `PersonBySlug` on `/companies`, `/posts` and Unibox.
- Verified: lint, ts:check, unit tests (with `DATABASE_URL` unset), build.
- Not run: the drawers in a browser (sign-in needed); the vaul layering of two independent drawers is untested by hand.
