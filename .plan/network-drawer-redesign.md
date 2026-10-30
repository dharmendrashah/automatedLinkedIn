# My network person drawer redesign

- Status: done
- Created: 2026-10-30
- Locked by user: yes, 2026-10-30 (proposal accepted; answers below)

## Goal

Make the person drawer on `/network` read like one clean profile with the actions at the top. Right now the name and headline appear twice, the actions are scattered, and labels are hidden behind a "+". A profile read should also bring every company the person worked at into `/companies`, and each company should open its details there.

## Requirements

Owner's request (2026-10-30), to ship in PR #145 (`feat/network-profile-badges`):

1. Redesign the drawer and make it much better (layout below, to confirm).
2. Show the person's labels, not only a "+".
3. A profile read saves every company in the person's experience to `/companies`, not only the current one.
4. A company in the drawer's Experience opens `/companies` in a new tab with that company's drawer open (`/companies?company=<slug>`, which the page already supports), when the company has a LinkedIn link.
5. An "Open chat" button that opens the chat in a new tab, using the same rule as the row's Message button.
6. A Phone button and an Email button, both disabled, "Coming soon".

Proposed layout (to confirm):

- **Top bar:** Previous / "10 of 50" / Next on the right, as now.
- **Identity card** (one, replacing the header and the Profile tab's top card):
   - the cover strip (the real cover when the read has one), the photo and the name;
   - the badges (Premium, Verified, Creator, country, Open to work, Hiring, Do not contact);
   - the headline, "Title at Company" and the place, followers and connections line;
   - the reason line and "Also found by".
- **Action row** under the card:
   - Open chat (primary; Invite when not connected, disabled with the reason otherwise);
   - Open on LinkedIn, Read / Read again with the price;
   - Email and Phone, disabled, "Coming soon".
- **Work row:**
   - the Status select and the labels as chips with add and remove (`LabelCell`);
   - Do not contact as a toggle;
   - "Do not contact for all clients" and Erase moved into a "More" menu, so a destructive action is not one stray click away.
- **Notes**, as now.
- **Tabs:** Profile (default when the person was read, else Chat), Chat, History.
   - The Profile tab holds no second name card: Your accounts, Experience (company names link to `/companies`), Education, Skills.
   - The Profile tab keeps its current "Read the profile" prompt when there is no read.

Answers (owner, 2026-10-30):

- The layout above as proposed.
- Companies saved from a read get the label "From profiles" (only when they are created; a company already saved keeps its labels).
- Reads already stored are added to `/companies` once, by an additive data migration (SQL, `ON CONFLICT DO NOTHING`), free.
- The drawer opens on Profile when the person was read, else Chat.
- A company without a LinkedIn link stays plain text.

Open questions: none.

## Scope and non-goals

- In scope:
   - the person drawer on `/network` (`person-drawer.tsx`);
   - the shared `PersonView` sections it shows: Experience links also work in the other detail drawers, because they use the same component;
   - `dataReads.ts` and `LinkedInCompanyService.saveFound` (many companies);
   - tests.
- Out of scope:
   - email and phone data (only the disabled buttons);
   - the company drawer itself;
   - the row (already changed in this PR);
   - mobile-specific layouts beyond wrapping.

## Approach

- [ ] Brain: `profileFacts` (or a new `companiesOf(snapshot)`) lists every position's company slug and name, deduplicated. `saveFound` takes a list: one `createMany` with `skipDuplicates`, and names filled where empty. Unit and integration tests first.
- [ ] Brain: (if confirmed) the one-off backfill of stored reads.
- [ ] Body: `Experience` gets the company link (`/companies?company=<slug>`, new tab) when the position has `companyUrl`.
- [ ] Body: drawer layout as confirmed. Merge the drawer header and `PersonView`'s top card through a `compact`/`inDrawer` option, or by splitting `PersonView` into its card and its sections, without duplicating code. Add Open chat, Email and Phone (reusing `messageAction`), labels as chips, and the More menu.
- [ ] Definition of done, `MEMORY.md`, the plan's Outcome.

## Edge cases and risks

- A person with no read: the identity card falls back to what the row knows (name, headline, photo); the badges are empty; the Profile tab shows the read prompt.
- Do not contact: Open chat still opens an existing conversation (reading is allowed), never starts one; Invite is hidden.
- Not connected and invites off or already sent: Open chat is disabled with the reason, as on the row.
- Many companies:
   - one read adds at most 15;
   - duplicates within a read, or with companies already saved, are skipped;
   - an archived company stays archived;
   - a name is set only where none was.
- A position link that is not a LinkedIn company link is already dropped by `snapshotFrom`; a numeric slug (`/company/15112477/`, as schools sometimes have) is still a valid company page.
- The `/companies?company=` drawer only shows the owner's own companies; after this change every linked company of a read is saved, so the link works. For older reads without links there is no link.
- A new tab keeps the owner signed in (same origin).
- The same `PersonView` is used on `/profiles` and lists: the changes there must not break their drawers (Experience links are fine everywhere).
- No migration unless the backfill is confirmed; a backfill job must be idempotent (`skipDuplicates`).

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, Prettier, and the `dataReads` integration test.
- On staging after deploy:
   - open a read person and check the layout;
   - read again and see the past companies in `/companies`;
   - click one to open its drawer.

## Outcome

Built on `feat/network-profile-badges` (PR #145), 2026-10-31:

- Brain:
   - `companiesOf(snapshot)` lists every LinkedIn company of a read once, newest first;
   - `LinkedInCompanyService.saveFound` takes the list and labels new companies "From profiles" (`FOUND_ON_PROFILES`);
   - migration `20261031100000_add_companies_from_profile_reads` adds the companies of reads already stored (SQL, `ON CONFLICT DO NOTHING`; slugs with escaped characters skipped).
- Body:
   - the drawer is one `ProfileCard` (from `person-view.tsx`, now split into `ProfileCard` and `ProfileDetails`, with `usePersonDetail` in `use-person-detail.ts`);
   - its actions: Open chat in a new tab (the row's `messageAction`), Invite, Email and Phone "Coming soon", Open on LinkedIn, Read;
   - a work bar: status, fit, labels, Reply/Accept/Ignore, Do not contact, and a More menu with "Do not contact for all clients" and Erase (confirmed);
   - notes, then Profile / Chat / History, opening on Profile when the person was read (`paneFor`);
   - Experience links each company to `/companies?company=<slug>` in a new tab (`company-page.ts`).
- Checks: lint, type check, build, unit tests (contracts 229, body 881, spider 1353, brain 1587), the data reads, company and people integration tests, and the backfill's selection checked on sample rows. Not seen in a browser.
- Deviation: the drawer's Invite step button moved into the card's actions (Open chat becomes Invite for someone not connected), so it is not shown twice.
