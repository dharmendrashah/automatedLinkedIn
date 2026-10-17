# Profile detail drawer on /profiles and /lists

- Status: done
- Created: 2026-10-18
- Locked by user: yes, 2026-10-18

## Goal

Clicking a person on /profiles or on a list opens a side drawer, not a new page. It shows the person laid out like a LinkedIn profile, so a lead generator can judge at a glance whether they fit.

## Today (checked in the code)

- **/profiles** (`LinkedInProfile`): fields filled in by hand (name, headline, company, location, notes, tags, status). Nothing is fetched. The table name links out to LinkedIn, and rows do nothing on click.
- **Lists** (`WorkflowListMember`):
   - Stored: name, headline, location, state (Qualified/Maybe/Unscored), status, score, tags, post that found them, and `signals` (why they were found: commented / reacted / employee / hiring, with a short excerpt).
   - The member select sent to the browser leaves out `signals`, and there is no per-member detail query.
- **Workflow items** (`PersonItem`, kept 14 days) also have title, company, followers and the matched ICP rules, but none of that is copied onto the list member.
- **Only some fields are kept.** The full-profile read (`cardOf`) keeps name, headline, location, followers and the current title and company. It drops the photo, about, experience history, education and skills.
- **The same person is linked across pages** by owner + slug (`seenAt`, `seenAmong` already check Suppression, lists and /profiles together).
- **A drawer pattern exists:** `Drawer direction="right"` with `floatingDrawer()` (proxy details, sessions).
- **Paid reads** run in the brain worker. `SpendLedger` allows rows without a run (`runId` and `workflowId` are nullable).

## Proposal

### The drawer (both pages, one component)

LinkedIn-like layout, top to bottom:

1. **Header card:**
   - Initials avatar (no photo; see the open questions), name, headline, current title at company, location, followers.
   - Buttons: "Open on LinkedIn" (new tab) and copy link.
2. **Fit panel:** the ICP score as a ring or bar, Qualified/Maybe/Unscored, and which ICP rules it matched or missed (for list members), so the "fits or not" judgement comes first.
3. **Why we found them** (list members): each signal ("Commented on <post>: '...excerpt'", "Reacted to ...", "Works at X", "X is hiring for ...") with the date and a link to the post.
4. **About, Experience, Education, Skills:** LinkedIn-style sections, only when a full profile is stored (see the open questions).
5. **In your workspace:**
   - Which lists they are in, with state and status.
   - Whether they are in /profiles, and the notes and tags there.
   - Whether they are marked do-not-contact.
6. **Actions at the bottom:** the same actions each page already has.
   - Lists: change status (New / In review / Done / Not a fit), labels, move, delete, do not contact.
   - /profiles: edit, status, archive.
   - Both: "Add to /profiles" / "Add to a list".
   - "Previous / Next" moves through the table without closing the drawer, so a reviewer can work through a list quickly.

- **Behaviour:** clicking a row (or Enter on a focused row) opens the drawer. The URL gets `?person=<slug>`, so a refresh or a shared link reopens it. Esc closes it.

### Data

- New `person.detail({ slug })` query, owner-scoped, combining:
   - the /profiles row;
   - every list membership, with signals;
   - suppression;
   - the latest stored full profile, if any;
   - the matched rules and title, company and followers from the newest workflow item still kept.
- Additive migration, depending on question 1: copy title, company, followers and matched rules onto `WorkflowListMember` when a run adds them. They then outlive the 14-day item retention.

## Requirements

Confirmed:

- The detail opens in a side drawer on /profiles and on lists, never as a new page.
- It looks like a LinkedIn profile and helps judge whether a person fits as a lead.
- Answered by the owner on 2026-10-18:
   - **Rich sections:** the drawer shows what is stored, plus a "Read full profile" button. On click it pays one profile read, stores a snapshot (about, experience, education, skills, photo link), and shows the LinkedIn-like sections.
   - **Snapshot retention:** kept while the person is in any of the owner's lists or in /profiles. It is deleted when they leave all of them, on "Do not contact", and on erasure.
   - **Paid read:** the button shows the price ("Read full profile · about $0.004") and reads on click, without a confirm. The cost goes to `SpendLedger` and the monthly statement as a profile read. It is refused below the wallet floor, and a double click pays once.
   - **Photo:** the photo link is stored with the snapshot and shown in the header, with initials as the fallback.
   - **Fit panel:** a score shows only when a workflow made one; no scoring from the drawer.
   - **Actions:** the existing row actions of each page, Previous/Next, "Add to /profiles" or "Add to a list", and notes on the person. Lists get notes too: a new `notes` column on the list member. /profiles keeps its own notes.

Open questions: none.

## Superseded questions (kept for the record)

1. **Rich sections (About, Experience, Education, Skills).** Today these are dropped when a profile is read. Options:
   - (a) Show only what is stored today: header, fit, why found, workspace. No extra cost and no new personal data.
   - (b) A "Read full profile" button in the drawer. It pays one profile read (about $0.004) on demand, stores the snapshot for N days, then shows the LinkedIn-like sections.
   - (c) Keep those sections automatically whenever a workflow's "Get full profile" block reads someone. No extra cost, but more personal data is stored for every enriched person.
   - Recommended: (a) now plus (b).
2. If (b) or (c): how long is a stored full profile kept (proposed 30 days, then deleted), and is it deleted with "Do not contact" and with the person's erasure?
3. If (b): a click starts a paid read. Should the drawer show the price and ask the first time, or just read? Does it count on the client's monthly statement like workflow runs (proposed: yes, as "Profile reads")?
4. **Profile photo:** keep showing initials (no photo stored, as today), or store the photo link with the snapshot?
5. **Fit panel in /profiles:** /profiles people have no score unless a workflow scored them. Should the drawer offer "Score against an ideal customer" (free, uses stored fields) or only show a score when one exists?
6. **Actions:** which actions belong in the drawer on each page? Proposed: all the existing row actions plus Previous/Next.

## Scope and non-goals

- In scope:
   - One drawer component used on /profiles and lists.
   - A detail query.
   - Copying title, company, followers and matched rules onto list members.
   - URL state.
   - Keyboard navigation.
   - Whatever questions 1 to 6 settle.
- Out of scope:
   - Sending messages or connection requests from the drawer.
   - Scraping LinkedIn pages directly.
   - Bulk enrichment of a whole list (a workflow does that).

## Approach

- [x] 1. Lock this plan.
- [x] 2. Brain:
   - The detail query, plus tests (owner scope, a person in several lists, suppressed).
   - Copy title, company, followers and matched rules onto list members (additive migration).
   - If (b): an on-demand read through the data client, its cost written to `SpendLedger`, a snapshot model with retention and erasure.
- [x] 3. Body:
   - `PersonDrawer` (header, fit, why found, sections, workspace, actions) built on the existing `floatingDrawer`.
   - Clickable rows on both tables.
   - `?person=` in the URL; Previous/Next.
- [x] 4. Verify (all gates, integration tests, the drawer in a browser), then MEMORY.md and Outcome.

## Edge cases and risks

- **Photo links** from LinkedIn's image servers can expire. The header falls back to initials when the image does not load. A stale photo is refreshed only by reading the profile again.
- **Snapshot cleanup:** a daily retention step deletes snapshots of slugs that are in none of the owner's lists and not in /profiles. Do-not-contact deletes the snapshot at once.
- **Someone in /profiles but in no list,** or the other way round: the sections that do not apply are hidden.
- **The same slug in several lists:** all memberships are shown, and the actions apply to the list being viewed.
- **A suppressed person:** shown with a clear "Do not contact" banner and no add actions.
- **A deleted or archived row while the drawer is open:** the drawer shows "No longer here" and Next still works.
- **Signals JSON from older rows:** read through `readSignals`, which already validates. Bad rows show nothing rather than crashing.
- **Privacy:** only the owner's own rows are returned (`ownerProcedure`, userId in every where). If (b) or (c) is chosen:
   - more personal data is stored;
   - it needs a retention job, deletion on do-not-contact, and inclusion in an erasure request;
   - the supplier is never named in the UI.
- **Cost (b):** a paid read is refused below the wallet floor, as in runs. A double click must not pay twice (use one key per person per day).
- **Performance:** a detail query per open; tables stay paginated as they are.
- **Rollback:** UI only for (a). The migration columns are nullable.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, plus the brain integration tests for the detail query (and the paid read with the fake data client, if (b)).
- The drawer opened from both pages in a browser, with Previous/Next and `?person=` reload.

## Outcome

Shipped:

- **Database:** additive migration `add_person_details`.
   - `WorkflowListMember` gets title, company, followers, matched (copied by "Add to list") and notes.
   - New `PersonSnapshot` table: owner, slug, allow-listed JSON, fetchedAt.
- **Brain:**
   - `PersonService.detail` (the /profiles row, list membership with signals, suppression, snapshot, read price).
   - `PersonService.readFull` pays one read a day per person. It writes a ledger row (`profile-read:<user>:<slug>:<day>`, no workflow), is refused below the wallet floor and for do-not-contact people, and deletes the ledger row again when nothing was paid.
   - tRPC `person.detail` and `person.readFull`; the data client is created on the first read.
   - Do not contact deletes the snapshot. Retention deletes snapshots of people in no list and not in /profiles (archived counts as not in).
   - Statements show "Profile reads" with a count.
   - The data client moved from `worker/data` to `core/dataClient.ts`, so the API can read on demand. Imports use `core/dataClient`, which also needed a `core/*` path in body.
   - `core/personSnapshot.ts` keeps about, photo (https only), followers, connections, open to work, hiring, experience (15), education (10) and skills (30). Ids, emails and anything else are dropped.
- **Body:**
   - `components/people/` holds the drawer (LinkedIn-like header with cover, photo or initials, name, headline, role at company, location, followers and connections; open to work, hiring and do-not-contact badges; Open on LinkedIn; "Read full profile · about $0.004" or "Read again").
   - Sections: Fit (score bar, state, matched rules), Why we found them, About (show more), Experience, Education, Skills.
   - In your workspace: list status, move, notes, remove, do not contact with a confirm; /profiles status, archive or restore, notes; add to /profiles; add to a list.
   - Previous/Next with "n of m", and `?person=<slug>` in the URL.
   - On /profiles and lists the name opens the drawer; LinkedIn opens from the drawer.

Verified:

- lint, ts:check, unit tests and build all pass.
- Brain integration: 75 pass. 4 are new for this: detail, a paid read once a day, a failed read can be retried, deletion on do not contact and by retention.
- One live read ($0.004) confirmed the field names.

Not verified:

- The drawer in a browser (the local app needs a sign-in).
- A real read through the tRPC path.

Deviations:

- Clicking the name opens the drawer, not the whole row, so the status select and menus in the row keep working.
