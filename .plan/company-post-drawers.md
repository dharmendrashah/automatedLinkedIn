# Company and post drawers

- Status: done
- Created: 2026-10-18
- Locked by user: yes, 2026-10-18

## Goal

Bring the profile drawer (`.plan/profile-drawer.md`) to /companies and /posts. Clicking a company or a post opens a side drawer laid out like its LinkedIn page, so a lead generator can judge it without leaving the table.

## Today (checked in the code and with the data service's public schemas, free)

- **/companies (`LinkedInCompany`):**
   - Fields filled in by hand: name, industry, website, size, location, notes, tags, status (New / Contacted / Replied), archive.
   - The row name links out to LinkedIn.
   - No lookup by slug.
- **/posts (`LinkedInPost`):**
   - Only the link (slug, url, expanded url), status (Unprocessed / Processed) and archive.
   - The row shows the URL.
   - No lookup by slug.
- **Links between the tables:**
   - A list member's `postUrl` and `signals[].via` point to the post that surfaced them. No query finds members by post yet.
   - A list member's `company` is text only; there is no link to `LinkedInCompany`.
- **The data service offers matching reads:**
   - **Companies** (about $0.004 per company). Logo, name, tagline, description, website, founded year, employee count and range, followers, industry, HQ address, locations, specialities, verified flag, jobs page, and employee breakdowns by location, school, function and skill.
   - **Posts** (about $0.002 per post). Text, author (name, link, avatar, headline, followers, type), reactions, comments, shares, posted date, repost note, article link, media link and type, mentions.
- **Reusable from the profile drawer:** the drawer shell (`floatingDrawer`, Previous/Next, `?person=`), the paid-read pattern (one read a day, ledger row with no workflow, refused below the wallet floor, nothing booked when nothing was paid), and allow-listed snapshots with retention.

## Proposal

### Company drawer (`?company=<slug>`)

1. **Header like a LinkedIn company page:**
   - Cover, logo (initials if missing), name, tagline.
   - Industry, employee range, HQ city and country, followers.
   - Website and "Open on LinkedIn".
   - Verified badge.
   - "Read company page · about $0.004" / "Read again".
2. **About:** the description, with founded year and specialities as chips.
3. **People breakdown** (after a read): the top functions, locations and skills of the employees as small bar lists. This helps judge "do they have a sales team, are they in my region".
4. **Your people there:** list members whose company name matches the company name (case-insensitive), each opening the person drawer. It shows who you already found at this account.
5. **In your workspace:**
   - Status, tags, notes, archive or restore.
   - "Find people here": a link to start a new workflow from the "Who works at my target accounts" template.

### Post drawer (`?post=<slug>`)

1. **Author card:** avatar, name, headline, followers. It opens the person drawer when the author is in your workspace, and LinkedIn otherwise.
2. **The post:** text (show more), media or article link, posted date, and reactions, comments and shares counts. An "Open on LinkedIn" link is always there.
3. **People found from this post:** list members whose `postUrl` or a signal points to this post, with state, score and the comment excerpt. Each opens the person drawer.
4. **In your workspace:** Processed / Unprocessed, archive or restore, "Read post · about $0.002" / "Read again".

### Data (additive migration)

- New `PageSnapshot` table (owner, kind COMPANY or POST, slug, allow-listed JSON, fetchedAt). It is unique per owner, kind and slug, so a company slug and a person slug can never clash.
- `WorkflowListMember.postUrl` gets an index for "found from this post".
- New `company.detail` and `post.detail` queries, plus `readFull` for each, owner-scoped like `person.*`.

## Requirements

Confirmed:

- The same drawer experience on /companies and /posts as on /profiles and lists.
- Answered by the owner on 2026-10-18 (all as proposed):
   - **Paid reads:** "Read company page" (about $0.004) and "Read post" (about $0.002) work like the person read, once a day per item. They show on the statement as "Company reads" and "Post reads", are kept while the item is in /companies or /posts, and are deleted when it is archived.
   - **Company drawer:** employee breakdowns, "Your people there" (exact, case-insensitive company-name match), and "Find people here".
   - **Post drawer:** "People found from this post", and the author opens their person drawer when the author is in the workspace.
   - **Images:** logo, media and avatar links are stored with the snapshot.
   - **Drawer to drawer:** one drawer at a time; a person opened from a company or post drawer replaces it and shows "Back".
- **Statement labels:** a nullable `label` column on `SpendLedger` names reads that have no workflow. Rows from the person read before this change count as "Profile reads".

Open questions: none.

## Superseded questions (kept for the record)

1. **Paid reads:** use the same model as people? Proposed:
   - "Read company page" (about $0.004) and "Read post" (about $0.002) on click, once a day per item.
   - Shown on the statement as "Company reads" and "Post reads".
   - Kept while the company or post is in /companies or /posts, and deleted when archived.
2. **Company drawer:** show the employee breakdowns (function, location, skill) and "Your people there", matched by company name?
3. **Post drawer:** show "People found from this post" and open their person drawer from there?
4. **Images:** store the logo, post media and author avatar links with the snapshot, as with the person photo?
5. **Drawers opening other drawers:** when a person is clicked inside a company or post drawer, should the person drawer replace it (proposed: one drawer at a time, with a "Back" link)?

## Scope and non-goals

- In scope:
   - The two drawers.
   - Clickable names on both tables.
   - URL state.
   - Previous/Next.
   - Paid reads and snapshots with retention.
   - The links to the person drawer.
   - Tests.
- Out of scope:
   - Editing company fields from the read (no auto-fill of the hand-filled fields unless asked).
   - Reading a post's comments or reactions from the drawer (a workflow does that).
   - Company search.

## Approach

- [x] 1. Lock this plan.
- [x] 2. Brain:
   - Pure allow-list mappers `companySnapshotFrom` and `postSnapshotFrom` (unit tests first).
   - `PageSnapshot` model, migration and `postUrl` index.
   - `CompanyService.detail` / `readFull` and `PostService.detail` / `readFull`, sharing one "paid read" helper with `PersonService`. The person read moves onto it, with no change in behaviour.
   - Retention and archive cleanup.
   - tRPC `company` and `post` routers.
   - Integration tests.
- [x] 3. Body:
   - A shared drawer shell, extracted from the person drawer.
   - `CompanyDrawer` and `PostDrawer`.
   - Clickable rows, `?company=` and `?post=` params, Previous/Next.
   - Person links with "Back".
- [x] 4. Verify (all gates, integration tests, one live read of each, a few cents), then MEMORY.md and Outcome.

## Edge cases and risks

- **lnkd.in short posts:** read the expanded URL when known. If it is unknown, the read uses the short link and may find nothing; show "No post was found at this link."
- **Company name matching is fuzzy** ("Stripe" and "Stripe, Inc."). Show it as "probably works here", and only for exact case-insensitive matches.
- **Deleted posts or private companies:** the read finds nothing; nothing is stored and the charge, if any, stays booked.
- **Archived items:** archiving deletes their snapshot (proposed). Restoring shows the "Read" button again.
- **Do not contact applies to people only;** companies and posts have no such state.
- **Privacy:** a post's text and the author's details are personal data. They are kept only while the post is in /posts and are part of the owner's erasure.
- **Cost:** reads are refused below the wallet floor, and a double click pays once.
- **No migration risk:** the new table and index are additive. Rollback is a code revert.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, plus the brain integration tests (detail, read once a day, failed read retry, retention).
- One live read of a company and of a post.
- The drawers in a browser if a signed-in session is available.

## Outcome

- **Shipped:**
   - Migration `add_page_snapshots` (additive): `PageSnapshot`, `SpendLedger.label`, and an index on `WorkflowListMember.postUrl`.
   - `paidRead` helper (`database/paidRead.ts`), shared by the person, company and post reads.
   - `CompanyPageService`, `PostPageService`, and the tRPC routers `companyPage` and `postPage`.
   - Body: one `DetailDrawers` shell with the person, company and post views, URL params `?person=`, `?company=` and `?post=`, and `back=`.
- **Deviations:** the routers are named `companyPage` and `postPage`, because `company` and `post` already exist.
- **Live check:** a company read returns every mapped field. A post read by its own link returns that post; a repost from a company feed has a different id but the same content.
- **Verified:** lint, ts:check, unit, build, and brain integration (78). Not checked in a browser, because that needs sign-in.
- **Follow-ups:** none.
