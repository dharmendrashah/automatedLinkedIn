# My connections: read an account's connections, then Message and Remove from a page

- Status: built; live checks pending (a read run on a test account, then one real removal when the owner agrees) <!-- draft | locked | in progress | done -->
- Created: 2026-10-28
- Locked by user: yes, 2026-10-28 (answers below)

## Goal

The owner opens `/accounts/:id/connections` and sees every connection of one account (name, headline, when they connected, photo), searches and sorts them, and can message a connection or remove one without opening LinkedIn. A good run reads the whole list at a human pace and acts only on what the owner chose, each action at most once. A bad run says plainly what did not happen (signed out, person already gone, not sure) and never acts twice.

## Evidence (real page, not guessed)

Recorded with the devtools on `tripti.verma@elitale.com`, local run with the staging account's proxy, 2026-10-27 (`apps/spider/.devtools-recordings/session-2026-10-27T22-34-49-239Z`, gitignored, holds real names: never commit or quote it; fixtures are structure only). In that recording the owner really removed one connection (115 to 114) and tried Message.

- Page `https://www.linkedin.com/mynetwork/invite-connect/connections/` ("115 connections", reached from the profile's "N connections" link). The page carries `data-view-name` markers (unlike this account's profile page).
- Header: `div[componentkey="ConnectionsPage_ConnectionsListHeader"]` with `p` "115 connections" (the total), a sort control `[data-view-name="connections-sort-by-dropdown"]` ("Recently added", other orders not recorded), a search box `[data-view-name="search-typeahead-container"]`, and a link "Search with filters" to people search.
- List: `[data-testid="lazy-column"]` holding rows `[componentkey^="ConnectionCard_"]` (the key is `ConnectionCard_<batch>-<slug>`, batch 0, 10, ... 50; the slug is the stable id). 10 rows at first, 57 after scrolling down once; more load on scroll (infinite list).
- Row (all 57 recorded rows had every part): profile link `a[data-view-name="connections-profile"][href*="/in/<slug>/"]` (photo link and name link), name in `p`, headline in `p > span` (can wrap), `p` "Connected on October 27, 2026" (English, a date the viewer's language writes), `[data-view-name="message-button"] a[aria-label="Send a message to <Name>"]` with `href="/messaging/compose/?profileUrn=urn:li:fsd_profile:<id>"`, and `button[data-view-name="connections-remove-connection-dropdown"][aria-label="More actions for <Name>"]`. 55 of 57 rows had a photo (`img`); two show initials.
- Remove: the dropdown opens `div[role="menu"]` with `[data-view-name="connections-remove"][role="menuitem"]` ("Remove connection"); that opens `dialog[data-testid="dialog"]` ("Remove Connection", "Are you sure you want to remove <FirstName> as a connection?") with `button[data-view-name="connections-cancel-removed"]` and `button[data-view-name="connections-remove"]` ("Remove connection", the same `data-view-name` as the menu item, so tell them apart by tag and role). After it a toast "Connection removed." shows and the heading drops by one (115 to 114); the row leaves the list. The recorded press was one removal.
- Message: the row's Message link points at `/messaging/compose/?profileUrn=...`. Clicking it on the list left the page where it was (the messaging bubble draws inside a shadow root `[data-testid="interop-shadowdom"]`, whose content the kept HTML does not hold); on the person's own profile, Message opens a bubble with a `contenteditable` box, "Write a message" and "send message" (`msg-form`). The compose page itself, and a message to a person who already has a thread, were not recorded.
- Seen on one account only, English. Not seen: other sort orders, the search box in use, a very long list (thousands), a person who left LinkedIn, a row with no headline, a non-English account, a second layout, the compose page. All unverified until recorded.

## Requirements

Confirmed by the owner, 2026-10-28 (the answers to the five questions):

- C1 A page at `/accounts/:id/connections` that lists all the connections of the account.
- C2 Per connection the actions Message and Remove connection.
- C3 A spider task reads the list from LinkedIn (a recording is available).
- A1 Build everything in one go (all slices), each slice checked before the next.
- A2 Message does not send anything itself: it opens the Unibox conversation with that person. For a person with no conversation yet the row says so and links to LinkedIn's own message window in a new tab (my addition, one link, nothing automated; easy to drop).
- A3 Remove is one at a time, from the row, with a dialog that names the person; no bulk removal.
- A4 The list is read on demand only (a "Read connections" button).
- A5 The limits and kept fields below are kept as proposed.

Defaults confirmed with them (D1 to D4, D6 and D7 as written; D5 is replaced by A2):

- D1 Order of work in slices, as for "My network" (`.plan/my-network-invitations.md`): slice 1 the page on sample people; slice 2 the read task; slice 3 brain, the live read and the page; slice 4 Remove; Message is part of slice 1 and 3 (no task).
- D2 Reading is on demand ("Read connections" button, "Last read ..."); the first read is the whole list; later reads add the new ones and mark the gone ones (a complete read only).
- D3 Kept per connection: name, slug, headline, connected-on date, photo address, read time, gone time. No deletion policy for now (rows go with the account), as for invitations; a known privacy gap, listed in `MEMORY.md`.
- D4 Remove: one at a time from the row, with a dialog that names the person and says it cannot be undone from here. Limits: 10 removals per account per 24 hours, 20 to 40 seconds apart, one run at a time per account, the browse budget as for other tasks. A removal is the click on the confirm button, asked once with `markAttempt()`, and ends `UNKNOWN` (never a retry) when the page does not say.
- D6 Cap of a read: 1,000 rows or 20 minutes, `complete: false` when capped; scrolled at a human pace.
- D7 Names: task `linkedin-connections` (reads, and removes the one asked person in the same run, as invitations answer); route `/accounts/:id/connections`; page title "Connections"; the account page links to it.

Open questions: none.

## Scope and non-goals

- In scope: the page, the read task, brain tables, service, router and import, Remove, Message, limits, tests, `MEMORY.md`.
- Out of scope: sending connection requests, a bulk message or auto-removal rules, tagging or notes on a connection, an all-accounts connections view, exporting the list to CSV (a later add), following or unfollowing, other languages, keeping our own copy of the photos.

## Approach

Built in the order below, each layer checked before the next (the owner asked for everything in one go, 2026-10-28).

- [x] 1. Locked with the owner's answers (above).
- [x] 2. Contracts: `packages/contracts/src/connections.ts` (file schema, `CONNECTION_LIMITS`, slug pattern) with tests.
- [x] 3. Spider reader `linkedin/connectionReader.ts`, fixture, markup selectors with their date; run over the real recorded pages (57 of 57 rows read, heading 115 then 114 after the removal; the menu item, dialog confirm and toast selectors matched the recorded steps).
- [x] 4. Spider task `linkedin-connections` (`tasks/linkedinConnections/`: read, and remove one connection by slug), registered, with unit tests of the run (15) and the answer.
- [x] 5. Brain: migration `20261028040000_add_linkedin_connection` (additive), `connectionRules` (pure), hooks, `LinkedInConnectionService`, `ConnectionImportService`, job `connection-import`, router `connections`, with unit and integration tests.
- [x] 6. Body: page `/accounts/:accountId/connections`, row, remove dialog, pure modules with tests, a link on the account page; no sample source (deviation: the page was built straight on the live router).
- [x] 7. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` pass; brain integration tests for the service pass with the migration applied.
- [ ] 8. Live: a read run on a test account (devtools "Run a task", input empty), then one real removal with the owner's agreement; the page seen in a browser.

Spider task checklist (`.github/skills/spider-task-writer/assets/checklist.md`):

- [x] Plan, goal, locked requirements, name `linkedin-connections`, input `{ remove? }`, verdicts DONE, PARTIAL, UNKNOWN, SIGNED_OUT, ERROR, `version` 1; the irreversible step is the confirm of Remove (test account: tripti.verma@elitale.com).
- [x] Lifecycle: the task assumes a signed-in feed and repeats no sign-in; every landed page is checked (`session.open`, `session.signedIn`), `SIGNED_OUT` declared and tested on `/uas/login`; SUCCEEDED returns `commitSession: true`; the run ends on the list page, a dialog left open is cancelled.
- [x] `markAttempt()` is asked once, just before the confirm press; a redelivered command presses nothing and ends UNKNOWN; the dialog must name the row's first name or nothing is pressed.
- [x] Selectors are plain CSS, in `linkedin/markup.ts` with the date, built from a slug the contract restricts to `[A-Za-z0-9_%-]`.
- [ ] n/a until live: a real-browser stand-in e2e test (no new driver call; the run uses `clickNth`, `scrollOver`, `press`, `pageHtml`, all existing and already forwarded by the recorder), the two runs in a row on a test account, and a deliberate failure read from the run folder.
- [ ] Unverified (no page seen): other sort orders and the search box, a non-English account, a person with no headline, a slug with letters outside a to z in the row's `componentkey`, a list of thousands, and the compose window opened from the row's Message link.
- [x] No name, headline or photo reaches a log, a sentence or a report; they go only into `connections.json`.

## Edge cases and risks

- A person is removed by the other side or on the phone between the read and the click: the row is not on the page, outcome `GONE`, not an error.
- A removal click that may have landed with no toast: `UNKNOWN`, the run stops, the owner reads again to check; never a second click. A redelivered command finds `markAttempt` false and clicks nothing.
- Two rows can share a name: the row is aimed at by slug, never by name or position; the menu item and the confirm button share `data-view-name="connections-remove"`, so the confirm is aimed inside `dialog` by tag.
- The list is lazy and long: scroll in a bounded loop; the total in the heading is the check that the read is complete; a capped read never marks the unread people as gone.
- Pages draw slowly through the proxy (15 to 30 s): look in a bounded loop before concluding the list is empty.
- Sign-in page on any landed page: `SIGNED_OUT`, never fill a form. The task declares `SIGNED_OUT` and has a test.
- Compliance: acting on the signed-in owner's own account at a human pace, inside the published limits; no bulk removal; no scraping of other people's data beyond what the owner's own connections page shows.
- Privacy: names, headlines and photos of other people are stored with no retention rule (D3); listed as a known gap.
- Account language: the "Connected on" line and the menu words are English; a non-English account is out of scope (the task ends `ERROR` rather than guessing).
- A real removal is irreversible: live tests on a test account only, one at a time, with the owner's agreement per run.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; brain integration tests with the migration applied; a real-browser stand-in e2e test; a read-only live run on the test account, then one real removal and one real message when the owner agrees.

## Outcome

Shipped (not run live): the page `/accounts/:accountId/connections` (search, two views, 100 rows at a time, Message and Remove per row, Read connections with the Start anyway dialog, a link on the account page), the spider task `linkedin-connections`, and brain storage, import and router. Message opens the Unibox conversation for a person who has one, and LinkedIn's own message window in a new tab for one who has not (nothing is typed or sent by the app). Remove is one at a time through a dialog that names the person; the task opens the row's menu, checks that LinkedIn's own dialog names the same first name, asks `markAttempt()`, presses the confirm once, and waits for the row to leave or the toast.

Deviations: no sample source for the page (built on the live router); no real-browser stand-in test; a removal run reads only down to the row it needs (its file is marked incomplete, so nobody is called gone by it), and the heading count is lowered by one in brain after a removal.

First live read (tripti.verma, run `b12552e8`, 2026-10-27): ended PARTIAL, "Read 0 connections", though the heading said 114. The page of that run has the same rows (`componentkey="ConnectionCard_<batch>-<slug>"`) but no `data-view-name` anywhere, so every row failed to read. Fixed: the row readers use the anchors both layouts have (`a[href*="/in/"]`, `a[href*="/messaging/compose/"]`, the dots by `aria-label` "More actions for"), the fixture has a `plain` layout made from that page's document, and a run whose rows could not be read keeps `files/connections-page.html`. Still unverified in this layout: the menu item, the dialog and its buttons (they carry `data-view-name` only in the first layout), so a removal there ends `NOT_CLICKED` at the first step that does not show; the rows' photos (drawn after the page loads).

First live removal (tripti.verma, run `647a7d60`, 2026-10-28): read 110 of 114 rows (the second read, run `5653e113`), then asked to remove one: the dots were pressed, "The menu of a row did not open" (the menu item was looked for by `data-view-name`), nothing was removed, and the run still said SUCCEEDED. Fixed: a removal that was asked for and not done (`NOT_CLICKED`, `GONE`) now answers status FAILED (verdict stays PARTIAL, so brain still hands the file over and settles the list); the menu item and the dialog's buttons are found by their words (`Remove connection`, `Cancel`) and pressed by position, the dialog must still name the row's first name before `markAttempt()`; a step that does not show keeps `files/removal-menu.html` or `files/removal-dialog.html`. Still unverified: what the menu and dialog look like in this layout (the words are assumed to be the same).

Follow-ups: the live checks in step 8; a shared claim and lease helper for the three import services (messages, invitations, connections are near copies); a retention rule for the stored people; other languages.
