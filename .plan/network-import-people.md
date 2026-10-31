# My network: import people (paste or CSV), review, read profiles, and Discovery people

- Status: done
- Created: 2026-10-31
- Locked by user: yes (2026-10-31, "lock it")

## Goal

Make "Add people" a proper import:

- paste links, or upload a CSV, with a downloadable example;
- review exactly who will be added (all ticked, untick to skip);
- read their profiles at once (ticked by default);
- see what happened.

Imported people are **Discovery** people: none of the owner's LinkedIn accounts is connected to them and no invite has gone yet. When the owner invites one, the dialog asks which LinkedIn account to send from, with or without a note.

## What exists today (checked in code, 2026-10-31)

- **Add people.** `AddPeopleDialog` takes a textarea of links (up to 200) and a list (or a new one). `people.add` adds them as members of that list in the client and answers `{ added, skipped, invalid }`. Nothing is read.
- **Profile reads.** A paid read is `PersonService.readFull` → `DataReadService.queue`: one queued read per person, refused when reads are paused or the person was read today. The worker stores the snapshot, saves the companies and rebuilds the row.
- **Invites.** `InviteDialog` shows "Send from" only when the client has more than one account; otherwise brain picks one. The note is optional, with Insert first name and Insert company.
- **The row.** A person added this way has no account link, so no account chip shows, Message is disabled ("Not connected yet"), and `inviteState` is `NONE`.

## Requirements (owner, 2026-10-31)

1. **CSV columns:** `profile_url` (required), `labels` and `notes` (optional). Nothing else.
2. **Discovery:** imported people are not connected to any LinkedIn account and no invite has been sent; they are called Discovery people. When inviting them, the owner is asked which LinkedIn account to use, and sends with or without a note.
3. **Limit:** up to 1,000 profiles per import.
4. **Client:** imports go to the client on screen, and to the default client ("My accounts") under All clients, as Add people does today.
5. **CSV labels:** they go on the person's labels in My network. **CSV notes** go on the person's notes; existing notes are kept and the new text is appended.
6. **Review:** before anything is added, every profile is listed with a checkbox, all ticked; the owner unticks to skip, then confirms.
7. **Reads:** "Read their profile details now" is an option of the import, ticked by default, with no price shown (the owner accepts the cost).

## Design

### The dialog: two steps

1. **Choose.** Tabs "Paste links" | "Upload CSV".
   - Paste: the textarea, up to 1,000 links.
   - Upload CSV: a file picker (`.csv`, up to 2 MB and 1,000 rows) and "Download example CSV".
     - The example has a header and two sample rows:
       ```
       profile_url,labels,notes
       https://www.linkedin.com/in/example-one/,founder;saas,Met at SaaStr
       https://www.linkedin.com/in/example-two/,,
       ```
     - The header may be in any order, and a file with only a column of links (no header) works too.
   - List: the picker or a new list, as today.
   - Button: "Review".
2. **Review.**
   - One row per profile, with a checkbox, the link, the labels and notes from the CSV, and its state:
     - **New**: ticked.
     - **Already here**: unticked and greyed; labels and notes still apply if ticked.
     - **Do not contact**: no checkbox, never added.
     - **Not a profile link**: listed under "Skipped".
   - Duplicates in the file count once (their labels are merged).
   - "Select all / none", and a count: "37 of 40 selected".
   - "Read their profile details now", ticked by default, with one line under it: "Fills name, photo, company, country and Premium. A profile already read today is not read again."
   - Button: "Import 37 people". A progress bar shows while it sends in batches of 200.
   - Result: "Added 37 to <list> as Discovery people. Reading 37 profiles; they fill in over the next minutes. Skipped 3 (2 already here, 1 do not contact), 2 not profile links."

### Brain

- **`people.preview({ clientId, urls })`** (new, read-only, up to 1,000 links). It answers each profile's state: new, already in the client, do not contact, or invalid. The CSV is parsed in the browser, so brain gets links and fields only.
- **`people.add`** takes the profiles, not one text block: `{ url, labels?, notes? }[]`, up to 200 per call (the dialog sends batches), plus `read: boolean`. After adding the members it:
  - builds those people's rows at once (`PeopleIndexService.refresh`), so their labels and notes can be saved on the person;
  - adds the CSV labels (merged, lower case, the existing label rules) and appends the notes;
  - when `read` is set, queues one profile read per added person, charged to the client. Reads it cannot queue (paused, read today) are counted, not failed.
  - It answers `{ added, skipped, invalid, reading, notRead }`.
- **No account is linked.** The people show Found by = the list, Not connected, no invite.

### Discovery on the table and the drawer

- A person with no account link and no invite (`inviteState` `NONE`, no links with an account) shows a **Discovery** chip where the account chips go, and in the drawer's badges.
- The Filters drawer's Connection choice gains **Discovery** beside Connected and Not connected.
- The row's Invite and the drawer's Invite stay as they are (enabled while invites are live).

### Invite: always ask which account

- `InviteDialog` always shows "Send from", for one person or several, even with one account.
- For Discovery people nothing is pre-picked, and Invite is disabled until an account is chosen.
- For people an account already knows, it pre-picks the account brain suggests, as today.
- The list holds every account of the person's client that can send invites. A stopped account shows disabled with its reason.
- The note stays optional, with Insert first name and Insert company.
- Brain already takes `accountId`; no back-end change.

## Scope and non-goals

- In scope:
  - the two-step dialog, the CSV parser and the example file;
  - `people.preview`, and `people.add` with profiles, reads, labels and notes;
  - Discovery (chip, badge, filter);
  - the always-shown "Send from";
  - tests.
- Out of scope:
  - other CSV columns;
  - Excel files;
  - parsing CSVs in brain;
  - inviting at import;
  - a client picker in the dialog.

## Edge cases and risks

- **Input:**
  - an empty file, no `profile_url` column, or over 2 MB or 1,000 rows: a clear message, and nothing is sent;
  - a UTF-8 BOM, `;` or `,` delimiters, and quoted fields with commas or new lines are handled;
  - formula cells (`=`, `+`, `-`, `@`) are kept as plain text and never evaluated.
- **Re-import:** the same profile twice in the file, or a re-import of the same file, adds nobody twice and reads nobody already read today. Labels merge; notes already present are not appended again.
- **Do not contact:** never added, never read, never labelled.
- **Partial failure:** batches are sent one after another. If one fails, the result says how many were added before it, and pressing Import again is safe (idempotent adds).
- **Reads:** 1,000 queued reads run over time through the worker. The wallet floor and "reads paused" refuse with the existing sentence and are counted. The dialog can close while they run; rows fill in as each read lands (the row is rebuilt right after each read).
- **Cost:** about $0.004 per read, about $4 for 1,000 (accepted; not shown).
- **Load:** rebuilding 200 rows per batch takes a few seconds; batches keep each request short.
- **Security:** the file never leaves the browser. Brain validates every link (`readLinks`), caps the counts, and the labels and notes follow the existing limits.
- **Rollback:** brain changes are additive (a new query, a changed input with the old text input dropped); no migration.

## Verification

- Unit:
  - the CSV parser (header order, a links-only file, BOM, quotes, delimiters, formula cells, limits);
  - review states and selection;
  - the Discovery rule;
  - "Send from" always shown and required for Discovery people.
- Integration:
  - preview states;
  - add with labels, notes and `read` (reads queued, already-read skipped, do-not-contact never added);
  - re-import is idempotent.
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- On staging: download the example, import it with reads on, see the rows show Discovery and fill in, then invite one, choosing the account.

## Open questions

- None.

## Outcome

- Shipped (branch `feat/network-import-people`):
  - brain: `people.preview` (mutation, up to 1,000 links; each profile's `state` and the `inputs` that named it) and `people.add` taking `{ url, labels?, notes? }[]` (200 per call) and `read`; members added, rows rebuilt at once, labels merged and notes appended on the person of the list's client, reads queued (`ConflictError` counted as not read). Integration test `peopleImport.integration.test.ts`.
  - body: `import-csv.ts` (parser, example, `peopleOf` merging a profile's rows), the two-step `AddPeopleDialog` (paste or CSV, review with ticks, read option ticked, batches with a progress bar, result line), the Discovery rule `isDiscovery` with a chip on the row and a badge in the drawer, Discovery in the Connection filter (contracts and brain), and `InviteDialog` always asking "Send from" with no pre-pick for Discovery people.
- Deviations: review rows show the profile and its state, not the CSV labels and notes; Already here rows are unticked but not greyed; stopped accounts are not listed in "Send from" (brain's invite plan lists only accounts that can send).
- Not run: the dialog in a browser (sign-in needed); staging check from Verification still to do after deploy.
