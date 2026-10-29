# Unibox: find a person fast, see who they are, write from the right account

- Status: done (browser run left to the owner)
- Created: 2026-10-29
- Reviewed: 2026-10-30 by the Sales Rep, GTM Engineer, Agency Owner and Founder reviewers, and re-checked against the code
- Locked by user: yes, 2026-10-30

## Goal

A GTM user finds the right connection in a few keystrokes, sees at once whether anyone is already talking to them and from which account, sees who they are (picture, title, full profile on demand) without leaving the chat, and writes from the right account. Pressing Message on a connection opens the chat directly. One search box, one way to open a person, the same status words everywhere.

## What exists (read from the code, 2026-10-30)

- New message popup `apps/body/src/components/unibox/new-message.tsx`: a `Dialog` (`sm:max-w-xl`), one search box, a cmdk list. Each row: avatar pair, name, time, headline and last message (both `truncate`), account chip, state chip. The row content is wider than the dialog, so text runs past the right edge (screenshot 2026-10-29).
- `newMessage.ts` `connectionEntries`: states NEEDS_REPLY ("Needs reply"), WAITING ("Waiting for their reply"), TALKED ("Done"), NEW ("New conversation"), BLOCKED ("Do not contact"); the state is worked out in the page from the Unibox list it has loaded.
- Brain `LinkedInConnectionService.recipients(userId, query)`: every word in the name, title or profile address; one row per account and person; at most 200, ordered by account then position, so with no query one account can fill the list. No total.
- Unibox account picker `components/unibox/account-picker.tsx`: several accounts at once and saved sets ("Sets", kept on the device). The popup does not use it.
- Composer `components/unibox/composer.tsx` already says "Replying as <account> to <person>".
- Person drawer of /profiles and lists: `DetailDrawers` and `components/people/person-view.tsx` (`PersonView`), opened by `useDetailDrawer` (`?person=<slug>`), filled by `person.detail` (`PersonService.detail`), which answers only for a person in /profiles or a list. Its picture is the full profile's photo only. `ReadButton` shows "Read full profile · about $X" and reads on one click, no confirmation; a do-not-contact person gets no button.
- Unibox details sheet `components/unibox/details-panel.tsx`: participants, a link out, the account, the same person in other accounts.
- A conversation begun by a first message names the person by LinkedIn's member id (`/in/ACoAA...`); the slug is only on the first message's `recipientSlug`. Such conversations show initials in the list and header although the connection read has a picture.
- Connections page Message (`messageAction`): `/unibox/<conversationId>` when the account talks with the person, else `/unibox/new?account=<id>&to=<slug>`, which opens the popup with the slug typed in.

## Design

### 1. New message popup

Top to bottom:

1. Header "New message", close button.
2. One search box: "Search by name, title or company" (company is matched in the title, e.g. "Founder at Acme"; brain has no separate company field).
3. One filter row:
   - **Accounts**: the Unibox's own account picker (several accounts, saved sets). It starts on the accounts the Unibox is showing, or on the account of the open conversation, and keeps the last choice while the tab is open. Hidden when the owner has one account.
   - **Status**: All, Needs your reply, Waiting on them, Talked before, Never messaged. One choice.
   - "Clear" when a filter is on.
4. A count line: "1,240 people" when everything is listed, or "1,240 people. The first 200 are shown; type a name to find anyone."
5. The list, one flat list: Needs your reply first, then Waiting on them and Talked before by the newest message, then Never messaged by name, then do-not-contact last. Each row:
   - Avatar pair (person and account), name, time of the last message.
   - Title, up to 2 lines; last message, up to 2 lines ("You: " when it was ours). Nothing runs past the edge.
   - Account chip on every row whenever more than one account is in the list (the same person on two accounts is two rows, one per account, so the owner picks who writes), and the status chip.
   - "Also talking from <account>, 3 days ago" under the row when another account of the owner has a conversation with the same person, so a prospect is not written to twice.
   - Do-not-contact rows: greyed out, not pickable, "You chose not to message them".
6. Empty states with one sentence and a "Clear filters" button ("No one is waiting for your reply on these accounts.").

Brain does the filtering, the status and the order, so the 200 limit never drops someone who needs a reply: `unibox.recipients({ query, accountIds?, status? })` returns `{ people, total }`. Each person carries `status` (from the account's conversation with them: `waitingSince` set means needs your reply, our last word means waiting on them, else talked before; no conversation means never messaged), `lastAt`, `lastText` (short), and `alsoWith` (the owner's other accounts that have a conversation with the same person, with the time). The page only shows it, so the status is right for old conversations too.

### 2. Message from the Connections page opens the chat

- `/unibox/new?account=<id>&to=<slug>` is "open this person": the page asks brain for that exact account and person, then opens their conversation, or a new one with their name and picture, as picking them in the popup does. The address becomes `/unibox/<id>` (replaced, so Back goes to the Connections page; a reload keeps the chat). The composer gets the focus and its "Replying as <account> to <person>" line shows the account.
- While it looks, the chat pane says "Opening the chat with Marta...". No popup flash.
- Not found for that account, or on the do-not-contact list: a toast that names the account ("Marta is on your do-not-contact list.", "Marta is not a connection of <account> any more.") and the popup opens with the name searched.
- `/unibox/new` with no `to` (New message button, `c`) opens the popup.

### 3. Pictures everywhere

- A conversation whose person has no picture gets the picture of the stored connection of that account (by profile address, or by the first message's `recipientSlug`), in the Unibox list, the header, the popup and the person drawer. A picture the inbox read gave is kept. A picture that no longer loads falls back to initials (`Photo` and `Picture` already do).

### 4. The person, in the chat

- In the conversation header, the person's avatar and name: hovering (about 400 ms, not on touch screens, also on keyboard focus) shows a small card with picture, name, title, "Connected to <account>" and, when other accounts talk with them, "Also talking from <account>". The card has "View profile". The card never offers anything that costs money.
- Clicking the avatar or name, or "View profile", opens the person drawer (the same `PersonView` as /profiles) docked beside the chat; the composer and the draft stay; Esc closes it.
- The drawer for a connection or chat contact: picture (connection's when no full profile), name, title, connected since and through which accounts, the lists they are in by name with the reason found (as /profiles shows), do-not-contact. With no full profile stored it offers "Read full profile · about $X"; in the Unibox the first press asks once: "Read Marta's full profile for about $X? It adds about, experience, education and skills." (Read, Cancel). A read already stored says "Read on <date>" with "Read again"; a read in progress says so and is not charged twice.
- The Unibox details sheet stays as it is; its participant names open the person drawer.
- No slug known for the person: the name links out to LinkedIn only.

## Requirements

Confirmed by the user:

- Filters, name search and wrapping in the New message popup; simple and clean for GTM use (2026-10-29).
- Search matches name and title (2026-10-29).
- Filters: account and status (2026-10-29).
- Do-not-contact people stay in the list, last and greyed out (2026-10-29).
- One flat list with a status chip on each row; no group headings (2026-10-29).
- Hover shows a small card; a click opens the full person drawer (2026-10-29).
- The Unibox details sheet stays; the person drawer is added beside it (2026-10-29).
- The drawer always offers Read full profile when none is stored, as on /profiles, for connections and chat contacts (2026-10-29).
- A person's picture shows everywhere it is known (2026-10-29).
- Message on a Connections page opens the chat directly, never the popup (2026-10-30).

Changed after the review (confirmed by the user, 2026-10-30):

1. **No separate "Title or company" box.** The one search box already matches the title, where the company is; two boxes made all four reviewers stop and ask which to use. (You picked the separate box on 2026-10-29.)
2. **Status worked out in brain**, with the filter and order there, so "Needs your reply" is never wrong or cut off by the 200 limit.
3. **"Also talking from <account>"** on popup rows and in the hover card, so a prospect is not written to from two accounts.
4. **Account filter = the Unibox account picker** (several accounts and saved sets, starts on what the Unibox shows), not a one-account chip.
5. **Status words**, the same in the popup chips, the filter and the hover card: "Needs your reply", "Waiting on them", "Talked before", "Never messaged", and "You chose not to message them" for do-not-contact. The Unibox list keeps its own words ("Needs reply", "Replied") unless you want those changed too.
6. **One confirmation before a paid read in the Unibox**, with the price and what it adds. /profiles stays one click.
7. **Hover card only in the conversation header** (and the details sheet names), not on list avatars or group sender names.
8. Cut: the match highlight and the keyboard hint footer.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: the popup, `unibox.recipients` (filters, status, total, order, `alsoWith`), opening the chat from a Connections link, pictures from the connection reads, the hover card and person drawer in the chat, `person.detail` for connections and chat contacts, the read confirmation in the Unibox, tests.
- Out of scope: sending to several people at once, a "client" concept or charging a read to a client (a read is charged as on /profiles today), hiding other accounts in the drawer for screen sharing, loading more than 200 in the popup, the Connections page itself (its links stay).

## Approach

- [x] Brain, test first (integration): `recipients` with `accountIds`, `status`, `total`, `alsoWith`, the order (needs your reply first, then by newest message, never messaged by name), the 200 limit after the filter; owner scoping; an old conversation still gets its true status. Then the service and the router (`{ people, total }`).
- [x] Brain, test first: `recipient({ accountId, slug })` (exact match, or reuse `recipients` with an exact filter) for the Connections link.
- [x] Brain, test first (integration): conversation pictures from the connection (profile address and `recipientSlug`), a stored picture kept, another owner's connection never used; one query per page of conversations.
- [x] Brain, test first (integration): `person.detail` for a connection-only and a conversation-only person (accounts, connected since, picture, lists, do-not-contact), a stranger still not found, /profiles and list answers unchanged; `person.readFull` queues one read for a connection-only person (twice pressed is one read) and refuses a do-not-contact one.
- [x] Body, tests first (unit): status words and chips, `alsoWith` line, the account picker start choice, the Connections address resolving to the exact person, its fallbacks, `personSlugOf` (profile address, member id with `recipientSlug`, none).
- [x] Body: popup layout, filter row with the account picker, count line, wrapping (`min-w-0`, `break-words`, `line-clamp-2`), empty states; keyboard (arrows, Enter, Esc, focus in search) still works.
- [x] Body: Connections link opens the chat, loading line, focus on the composer.
- [x] Body: hover card in the header and the details sheet names; `PersonView` docked beside the chat; the read confirmation in the Unibox; the connection's picture in the drawer.
- [ ] A run in the browser on local data with three accounts (needs the owner: the local app asks for an authentik sign-in). Definition of done, `MEMORY.md` and PR done.

## Edge cases and risks

- Wrong account: the same person on two accounts is two rows with account chips; the Connections link opens the account it came from; the composer names the account.
- Double touch: `alsoWith` warns; nothing is blocked (the owner may mean it).
- Over 200 matches: the count line says so; needs-your-reply people come first, so they are never the ones cut.
- Status for a conversation brain has but the page has not loaded: brain decides, so it is right.
- One account: no account filter and no account chip.
- Long names, other scripts, emoji: wrap with `break-words`.
- Typing fast: the 200 ms wait and the stale-answer guard stay; a filter change searches at once.
- Old page and new brain in a rolling deploy: `recipients` output changes shape, so body and brain ship in the same release (they do, one deploy).
- Connections link: exact account and slug only, never a `contains` match; another owner's account id finds nothing and falls back to the popup; a failed call falls back with the error sentence.
- Pictures: LinkedIn picture addresses expire; initials show when one does not load.
- Hover: not on touch, not while selecting text; reachable by keyboard; `?person=` does not clash with `/unibox/new` or the conversation id.
- Money: hover and opening the drawer never cost; a read is one confirmed press, queued once per person; do-not-contact never offered a read.
- Privacy: only the owner's data; nothing fetched from LinkedIn unless the owner confirms a read.
- No migration. An index on `LinkedInConnection (userId, name)` only if the query is slow on real data.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; brain integration tests for `recipients`, pictures and `person.detail`.
- In the browser, local data, three accounts: each filter and the account sets, search by name and by company, a long title wraps, a needs-reply person far down the alphabet shows first, Message from a Connections page opens the chat, the hover card and the drawer, a confirmed read, keyboard only.

## Outcome

Shipped on branch `feat/unibox-find-person`:

- Brain `unibox.recipients({ query, accountIds?, status? })` answers `{ people, total }`: each person carries `status` (NEEDS_REPLY, WAITING, TALKED, NEVER from the account's conversation: last word theirs and not closed, ours, else talked), `lastAt`, `lastText` (200 characters), `lastMine`, `alsoWith`. Filtered and ordered (do-not-contact last, needs reply first, then newest, then never messaged by name) before the 200 limit, over at most 20,000 matching connections. `unibox.recipient({ accountId, slug })` is the exact lookup.
- Brain conversations (`list`, `get`) carry `contactSlug` and the connection's picture when the read gave none (`conversationPeople.ts`, one query each).
- Brain `person.detail` knows connections and chat contacts (`personContacts.ts`: `connections` and `conversations`, with the account name); the paid read is allowed for them (`personWanted` in `dataReads.ts`) and retention keeps their full profile while they are a connection or in a conversation (added: without it a paid read would have been deleted at the next retention run).
- Page: the popup (one search, the Unibox account picker, a status filter, count line, wrapping, `Also talking from`), a Connections link opens the chat directly with the composer focused (`directOutcome`), the hover card (`person-card.tsx`) and the `/profiles` person drawer, non-modal, in the Unibox, with a confirmation before a paid read there (`ReadButton` `confirm`).

Deviations:

- No `personSlugOf` in the page: brain gives `contactSlug`, so the page needs no rule of its own.
- The drawer is the existing non-modal floating drawer (`docked`), not a new grid column: the chat stays usable but its right part sits under the drawer on narrow screens.
- Waiting on them and Talked before share a rank and are ordered by the newest message, as planned.

Not verified: the page in a browser (sign-in needed), live data with several accounts. The nine local integration failures (task dispatch, sign-in check, queue count) come from the accounts' working hours at night and a running local worker, not from this change.
