# My network filters

- Status: in progress
- Created: 2026-10-30
- Locked by user: yes, 2026-10-30 ("work on this and continue with brain development")

## Goal

Let the owner narrow a client's people on `/network` to exactly the targets they want to work: a Filters button with filters for who the person is (name, company, title, country, labels), how they are tied to the owner (connected or not, when), and when something last happened (last message, last touch), all kept in the address so a view can be reloaded, shared and exported. Related plan: `.plan/network-person-drawer.md` (row fields country, connected and Premium are shared).

## Requirements

Confirmed (owner, 2026-10-30):

1. A Filters button on `/network`, beside the existing Found by, Fit and Label selects (they stay in the toolbar).
2. Filters: name, company name, title, country, connected or not connected, last message between two dates, connected between two dates, last touch between two dates, labels (one or many), and every extra proposed below.
3. Last message is two filters: "Last message from you" and "Last reply from them".
4. Title is the current job title from a profile read (people never read do not match a Title filter; the headline is not used).
5. The tab counts keep showing the client's totals.
6. Saved filters (named views) come later.
7. The UI is designed first on sample data and shown to the owner; building starts only when the owner asks.
8. Dates use the shadcn date picker (Popover + Calendar, react-day-picker) as a range with quick choices and a from and to time.
9. The people list is a TanStack Table fed straight from brain through TanStack Query, with rows rendered by TanStack Virtual so a long list stays smooth; sorting is done by brain.

Proposed (owner to confirm with the design):

8. Filter set:

   | Group | Filter | Kind | Notes |
   |---|---|---|---|
   | Who | Name | text, contains | Separate from the search box, which keeps searching name, headline, company and profile links. |
   | Who | Company | text, one or more values, any of them | Matches the company the row shows. |
   | Who | Title | text, contains | The current job title from a profile read. |
   | Who | Country | pick one or more | Only countries that occur among the client's people are offered. |
   | Who | Premium | yes / no | Only once Premium is learnt (drawer plan). |
   | Tie | Connection | connected / not connected | With several accounts: "connected to" a chosen account. |
   | Tie | Connected between | from, to | When the connection began (the earliest active connection). |
   | Tie | Found by | as today | Stays a select in the toolbar. |
   | Tie | Invite | not invited / pending / accepted / withdrawn or ended | From the invite rows of phase 2. |
   | Activity | Last message from you | from, to | Your newest message to them, any account. |
   | Activity | Last reply from them | from, to | Their newest message to you, any account. |
   | Activity | Never messaged | yes | No conversation with any account. |
   | Activity | Reply waiting | yes | Their message is the last and unanswered (what Needs me shows first). |
   | Activity | Last touch between | from, to | The date the table shows. |
   | Activity | First seen between | from, to | When they came into My network. |
   | Work | Labels | one or many, any or all | Plus "no labels". |
   | Work | Status | one or many | New, Contacted, and the rest. |
   | Work | Fit | as today | Stays a select in the toolbar. |
   | Work | Profile read | read / not read | Whether a paid full read exists. |

9. Dates: quick choices (today, last 7, 30, 90 days, this month) or a custom from and to; either end may be empty ("since", "until"). Days are the owner's own days (the browser's timezone), sent to brain as exact instants.
10. Applied filters show as chips under the toolbar ("Country: France, Germany ×"), each removable, with "Clear all"; the button shows how many are on ("Filters · 3").
11. Filters live in the address, like the tab and search today, so reload, back and a shared link keep them; picking another client clears them (as `clientView` does now).
12. Filters combine with AND; values inside one filter combine with OR (Labels: the owner picks any or all). They apply inside the chosen tab and together with the search box.
13. Export downloads exactly what the filters show (it already takes the same query).
14. An empty result says "No one matches these filters" with Clear all.
15. The panel is a side sheet from the right (18 filters do not fit a popover), grouped Who, Tie, Activity, Work, with a sticky footer: Clear all and "Show N people" (a capped count of the matches in the chosen tab, refreshed as filters change).

Open questions (must be empty before locking):

1. The design on sample data (`/preview/network-filters`, development server only) is approved.

## Build decisions (2026-10-30)

- Filter input is one zod schema in `packages/contracts` (`peopleFiltersSchema`), used by brain's `people.list` and `people.export`; dates are exact instants (ISO), the browser turns the owner's local day and time into them.
- `Person` gains `title`, `country`, `premium` (null until the spider learns it), `profileRead`, `connectedAt`, `lastSentAt`, `lastReceivedAt` and `inviteState` (enum `PersonInviteState`: NONE, QUEUED, PENDING, ACCEPTED, ENDED), filled by the index; `PersonSnapshot` gets the index trigger so a profile read refreshes them; title, country and a missing company come from the newest paid read.
- Message times are LinkedIn's wall-clock kept as if UTC (see `LinkedInConversation`), so the two message filters can be off by the account's timezone offset.
- `people.list` pages by offset (capped at 10,000, like the counts) instead of an id cursor, because sorting by a column that can be empty breaks Prisma's cursor; it also returns `total` (capped) for the table, and takes `sort` (name, connected, last message, last touch).
- `people.filterOptions` returns the countries, the top companies and the labels of a client with how many people have each.
- Country flags: the browser maps a country name to its code with `Intl.DisplayNames` (no table to keep).

## Design preview

- Route `/preview/network-filters` on the development server (`pnpm dev`, body on port 3000), invented people, no sign-in. Built on branch `feat/network-filters-design`.
- Real pieces meant to be kept when building: `components/my-network/filters/model.ts` (the filter shape, chips, quick ranges), `fields.tsx` (text, multi-pick with search, choice, date range with quick choices), `filters-sheet.tsx` (the side sheet), `filter-chips.tsx`.
- Preview only, deleted when building: `pages/previews/NetworkFiltersPreview.tsx` (sample people and a local match standing in for brain) and its route in `App.tsx`. The route exists only on the development server; the build still emits its unreachable chunk of invented data.

## Findings so far

- Today: `filters.tsx` has the search box and three selects (Found by, Fit, Label); `address.ts` keeps `client`, `tab`, `found`, `fit`, `label`, `q`, `new`, `open` in the address; brain `people.list` input (`resolvers/people/people.ts`) takes `search`, `foundBy`, `fit`, `label`, `onlyNew`; `PeopleService.list` builds a Prisma `where` on `Person`, and `PeopleService.export` takes the same query.
- `Person` is an index row rebuilt by `peopleIndex.ts` from requests, connections, conversations, invites, lists and targets (dirty rows through `PeopleIndexDirty` and the people-index job). It has `name`, `headline`, `company`, `labels` (GIN), `foundBy` (GIN), `fit`, `status`, `lastTouchAt`, `firstSeenAt` and a `search` tsvector, but no title, country, connected date, last message dates, invite state or Premium.
- The index already reads what those need: connection rows (`connectedOn`), conversation rows (`lastMessageAt`, `lastDirection`), invite rows; the paid read's snapshot has `location` ("city, state, country") and positions; list members carry `title`.
- Search caps at 1,000 matches (`SEARCH_CAP`) and counts at 10,000 (`COUNT_CAP`); paging is by cursor.

## Scope and non-goals

- In scope: the Filters button, panel and chips; the address keys; brain filter input, its validation and the query; new `Person` columns filled by the index; indexes; Export following the filters; tests.
- Out of scope: saved views (unless question 5 says now), filters on other pages, bulk actions on "all matching" (the bulk bar still works on the chosen rows), full-text search changes.

## Approach

- [ ] Contracts: one `peopleFilterSchema` (zod) in `packages/contracts`, shared by brain's input and body's address reader: every field optional, text trimmed and capped (100 chars), lists capped (20 values), dates ISO with `from <= to`.
- [ ] Brain storage (additive migration): `Person` gains `title`, `country`, `connectedAt`, `lastSentAt`, `lastReceivedAt`, `inviteState`, `premium`, `profileRead` (names to settle with question 1); indexes `(clientId, country)`, `(clientId, connectedAt)`, `(clientId, lastSentAt)`, `(clientId, lastReceivedAt)`; the migration marks every person dirty so the index fills them (as the phase 2 migration did).
- [ ] Brain index (`peopleIndex.ts`): fill the new columns from the rows it already reads (earliest active connection, newest message each way, newest invite, newest read's country and title, Premium from the newest visit); unit tests first.
- [ ] Brain query: a pure `peopleWhere(filters, now)` that returns the Prisma `where`, unit-tested per filter and for combinations; `list` and `export` use it; text filters are case-insensitive "contains" scoped by `clientId`.
- [ ] Brain facets: `people.filterOptions({ clientId })` returns the countries, companies (top 50) and labels present, for the pickers.
- [ ] Body address (`address.ts`): read and write the filter keys (short names, repeated keys for lists, `yyyy-mm-dd` dates), unknown or invalid values dropped; unit tests.
- [ ] Body UI: `filters-panel.tsx` (popover on wide screens, sheet on narrow) grouped Who / Tie / Activity / Work, with Apply and Clear; `filter-chips.tsx`; date range picker with quick choices; the Filters button with the count; empty state.
- [ ] Docs: `MEMORY.md` entry.

## Edge cases and risks

- Invalid or tampered address values (bad dates, unknown country, from after to): dropped in the address reader and refused by brain's schema; never a crash or an empty page without explanation.
- Timezones: a day picked in the browser covers 00:00 to 23:59:59 local, sent as exact instants; staging and the owner may differ in timezone.
- Open ranges: only from or only to; "Connected between" with "not connected" chosen is a contradiction, so the panel disables the dates when Not connected is picked.
- People without the data (no country, no title, never read): they never match a value filter; the panel says "known for N of M people" where it helps.
- Several accounts: "connected" means to any of the client's accounts unless an account is chosen.
- Performance: every filter is scoped by `clientId` and uses an index or a small per-client scan; page size stays 50 with cursor paging; the search cap of 1,000 still applies when search and filters combine (the panel says when the cap is hit).
- Backfill: the migration marks all people dirty; until the index job has rebuilt them (minutes on staging), new filters can miss people. Note it in the deploy step.
- Address length: lists capped at 20 values per filter.
- Labels are lower-cased already (`tags` in the router); the label filter lower-cases too.
- Erase and Do not contact keep working: filters never show a person from another client or user.
- Rollback: the columns are additive and unused by old code.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; brain integration test of `list` with filters on a seeded client; on staging, each filter tried on the owner's client and Export compared with the page.

## Outcome

Built on branch `feat/network-filters-design` (2026-10-30); not seen in a browser behind sign-in, not deployed.

- Contracts: `peopleFiltersSchema` (+ tests). Brain: migration `20261030160000_add_network_filters` (additive: `PersonInviteState`, eight `Person` columns, four indexes, the index trigger on `PersonSnapshot`, every person marked for a rebuild); the index fills the columns (`profileFacts` reads title, company and country from the newest paid read, which now also keeps `country`); `peopleWhere` / `orderOf` (`database/peopleFilters.ts`); `people.list` takes `filters` and `sort`, pages by offset and returns `total`; `people.filterOptions`. Unit and integration tests pass.
- Body: the Filters button, side sheet (shadcn Calendar range with quick choices and times) and chips on `/network`, kept in the address (`filters`, `sort`); the people table is TanStack Table v9 (brain sorts Person and Last touch) with TanStack Virtual rows that load the next page near the end (no Load more button); company above the name, Premium mark, country flag (`lib/country-flag.ts`). The design preview page was removed.
- Deviations: the page keeps its own copy of the filter schema (contracts ship as CommonJS and would bundle all of zod; a test keeps the copies equal); zod and the date libraries have their own chunks.
- Follow-ups: Premium stays empty until the spider's profile reader learns it (needs the owner's recording; drawer plan); the deploy must run the migration, and new filters miss people until the index job has rebuilt them.
