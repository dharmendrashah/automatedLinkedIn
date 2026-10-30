# My network person drawer improvements

- Status: done
- Created: 2026-10-30
- Locked by user: yes, 2026-10-30 for phase A ("work on this plan"), phase B ("continue with phase B") and phase C (owner's answers, see "Phase C, locked")

## Goal

Make the people list on `/network` the place where the owner works each person: every row carries its own actions (message, invite, read the profile, read the company, open the chats, preview), shows more of who the person is (company, Premium, country, labels), and the preview drawer is wide enough to read.

## Requirements

Confirmed (owner, 2026-10-30):

1. The drawer is too small; make it as wide as possible.
2. Remove the Invite button from the bulk bar. Keep everything else on the bar: the count, Set status, Label, Add label, Do not contact and Clear.
3. Row actions, as icon buttons shown only while the mouse is over the row (no "⋯" menu):
   - Send message: for a connected person, opens the chat in a new tab: their newest conversation, or, when there is none, the Unibox's New message already addressed to them (the Unibox learns `/unibox?to=<slug>&account=<accountId>`). For someone not connected, the button is Send invite instead (LinkedIn allows only InMail to them).
   - Read profile: the paid full read (`person.readFull`), with the price confirmed first.
   - Read company: the paid company read from the data supplier (`companyPage.readFull`, the same read `/companies` offers), with the price confirmed first; enabled once the company is saved to `/companies` (see 6). No account visit.
   - Show chats: opens the person's newest conversation in the Unibox in a new tab.
   - Quick preview: opens the drawer as today.
   - Email and Phone: disabled, "Coming soon".
4. Clicking the row still opens the drawer.
5. Keep the Next step, renamed "Suggested next step".
6. Company: show the company name on top of the person cell wherever it is known. Where it is not known, the row offers Read profile. Once a profile read finds the person's current company, that company is saved to `/companies` (the `LinkedInCompany` list) and shown there.
7. Premium: the orange LinkedIn mark (`apps/body/src/assets/linkedin-premium.png`, added by the owner) instead of the plain LinkedIn icon. Premium is learnt when an account visits the profile; the owner will record a Premium member's profile for it.
8. Country: a flag next to the person's name (no new column), with the country name on hover (France: the French flag, "France"); nothing until a profile read gives the country.
9. Labels on the row, added and removed from the row itself.
10.   Remove the Fit column.
11.   The drawer's profile card shows the person's real LinkedIn cover image (the banner behind the photo) instead of the plain blue strip, when it is known; the plain strip stays otherwise.

Open questions (must be empty before locking):

- None for phase A. Phase B needs a decision (see Phases): may one paid profile read run on staging to see which fields the data supplier sends for the company link and the cover? Phase C waits for the owner's Premium recording.
- Phase C (2026-10-30): settled by the owner, see "Phase C, locked".

## Phase C, locked (2026-10-30)

The owner: profiles are never read in the browser; every profile fact comes from the data service's paid read, and its value is final. So the spider does not learn Premium (the findings below are kept only as a record), and Premium on the row already comes from the read (phase B). What remains:

- The snapshot also keeps the read's `verified` and `creator` (booleans; missing from older reads, shown as nothing).
- The drawer's badges under the name show, beside Open to work and Hiring: Premium (the orange mark), Verified, Creator, and the country (flag and name), each only when the read says so.
- Verified against the owner's exported read (2026-10-30): `premium`, `verified`, `creator`, `hiring`, `openToWork` are booleans and `country` is a name ("India").
- Not done: `influencer` and `openProfile` (not asked for).

## Phase C, findings (2026-10-30, superseded by "Phase C, locked")

Checked every kept page under `apps/spider/.devtools-recordings` (structure only, no names kept):

- The profiles visited today (`session-2026-10-30T09-22-58-429Z`, `…09-45-48-912Z`) and on 2026-10-27 have no Premium mark in the top card: the name block is the verification trigger (`ProfileVerificationTriggerRef-<slug>`, `h2` and an unlabelled `svg`), then the pronouns and "· 2nd". So none of those members is shown as Premium, and the top card's Premium shape is still unseen.
- Wherever LinkedIn does mark a member as Premium (feed post authors, the invitations list, the "Explore Premium profiles" box, a profile's side lists), it is the same shape: a link to `/in/<slug>/` with `span[role="img"][aria-label="Premium"]` inside it. The label is the brand name in the English pages seen; other languages are unseen.
- The network data of a visit holds `premiumSubscriber` only for the signed-in account itself (`voyager…Me`), never for the member visited.
- Proposed (to confirm): `linkedin-view-profile` reads the top card after it lands and reports `premium` (true when the top card holds the mark, false when the top card was found without it, nothing when no top card was read); brain's visit hook keeps it and the index fills `Person.premium` from the newest of the paid read and the visit. Not built until a Premium top card is recorded.

## Phase B, verified (2026-10-30)

One live full-profile read (`operations.live.test.ts`, owner's go-ahead "continue with phase B", cost $0.004, names only logged) showed the data service's fields:

- profile: `about, causes, certifications, city, connections, country, courses, coverPhoto, creator, education, experience, firstName, followers, handle, headline, hiring, honorsAndAwards, influencer, languages, lastName, openProfile, openToWork, patents, photo, premium, profileId, profileUrl, projects, publications, receivedRecommendations, skills, state, verified, volunteering`
- each position: `companyId, companyLinkedinUrl, companyLogo, companyName, description, durationMonths, employmentType, endDate, location, position, startDate, workplaceType`

Decisions that follow:

- The cover is `coverPhoto`; the company link is the current position's `companyLinkedinUrl` (kept only when it parses as a LinkedIn company link).
- `premium` comes with the paid read, so Premium no longer waits for the spider: the row shows the Premium mark after a profile read. The spider (phase C) only adds it for people who were never read.
- The snapshot keeps `cover`, `premium` and each position's `companyUrl` (added JSON fields; older reads simply lack them). `Person` gains `companySlug` (additive migration), filled by the index with `premium` from the newest read.
- When a read is stored and the current position has a company link, that company is added to `/companies` (`createMany` with `skipDuplicates`): never twice, an archived one stays archived, a name is filled only where none was set.
- Read company is enabled when the row has a `companySlug`; it opens a dialog with the price (`companyPage.detail`) and runs `companyPage.readFull`. An archived company says "Restore the company on Companies first" (brain already refuses it).
- `Cover` takes an optional image loaded through `/cdn`; the plain strip stays when there is none or it fails to load.

## Phases

Verified against the code on 2026-10-30 (after the filters work, PR #142):

- Already shipped by the filters work: the company line on top of the person, the Premium mark slot and the country flag with its name on hover (`people-table.tsx`, `lib/country-flag.ts`); `Person` has `country`, `title`, `premium`, `connectedAt`, `inviteState`.
- Drawer width: only `person-drawer.tsx` and `details/detail-drawers.tsx` pass a bare `sm:max-w-3xl`, which loses to the base `data-[vaul-drawer-direction=right]:sm:max-w-sm`; the account, job, proxy and session drawers already pass the prefixed class and are fine. The fix is the prefixed class in those two callers, not a change to the shared base.
- Connected: `row.connectedAt !== null` (any of the client's accounts). Conversations: `CONVERSATION` links carry the conversation id as `sourceId` and the account as `accountId` (`peopleIndex.ts`); the row's links do not carry their time yet, so brain adds `at` to the row's links to pick the newest.
- The Unibox already opens a message to one person from its address: `/unibox/new?account=<accountId>&to=<slug>` (`unibox/address.ts`, `directOutcome` handles "not found" by opening a search). No Unibox change is needed.
- Read profile: `person.readFull({ slug, clientId })`; its price comes with `person.detail` (`readPriceMicros`), and `ReadButton` (`details/detail-parts.tsx`) already asks before paying.
- The "Messaged · 20756 days ago" reason: `peopleIndex.ts` falls back to `new Date(0)` when a conversation has no message time; it must fall back to when the conversation was first seen.

Earlier notes:

- **A — build now** (everything here is confirmed and uses data brain already has): drawer width, bulk bar without Invite, Fit column removed, "Suggested next step", labels on the row, hover actions (Send message or Send invite, Read profile, Show chats, Quick preview, Email and Phone disabled), Read company shown but disabled until phase B, and the "20756 days ago" reason bug.
- **B — after one verified read**: keep the current company's LinkedIn link and the cover image from the paid read, save that company to `/companies`, enable Read company, and show the cover in the drawer. Raw supplier rows are never stored (only the allow-listed snapshot), so the field names are not known from the code; they are read once from a real read before building, never guessed.
- **C — after the owner's recording**: the spider's profile reader learns Premium (`spider-task-writer` skill); `Person.premium` is filled from it. Until then no row shows the Premium mark.

## Findings so far

- The drawer asks for `sm:max-w-3xl` (`floatingDrawer('sm:max-w-3xl')`), but the shadcn base in `components/ui/drawer.tsx` sets `data-[vaul-drawer-direction=right]:sm:max-w-sm`. `cn` (tailwind-merge) keeps both because the variants differ, and the data-attribute one wins, so the drawer stays about 384 px wide. The same applies to every drawer built with `floatingDrawer` (accounts, sessions and others).
- The bulk Invite is `onInvite` in `components/my-network/bulk-bar.tsx`, passed from `pages/Network.tsx` (`setInviting(shownChosen)`, only while invites are live). Removing it means dropping that prop and its button; `InviteDialog` already takes a list and stays for the single invite. Brain's `people.invite` keeps accepting a list (no back-end change).
- What a row (`people.list`, `people.service.ts`) has today: `id`, `slug`, `name`, `headline`, `company` (text), `photoUrl`, `status`, `labels`, `fit`, the reason, `priority`, `lastTouchAt`, `doNotContact` and `links` (`kind`, `accountId`, `sourceId`). Not there: company link, Premium, country, email, phone, conversation id.
- Connected: a `CONNECTION` link on the row (`PersonLinkKind`). Chats: a `CONVERSATION` link; its `sourceId` should be the conversation id (to confirm in `peopleIndex.ts`), so Show chats may need no new query.
- Messages: `unibox.send` (an existing conversation) and `unibox.start` (`accountId`, `slug`, `text`; connections only), both queued; the drawer's `ChatPane` already does both.
- Labels: `LabelCell` (`tags`, `kind`, `name`, `save`) already works inline and saves through `people.update({ id, labels })`; the drawer uses it.
- Profile read: `person.readFull` (paid, confirm with the price) in `PersonView`. Its snapshot keeps `location` ("city, state, country") but drops contact details on purpose (`snapshotFrom`), so email and phone stay "coming soon".
- Companies: `linkedInCompany.create` takes LinkedIn company links. The paid company read already exists: `companyPage.readFull({ slug })` (`resolvers/page/page.ts`, `CompanyPageService.readFull`, data wallet, `DataReadService`), only for companies already in the owner's `/companies`; the row reuses it and its price confirm.
- No Premium icon, no country helper in body yet.
- The paid read's snapshot (`core/personSnapshot.ts`, `snapshotFrom`) keeps each position's company name but not its LinkedIn link, and its `location` is "city, state, country". To save a company from a read, the snapshot must also keep the current company's link (an added JSON field, so older snapshots simply lack it). Whether the supplier's row carries that link must be checked against a stored raw row before building; if it does not, the company is saved only when an account's profile visit (`linkedin-profile`, whose experience carries `companyUrl`) finds it.
- A country flag comes from a country name: needs a small name-to-code table (no new dependency) and an emoji flag.
- Cover image: the drawer's Profile tab (`PersonView`) draws `Cover` from `details/detail-parts.tsx`, a plain gradient strip with no image. The paid read's snapshot keeps `photo` but no cover; whether the supplier's row carries one must be checked against a stored raw row (as for the company link). The spider's profile reader already reads `coverUrl` from the top card (`parseTopCard`), so an account's profile visit can supply it. Pictures from LinkedIn go through brain's `/cdn` (`useMediaSource`), as photos do.

## Scope and non-goals

- In scope: the drawer width (every `floatingDrawer` drawer), the bulk bar without Invite, the hover actions, the renamed Suggested next step, company, Premium, country flag and labels on the row, Fit removed, saving the company found by a read, Premium learnt by the spider's profile reader, and the brain row fields behind them.
- Out of scope: finding email and phone (buttons only), InMail, a new data supplier, bulk versions of the new actions, back-filling company links for profiles read before this change.

## Approach

Phase A:

- [x] Brain: the row's links carry `at`; the reason of a conversation without a message time falls back to when it was first seen (`peopleIndex.ts`), with a unit test; a migration marks the people whose reason date is 1970 for a rebuild.
- [x] Body, pure rules (`my-network/row-actions.ts`, tests first): `messageAction(row, invitesLive)` answers OPEN_CHAT (newest conversation id), START_CHAT (account and slug) or INVITE or none; `chatLink`, `newMessageLink`; `readCompanyState` (disabled with its reason until phase B).
- [x] Body, row: Fit column out; "Suggested next step"; labels with `LabelCell` on the row (saves through `people.update`); hover actions cell; Read profile opens a small confirm dialog that loads `person.detail` for the price and runs `person.readFull`.
- [x] Bulk bar: drop `onInvite` and the bulk invite path.
- [x] Drawer: the prefixed width class in `person-drawer.tsx` and `detail-drawers.tsx`, as wide as the screen allows minus the floating margin.
- [ ] Definition of done, `MEMORY.md`, plan Outcome; seen in a browser on staging after deploy.

Phase B (after the decision above): keep the company link and the cover in the snapshot (fields named from the real read), `LinkedInCompanyService` upsert from a read, `people.list` carries the company slug, Read company enabled, `Cover` takes an image through `/cdn`.

Phase C (after the recording): Premium in the profile reader and `Person.premium` from it.

## Edge cases and risks

Send message, Send invite, Show chats:

- Several accounts: a conversation on any account opens the newest one; no conversation and connected on several accounts starts the message from the account of the newest connection.
- Connected but the account was removed from the client or signed out: the link still opens the Unibox, which says the account cannot send; no message is sent from the row itself.
- Not connected: Send invite only while invites are live (`INVITES_LIVE`), not on Do not contact, not while an invite is queued or pending (`inviteState`), and only with an account to send from; otherwise no button, and the hover title says why ("Invite already pending", "On Do not contact").
- Do not contact: no Send message and no Send invite; Show chats still opens an existing conversation (reading is allowed).
- The person has no slug-based profile link (a conversation whose contact link is a member id): Send message opens the conversation if there is one, else no button.
- A conversation that was deleted since the list loaded: the Unibox shows its own "not found"; the row does not check first.
- New tabs are plain links (`target="_blank"`, `rel="noopener noreferrer"`), so middle click and copy link work; nothing is opened by script, so pop-up blockers do not apply.

Read profile (paid):

- Never one click: the dialog shows the price and what it adds, and the read starts only on its button; Escape or Cancel pays nothing.
- A read already running ("Reading…"), a read done before ("Read again" with the date), a wallet below the floor, a refused read (`ConflictError` sentence) and a person on Do not contact (no button) all come from the existing read service and are shown as they are in the drawer.
- Double click on the dialog's button sends one read (the button is disabled while pending, and brain answers a running read instead of starting a second).
- After a read the row learns title, country and company through the index job (seconds to a minute); the row does not pretend it changed before then.

Read company:

- Phase A shows it disabled with "Read the profile first" when the company is unknown, and "Coming soon" when it is known by name only; it never reads a company guessed from a name.

Labels on the row:

- Adding a label that exists on another person reuses it (lower-cased, trimmed, as `people.update` already does); an empty or too long label is refused by the same rules; a failed save shows the error and keeps the old labels.
- Clicks in the labels cell never open the drawer.

Hover actions:

- Shown on row hover, on keyboard focus inside the row (`focus-within`) and always on screens without hover (`@media (hover: none)`), so touch and keyboard users can reach them.
- Every button has an accessible name and a tooltip; disabled buttons say why.
- The row's keyboard shortcuts (J/K/Enter) keep working; Enter on a focused action button runs that button, not the row.
- Virtual rows: actions live in the row, so they scroll and recycle with it; nothing is kept per row outside React state.

Drawer:

- As wide as the screen allows minus the floating margin; on a phone it is the full width as today.
- The account, job, proxy and session drawers keep their widths (they already pass the prefixed class).

Bulk bar:

- Without Invite the bar still shows count, Set status, Label, Add label, Do not contact and Clear; inviting several people is no longer offered anywhere (one person at a time from the row or the drawer).

Data and safety:

- No new endpoint; all actions use existing, owner-scoped procedures (`people.update`, `person.readFull`, `person.detail`) and links.
- Nothing irreversible happens from a hover button except the paid read, which asks first.
- The reason-date fix only changes a person when the index rebuilds it, so a small additive migration marks every person whose reason date is 1970 for a rebuild; nothing else is touched.

Phase B, kept for later:

- Saving a company: only from a LinkedIn company link found by a read, never guessed from the name; a company already on `/companies` is not added twice (same slug), an archived one is not brought back without the owner; a person who changes job adds the new company and the old one stays.
- A cover link that has expired or fails to load falls back to the plain strip, with no broken image; it keeps its LinkedIn shape (4:1, cropped) at every drawer width.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; the drawer seen in a browser.

## Outcome

Phase A built on branch `feat/network-row-actions` (2026-10-30); lint, type check, unit tests (contracts 229, body 881, spider 1353, brain 1584), build and the people integration tests pass. Not seen in a browser yet (no local brain running); check on staging after deploy.

- Row actions (`row-actions.ts` rules, `row-actions-cell.tsx`): Message opens the newest conversation or `/unibox/new?account=&to=` (the Unibox already supported it), Invite for someone not connected, Read profile through `ReadProfileDialog` (price first), Read company disabled with its reason, Show chats, Quick preview, Email and Phone disabled. Shown on hover, focus and on screens without hover.
- Labels edited on the row; Fit column removed; "Suggested next step"; bulk Invite removed.
- Person drawer full width minus the margin (`FULL_WIDTH` in `floating-drawer.ts`); the details drawer's `sm:max-w-3xl` now takes effect.
- Brain: message times before LinkedIn's launch (the reader's 1970 for a missing time) are treated as unknown in the index; migration `20261030170000_rebuild_people_dated_1970` marks those people for one rebuild. Row links carry `at`.
- Phases B and C: not started (decision on one paid read; the Premium recording).

Phase B built on branch `feat/network-company-cover` (2026-10-31), on top of phase A (merged as PR #143 and deployed):

- Snapshot keeps `cover` (`coverPhoto`, https only), `premium` (boolean only) and each position's `companyUrl` (`companyLinkedinUrl`, only a LinkedIn company link, canonical lower-case); `profileFacts` gives `companySlug` and `premium`.
- Migration `20261031090000_add_person_company_slug` (additive); the index fills `companySlug` and `premium` from the newest read, so the row's Premium mark works after a read without the spider.
- A stored profile read saves the current company to `/companies` (`LinkedInCompanyService.saveFound`: once, archived stays archived, a name only where none); integration test `dataReads.integration.test.ts`.
- Read company opens `ReadCompanyDialog` (price first, archived company refused); `ReadProfileDialog` and it share `PaidReadDialog` (`read-dialogs.tsx`).
- The drawer's profile card shows the cover through `/cdn`, the plain strip otherwise.
- Phase C (spider Premium for people never read) stays open; the owner's recording is still needed only for that.

Phase C built on branch `feat/network-profile-badges` (2026-10-31), redefined by the owner: no spider work, the paid read is the only source.

- Snapshot keeps `verified` and `creator` (booleans only; older reads lack them).
- The person drawer's badges show Premium (the orange mark), Verified, Creator and the country (flag and name) beside Open to work and Hiring.
- Owner's follow-up (same PR): the person drawer is 60% of the screen wide (`WIDE`, replaces `FULL_WIDTH`), and the badges (`ProfileBadges`) also show in the drawer's header beside the status.
- Lint, type check, build and unit tests (contracts 229, body 881, spider 1353, brain 1586) pass. Not seen in a browser; a read made after the deploy shows the new badges.
