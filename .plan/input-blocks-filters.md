# Input blocks that pick with the page filters, a time frame and a limit per run

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-02
- Locked by user: yes, 2026-11-02 (five answers below); built on `feat/input-blocks-filters`, one commit per phase

## Goal

The three input blocks (Posts, Profiles, Companies) pick from the owner's data with the same filters the owner has on `/posts`, `/network` and `/companies` (including the drawers), a time frame with "from" and "to" and quick options (Today, Last 7 days, Last month, ...), and a limit for how many to take in one run.

## What exists today (checked in the code, 2026-11-02)

- Input blocks live in `packages/contracts/src/workflow.ts` (`input.posts`, `input.profiles`, `input.companies`) and share `inputPickSchema`: `added` (Any time, Today, This week, Last 7 days, Last 30 days, Since this workflow's last run), labels (with / without, any or all), `statuses` (New, Contacted, Replied; not posts), `order` (newest or oldest), `howMany` or `all` (caps 50 posts, 200 profiles, 100 companies, `INPUT_MAX`).
- They pick from the owner's saved lists, not from My network: Profiles reads `/profiles` (`LinkedInProfile`), Companies reads `LinkedInCompany`, Posts reads `LinkedInPost` that are not done yet. `InputPickService` + `inputWhere` (`database/linkedInRecord.ts`) build the query; `workflow.inputMatches` (`input-matches.tsx`) shows the live count.
- The pages have many more filters, each with its own plumbing:
   - **My network** (`PersonFilters`, contracts `peopleFilters.ts`, Prisma conditions in `database/peopleFilters.ts`, drawer `my-network/filters/filters-sheet.tsx`): name, companies, job title, countries, skills (all or any), premium, connection (connected, not, discovery), connected to an account, connected between, invite states, last message sent and last reply received between, never messaged, reply waiting, last contact between, first seen between, labels (any or all, none), statuses, profile read, plus the tab, found by, fit and client.
   - **Companies** (`CompanyFilters`, SQL in `database/companyFilters.ts`, drawer `companies/filters/company-filters.tsx`): saved ideal customer, size bands, founded range, headquarters and offices, categories, team (department, skill, location, service, school, field with a minimum), specialities (all or any), words in the page text, read age, visited age, notes, employees and followers ranges, verified, active, showcase, has website, has jobs, plus status, labels, added, industry and country.
   - **Posts** (`postList.ts`): search, read or not, labels, added, status tab, sorts (added, posted, comments, qualified).
- Dates: My network filters are `from` and `to` instants (`dateRangeSchema`); the input blocks only know the fixed windows above.
- Block settings hold plain values only (`string`, `number`, `boolean`, `string[]`). A nested setting is kept as one JSON text (the Write a post block does this with `config.post`).
- A saved block never changes behaviour: a changed setting raises the block's `version` and adds a `migrate` step.

## Proposal

### 1. Time frame ("When")

One control on each input block, replacing "Added":

- **Date to look at** (what the range is about):
   - Posts: Added to my posts, Posted on LinkedIn.
   - Profiles (My network): First seen, Last contact, Connected, Last message sent, Last reply received.
   - Companies: Added, Last read.
- **Range**: Any time, Today, Yesterday, This week, Last 7 days, This month, Last 30 days, Last month, Last 3 months, Since this workflow's last run, Custom (from and to).
- Quick options are resolved when the run starts, in the time zone saved on the block (as the Schedule block does), so a daily workflow always means "the last 7 days from today". A custom range is fixed dates, and the block says so ("fixed dates: a scheduled run will keep using them").
- "To" includes the whole day. An empty "from" or "to" is open ended.
- Old `added` values map to the same ranges, so saved blocks run as before.

### 2. Limit per run

- "How many" stays, with quick options 10, 25, 50, 100, 200, 500 and "All that match, up to the cap".
- The caps stay as today (posts 50, profiles 200, companies 100; `INPUT_MAX`), so one run never takes more than it does now. "All that match" takes up to the cap, and the live count says when more match than the block takes. The estimate stays "up to".
- Order: Newest first, Oldest first (as today); for My network also Last contact (oldest first, to reach the ones left longest).

### 3. Filters per block

- **Profiles**: a new "Take from" setting: My profiles list (today, kept for saved blocks) or **My network** (new blocks start with it). My network brings every filter of its drawer (all of the list above) and a client picker (default: all clients, one row per person). The block opens the same drawer as the page, with the same chips and a count. People on Do not contact are never taken; suppressed people never; a person in several clients is taken once.
- **Companies**: every filter of the Companies drawer plus status, labels, added and industry and country, in the same drawer.
- **Posts**: today's filters plus search words, read or not, and, new on top of the page, posted between (from the read), at least N comments, at least N reactions, author contains, and "has qualified people". Done posts stay out as today; an option "Also posts already done" is not proposed.
- The filters are kept in one JSON setting (`filters`), checked by the same schema the page uses (the company schema moves from brain to contracts, like the people schema is). A block with filters from the page's address can be copied the other way later (out of scope).

### 4. Live count and summary

- The live count ("212 people match now, this block takes the first 100") uses the same query as the run, for all three.
- The canvas card says it in words: "Up to 100 people from My network · connected in the last 30 days · labelled fintech".

### 5. A fresh batch each run (confirmed)

A daily run with "100 newest" takes the same 100 again. An option "Skip what this workflow already took" (a small table `WorkflowInputTaken`: workflow, kind, slug, run, when; pruned after 180 days) makes each run take the next batch. Off by default; old blocks unchanged.

## Requirements

Confirmed by the request (2026-11-02):

- Input blocks for posts, profiles or networks, and companies.
- As many of the page and drawer filters as possible.
- A limit for how many per run.
- A time frame with from and to and quick options (today, last week, last month, ...).

Answered by the owner (2026-11-02):

1. Profiles pick from **My network** (all its filters) by default in new blocks; saved blocks keep My profiles list.
2. The time frame offers the date fields per block (posts: added, posted; people: first seen, last contact, connected, last sent, last reply; companies: added, last read).
3. **Caps per run stay as today**: 50 posts, 200 profiles, 100 companies.
4. **"Skip what this workflow already took"** is in (off by default; phase 5).
5. **The extra posts filters are in** (posted between, at least N comments, at least N reactions, author contains, has qualified people).

Open questions: none.

## Scope and non-goals

- In scope: contracts (settings, filter schemas, version, migration, estimate), brain (the three pickers, counts, the time frame, optional taken table), body (the block form, the drawers inside the block, the card summary), tests, MEMORY.md.
- Out of scope: new filters that do not exist on a page (except the few listed for posts), saved filter views for blocks, changing the pages, a block that writes labels, triggering a run when something new matches.

## Approach (one PR per phase, tests first)

- [x] 1. Time frame and limit on the three blocks as they are: date field and range with presets and custom, relative ranges resolved at run start, quick limits and higher caps, `version` 2 with `migrate`, live count, summary. No new source yet.
- [x] 2. Companies: the full drawer as block filters (`filters` JSON, schema in contracts, brain picker reusing `companyFilters.ts`).
- [x] 3. Profiles from My network: the source setting, people filters, client, the picker reusing `peopleFilters.ts`, people items (`known`).
- [x] 4. Posts: the new filters and the picker on `postList.ts`.
- [x] 5. Skip what this workflow already took (confirmed, off by default).
- [x] 6. MEMORY.md and Outcome; real check through the page and a preview run not done (see Outcome).

## Edge cases and risks

- **Relative and fixed dates:** a scheduled workflow with a custom range keeps using it; the block warns. Time zone changes (daylight saving) are handled by resolving the day in the saved zone; a block with no zone uses UTC.
- **"Last month" and "this week":** weeks start on Monday as in `addedSince`; months are calendar months in the saved zone.
- **Do not contact, suppressed, archived:** never taken by any source; counts exclude them.
- **Read-based filters** (skills, specialities, read age, team, posted date, comments) only match items that were read. The live count says how many match and the form hints "not read yet" so an empty slice is understood. Nothing is read or paid for by picking.
- **Client scope:** My network rows belong to a client. "All clients" takes one row per person (the one with the latest contact); a deleted client's rows are gone.
- **Saved ideal customer filter** (companies): a deleted or foreign ideal customer ends the step with a plain message and the run spends nothing.
- **Old blocks:** every new setting defaults to today's behaviour, and `migrate` turns `added` into the new range. Registry tests refuse an incomplete block.
- **Settings size and safety:** the `filters` JSON is capped (8 KB), validated by the shared schema (unknown keys refused, lists capped at 20 or 50 values as on the pages), and every value is a bound parameter; `ILIKE` escapes `%`, `_` and `\`.
- **Performance:** counts and picks reuse the pages' queries (indexed on user and added date; read filters scan the owner's reads). The live count is debounced; the pick is capped (`COUNT_CAP` 10,000 for counting, the block's cap for taking).
- **API-fed blocks:** links sent by an API call, or set on the Profiles block, are taken as given and ignore filters, as today.
- **Privacy:** everything is scoped to the signed-in owner; a test proves another owner's data, labels and counts never show.
- **Rollback:** a code revert; the optional table stays unused.

## Verification

- `pnpm lint && pnpm ts:check --force && pnpm test:unit:run && pnpm build`, brain integration tests.
- Unit: range resolution (every preset, custom, open ends, zones, Monday weeks), schema parity between contracts and body copies, `migrate` of old configs.
- Integration: each picker against Postgres (filters, limit and order, Do not contact, client scope, other owner's data), the live count equals what a run takes.
- Real path: a block on the canvas with the drawer, the count, a preview run, and a real run on the dev owner.

## Outcome

Shipped on `feat/input-blocks-filters` in five phase commits.

- Time frame (date field, presets, custom days, time zone of the block) and quick limits on all three blocks; caps unchanged.
- Companies block: the Companies drawer's filters plus a search; Profiles block: `source` My network (default for new blocks; saved blocks keep the profiles list, so no `migrate` was needed), client picker, the My network drawer, dates of a person; Posts block: search, read or not, at least N comments and reactions, author, has qualified people.
- Skip what this workflow already took: additive table `WorkflowInputTaken` (migration `20261102060000_workflow_input_taken`, applied to both local databases), 180 days, real runs only.
- Deviations: Posts keeps plain settings instead of one `filters` JSON; "Last contact (oldest first)" is the date field Last in touch with order Oldest first, not a separate order; the block's own labels also apply in My network next to the drawer's labels.
- Verified: lint, `ts:check`, unit tests (spider, contracts, body, brain), build, and 412 brain integration tests, including a picker test per block against Postgres.
- Not verified: the drawers inside a block on the canvas in a browser, and a preview or real run through the engine.
- Follow-up: the live count for My network counts the Everyone tab (it does not subtract suppressed people).
