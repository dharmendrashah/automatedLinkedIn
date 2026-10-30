# My network person drawer improvements

- Status: draft
- Created: 2026-10-30
- Locked by user: no

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
10. Remove the Fit column.
11. The drawer's profile card shows the person's real LinkedIn cover image (the banner behind the photo) instead of the plain blue strip, when it is known; the plain strip stays otherwise.

Open questions (must be empty before locking):

1. The owner is adding a few more points (pending).

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

- [ ] Drawer: make the base right drawer honour the width it is given (`components/ui/drawer.tsx` / `floatingDrawer`), and give the person drawer the whole screen minus the floating margin; check the other drawers still look right.
- [ ] Bulk bar: drop `onInvite`, its button and the bulk path in `Network.tsx`.
- [ ] Brain row fields (`people.list`, one query, no per-row lookups): `connected` (a `CONNECTION` link to any of the client's accounts), `conversationId` (newest `CONVERSATION` link), `country`, `companyUrl`, `premium`, from the stored reads; tests first.
- [ ] Storage (additive migration if columns are needed on `Person`, else read from `PersonSnapshot` and the visit data): country and company link from the newest read, Premium from the newest visit.
- [ ] Profile read keeps the company link; when the read (or a visit) finds the current company, upsert it into `LinkedInCompany` for the owner (no duplicate when it is already there).
- [ ] Spider: the profile reader learns the Premium badge from the owner's recording (follows the `spider-task-writer` skill and its checklist).
- [ ] Body row: company line on top, name with the Premium image or the LinkedIn icon and the country flag (hover: name), labels with `LabelCell`, Fit column removed, "Suggested next step", hover actions (also shown on keyboard focus and on touch screens).
- [ ] Actions wired to what exists: chat links in a new tab, the Unibox opening New message from `?to=&account=`, `InviteDialog` for one person, `person.readFull` and `companyPage.readFull` with their price confirms (the row learns the company's slug once it is saved), preview drawer, disabled Email and Phone.
- [ ] Cover: keep the cover link in the paid read's snapshot when the supplier gives it (an added JSON field) and from an account's profile visit; `people.get` returns the newest; `Cover` takes an optional image (loaded through `/cdn`), so companies and posts can use it later without change.
- [ ] Unit tests for the row rules (Send message or Send invite, Read company enabled, country to flag) and brain tests for the new fields and the company save.

## Edge cases and risks

- Send message vs Send invite: connected to one of the client's accounts and not another; the row uses "connected to any" and the chat opens on the account with the conversation. Send invite also hides while an invite is pending, on Do not contact, and when invites are not live (`INVITES_LIVE`).
- Hover-only actions are invisible on touch screens and to keyboard users: show them on focus within the row, and always on screens without hover.
- A paid action from a row is one click away: keep the confirm with the price, and stop a second click while the read runs. Read company is disabled (with the reason) until the company is saved, and a company read already done shows when it was read instead of reading again without asking.
- `/unibox?to=&account=`: the account must be one of the owner's and connected to the person; otherwise the Unibox opens normally with a short message, never a composer for someone else.
- Saving a company: only from a LinkedIn company link found by a read, never guessed from the name; a company already on `/companies` is not added twice; a person who changes job adds the new company, the old one stays.
- Premium and country are only as fresh as the last read or visit; show nothing rather than a guess.
- A cover link that has expired or fails to load falls back to the plain strip, with no broken image; the cover keeps its LinkedIn shape (wide, cropped) at every drawer width.
- Unknown or unmatched country names show no flag (the hover still says where they are, if known).
- Row buttons stop the click from also opening the drawer (as the Next step cell does).
- New tabs are plain links (`target="_blank"`, `rel="noopener noreferrer"`), so a middle click works too.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; the drawer seen in a browser.

## Outcome

Filled in when done.
