# Invites: find the Connect button the way LinkedIn draws it now (page, then More), and stop calling people "already connected" by guess

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-11-15
- Locked by user: yes, 2026-11-15 (revised the same day after the owner's three recordings; the earlier degree-reader design is dropped)

## Goal

Staging campaign `01a1afe4` (Release preview 2026) sent 16 invites on 2026-11-10 and 1 on 2026-11-14 although the accounts had room (34 on 11-14). Read-only look at staging and the owner's recordings found the cause:

1. LinkedIn changed how the profile's Connect control is drawn. `CONNECT_LINK` (`linkedin/markup.ts`) matches only `a[href*="/preload/custom-invite/"]` and `button[aria-label*="Invite"][aria-label*="to connect"]`. The person's own Connect is now an `a` with the label on the `a` (top card or the "Connect if you know each other" card) or an `a[role="menuitem"]` in the More menu with the label on an inner `div`. So `connects` and `menu` were empty for every 2nd-degree profile.
2. With no Connect found, the task answered `ALREADY_CONNECTED` because a Message link was on the page. That is a guess: 2nd-degree profiles (Follow first, Message shown) and 3rd-degree profiles with Message were all called connected. The brain saved the invite as `SKIPPED`, and `SKIPPED` leaves the person at `inviteState NONE`, so the Invite block picked the same 50 people again every morning (87 invites for 50 people, up to 3 accounts each), spending the room.

A good run after this: on a 2nd-degree profile the task finds Connect on the page or, if it is not there, opens More and presses Connect there; a profile that shows Pending is answered `ALREADY_PENDING`; a profile whose More menu offers "Remove connection" is answered `ALREADY_CONNECTED`; a profile with none of these keeps its page and is answered `NO_CONNECT` (the invite ends, so the person is not asked again). A person answered connected is known as a connection, so the Invite block does not pick them again.

Discover supply (qualified per day 22, 18, 11, 38, 2, 0) is step 3, after this plan.

## Evidence (real markup, read from kept files)

Owner recordings, account dharmendrashaheagle+linkedin@gmail.com, 2026-11-15, English, one account only, in `apps/spider/.devtools-recordings/`:
`session-2026-11-15T04-56-24-101Z` (Umair Shahzad: More, Connect, Send without a note), `...T04-58-21-298Z` (Manthan Patel: More, Connect, Send without a note), `...T05-00-46-452Z` (Umair after the invite: Pending, no Connect).

- Connect in the "Connect if you know each other" card (Manthan, step 4): `<a aria-disabled="false" href="https://www.linkedin.com/in/<slug>/" componentkey="ConnectButtonstate:invitation:urn:li:member:<id>_connect" aria-label="Invite <Name> to connect">`.
- Connect in the More menu (Umair step 5, Manthan step 6): `<a role="menuitem" href="https://www.linkedin.com/in/<slug>/" componentkey="ConnectButtonstate:invitation:urn:li:member:<id>_connect">` with an inner `<div componentkey="same" aria-label="Invite <Name> to connect"><p>Connect</p></div>`; the `a` has no label.
- Pending (Umair after the invite, step 4): `<a href="https://www.linkedin.com/in/<slug>/" componentkey="ConnectButtonstate:invitation:urn:li:member:<id>_pending" aria-label="Pending, click to withdraw invitation sent to <Name>"><span><svg/><span>Pending</span></span></a>`; no `_connect` of the person is on the page.
- People suggested beside the profile have `<button type="button" componentkey="...<other id>_connect" aria-label="Invite <Other> to connect">` with no `href`; the person's own controls are the ones whose `href` is the profile's own `/in/<slug>/`.
- Invite window (Umair step 6): a `<dialog>`; "Add a note" is an `<a href="/in/<slug>/"><span><span>Add a note</span></span></a>` and "Send without a note" is `<button type="button"><span><span>Send without a note</span></span></button>` (no label; `parseInviteDialog` already finds the button by its text).
- Degree text cannot be trusted: every "· 2nd" profile in all recordings (Oct 27 to Nov 15, 7 people) holds `<div data-display-contents="true"><p>· 1st</p></div><p>· 2nd</p>` together. The earlier plan to read the degree is dropped.
- Kept `no-connect-*.html` pages from staging (40, tripti.verma, 2026-11-10 to 11-13) are "· 3rd" profiles with Follow and no Connect: `NO_CONNECT` is right for them.
- Kept screenshots of staging runs on this account (2026-11-14): Manthan Patel, Lian L. and Afreen Furqan J. show the card; Chris Phillips shows a blue Connect in the top card; Umair Shahzad, Danny Iny and Faisal Ahmed show Follow, Message, Save, More; Alicia Harper, Andrew Sahatyi, Anthony H., Ben Vinegar and Divya Napa are "· 3rd" with Message and no Connect.

Not seen (unverified): the Connect markup of a regular top card like Chris Phillips' (assumed to be the same `a` with `componentkey` ..._connect as the card); the note box after "Add a note"; a real 1st-degree profile; other languages and other accounts' layouts.

## Requirements

Confirmed by the owner (2026-11-15):

- If Connect is not found, always click More and press Connect there.
- If an invite was already sent, the profile shows Pending and no Connect.
- Stop the daily re-asking of the same people (step 1) and fix the false verdict (step 2) together; step 3 comes after.

Answered by the owner (2026-11-15):

1. The 50 people wrongly skipped come back and are looked at again (their `inviteState` is still NONE, nothing to do).
2. With no Connect on the page or in More: look for Pending, then for the connected sign, and only then give up. The connected sign is not a Message button (3rd-degree profiles show it too); it is the More menu's "Remove connection" item, which is what LinkedIn shows for a connection (seen on the connections list on 2026-10-27; not yet seen on a profile, so unverified). Without it the answer is `NO_CONNECT`.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: spider `markup.ts` and `inviteReader.ts` (selectors, own-person rule, pending rule, connected sign), `linkedinInvite/run.ts` (no more "already connected" from a Message link), brain `inviteRules.ts` and `peopleIndex.ts` (a connected answer makes the person a connection), fixtures built from the recordings (structure only), tests, `MEMORY.md`.
- Out of scope: the "Add a note" link and the note box (unverified: a note invite will answer `NOT_SENT` as it does now when "Add a note" is not found; this campaign's runs use the no-note block); degree reading; Discover supply (step 3); schema or migration (the brain change reads columns that exist: `reason`, `startedAt`).

## Approach

### Design

- `markup.ts` (dated 2026-11-15): `CONNECT_LINK` also matches `a[componentkey^="ConnectButtonstate:invitation:urn:li:member:"][componentkey$="_connect"]`. Plain CSS.
- `inviteReader.ts` `parseProfileActions`:
  - An `a` Connect is the person's own when its `href` path slug equals the slug (`slugKey`); existing rules for custom-invite links and labelled buttons stay.
  - The member id comes from the `componentkey` of the own link as today (`CONNECT_MEMBER`).
  - `pending` is also true for an `a` whose `componentkey` ends `_pending` and whose `href` is the person's own, so a different spelling of the name cannot hide it; the label rule stays.
  - The menu item is in `menu` (role `menuitem`) and pressed with the existing `clickNth(CONNECT_LINK, index)`.
- `markup.ts`: `REMOVE_CONNECTION_WORDS = 'Remove connection'` (English, a `[role="menuitem"]` whose text is exactly that; seen on the connections list, unverified on a profile). `inviteReader.ts`: `menuShowsConnection(html)`.
- `run.ts`: the order is the page's own Connect, then the More menu's Connect (`openMenu` already opens More whenever the page has none), then Pending, then the connected sign in the open More menu, then `NO_CONNECT`. `openMenu` keeps waiting for a Connect but also stops as soon as the menu shows "Remove connection", and tells the caller which it saw. `ALREADY_CONNECTED` is answered only on that sign, never on a Message link. `NO_CONNECT` keeps the page `no-connect`.
- Brain `inviteRules.ts`: a new fixed sentence `CONNECTED_REASON` for `ALREADY_CONNECTED` ("Already connected on LinkedIn: its menu offers Remove connection."). The 87 old rows keep the old sentence "Already connected on LinkedIn.", which was a guess and is not trusted, so those people come back.
- Brain `peopleIndex.ts`: `InviteRow` gains `reason` and `startedAt`; a `SKIPPED` row with `CONNECTED_REASON` counts as a connection of that account (`connectedAt` is the earliest of connection rows and these), so the Invite block's "Connected is no" check drops the person. Old rows are untouched.
- Fixtures for the shapes (card, menu, pending, menu with Remove connection) in `inviteFixture.ts` with made-up names and ids.

### Tasks

- [x] Fixtures (structure only, no real names) for: own Connect in the card; own Connect only in the More menu; Pending; a profile with Follow, Message and nothing else; a More menu with Remove connection; people suggested beside the profile with their own `button` Connect (must not match).
- [x] Reader tests: each fixture; own Connect chosen by `href` slug among suggested people; the `_pending` rule with a name that differs from the label; `menuShowsConnection`.
- [x] `run.ts` tests: card Connect pressed; Connect only in More pressed after opening More; Pending is `ALREADY_PENDING` and nothing is pressed; More menu with Remove connection is `ALREADY_CONNECTED`; Message with no Connect, no Pending and no connected sign is `NO_CONNECT` with the page kept; `SIGNED_OUT` on `/uas/login` still holds; Connect is pressed at most once.
- [x] Brain tests: `sendChange('ALREADY_CONNECTED')` gives `CONNECTED_REASON`; people index: a SKIPPED row with `CONNECTED_REASON` sets `connectedAt`, one with the old sentence or another SKIPPED reason does not.
- [x] Brain integration test: after a connected answer is stored and the index rebuilt, the person has `connectedAt` and the Invite block's input no longer returns them.
- [x] `MEMORY.md`: markup seen (account, date), unverified list, the follow-up for "Add a note", one changelog line; the earlier open item about slow invites is updated.

### Spider task checklist (`spider-task-writer`)

- [x] 1. Plan: exists, goal says what a good and a failed run look like; open questions empty and locked; no new verdict (the existing `NO_CONNECT`, `ALREADY_PENDING`, `ALREADY_CONNECTED` stay; the last is no longer sent); write task, irreversible step unchanged (`markAttempt()` just before the Connect press, at most once, an unclear result is `UNSURE`).
- [x] 2. Lifecycle: n/a, the runner part is unchanged; the task still assumes the signed-in feed; the `SIGNED_OUT` test is kept.
- [x] 3. Evidence: real markup above (account, date written); layouts: one account only, plus screenshots of staging runs; selectors are plain CSS in `markup.ts` with their date; unverified items listed above.
- [x] 4. Tests first: fixtures, reader tests and task tests above; real-browser e2e: n/a, no new driver call.
- [x] 5. Build: n/a, no new task; messages stay fixed sentences, no page text in logs; the failed page goes through `keepPage`.
- [x] 6. Brain: no contract, hook or registry change (`ALREADY_CONNECTED` already exists); the sentence and index change above, tested; `registry.unit.test.ts` stays green.
- [ ] 7. Verify (not done: no signed-in browser here; the owner test and the staging run are still to do): root gate; a devtools run on the test account is not possible from here (no signed-in browser); the owner runs the invite task from `dev:record` on dharmendrashaheagle+linkedin@gmail.com against Chris Phillips, Afreen Furqan J., Danny Iny and Faisal Ahmed and the result is noted here; staging after deploy.
- [x] 8. Close: plan Outcome, `MEMORY.md`, conventional commit on a new branch from `main` (PR #224 stays separate).

## Edge cases and risks

- A Connect of a suggested person must never be pressed: only an `href` equal to the profile's own slug (or the old label rule with the full name) counts. Tested with suggested people present.
- A profile that shows Pending and also a stale Connect: Pending wins (existing order); nothing is pressed.
- The More menu is the profile's own menu, so a Connect in it is the person's; `Escape` closes the menu when no own Connect is in it (existing).
- Real connections (1st degree) that the index does not know: answered `ALREADY_CONNECTED` only when More shows "Remove connection" (unverified on a profile); otherwise `NO_CONNECT` and ended. Either way they are not asked again. If the menu word differs (another language), they end as `NO_CONNECT`: low harm.
- A 3rd-degree person is answered `NO_CONNECT` as before (40 kept pages agree).
- A LinkedIn markup change again: no own Connect is found, the page is kept and the answer is `NO_CONNECT`; the person is ended, which is why the page is kept for study. A tripwire is worth adding later: a campaign whose share of `NO_CONNECT` jumps (follow-up, not in this plan).
- Retry and idempotency: unchanged; the outcome is applied once per invite id.
- A connection that later disappears: `connectedAt` from a SKIPPED row stays until the invite row is removed (retention); the person is only left out of invites. Low risk.
- Rollback: revert the commits; no data or schema changed.
- LinkedIn rules: no new press, fewer repeated profile visits.
- Secrets and privacy: no new data leaves the spider; fixtures use made-up names and ids.
- CI and Docker: none; the spider worker image is rebuilt and restarted on deploy.

## Verification

- Unit: reader (fixtures) and task (verdicts), root gate `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Not run here: any real LinkedIn page. Owner test with the four profiles above on dharmendrashaheagle+linkedin@gmail.com, then the first staging Invite run: the invites of the campaign by state, the number of people asked twice (must be 0 for new rows), and a kept `no-connect` page if any.

## Outcome

Built on `fix/invite-connect-in-more` (not pushed). Gate green: lint, ts:check, unit (spider 1440, brain 1907, body 1214), build, integration (brain 108 files, 620 tests).

- Spider: `CONNECT_LINK` also matches the `a` Connect (2026-11-15); `parseProfileActions` takes an `a` Connect as the person's own by its `href` slug and reads the `_pending` link by address; `menuShowsConnection`; `openMenu` returns the menu's Connect links and whether the menu offers "Remove connection"; `run.ts` answers `ALREADY_CONNECTED` only on that sign, never on a Message link, and `NO_CONNECT` keeps the page. `messaged` is gone from the reader.
- Brain: `CONNECTED_REASON` for the connected answer; `peopleIndex` reads a SKIPPED row with it as `connectedAt`; old rows are untouched, so the 50 people come back.
- Checked against the real recorded pages (not committed, the recordings are ignored): Manthan's card Connect found with the right member id; Umair's Connect found only after More; his Pending found even with a different spelling of the name; More buttons found at the positions the staging runs pressed; "Remove connection" seen on the 2026-10-27 connections-list menu and absent from Umair's profile menu.
- Deviations: none from the locked plan. Unverified: a regular top card's own Connect, "Remove connection" in a connection's profile menu, the note box after the "Add a note" link (a note invite answers `NOT_SENT` and is retried at most 3 times).
- Not run: the owner's test of Chris Phillips, Afreen Furqan J., Danny Iny and Faisal Ahmed from `dev:record`, and a staging Invite run.
- Follow-ups: read the note flow and fix "Add a note"; step 3 (Discover supply); a tripwire on a jump in `NO_CONNECT` for a campaign.
