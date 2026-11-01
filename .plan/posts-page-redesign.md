# Posts page redesign: read posts, rich rows, scroll paging (ideas from /companies and /network)

- Status: done
- Created: 2026-11-01
- Locked by user: yes, 2026-11-01

## Goal

`/posts` shows bare links (`linkedin.com/feed/update/urn:li:activity:…`), "Unprocessed" badges and no way to tell posts apart without opening each one. Redo it like `/companies` (rich rows from the read, TanStack table, scroll paging, columns menu, bulk read, CSV import) with the work-queue framing of `/network` (tabs, a short summary line), so a user can pick which posts are worth mining for commenters and reactors.

## What exists today (checked in code, 2026-11-01)

- Page `apps/body/src/pages/Posts.tsx`: header + `AddPostsDialog` (paste only), `ListToolbar` (search by link, status, added, labels, show archived), `LinkBulkBar` (label, archive), `PostsTable` (plain shadcn: select, Post link, Status, Labels, Added, row actions toggle done and archive), `Pager`, `DetailDrawers kind="post"`.
- Brain `linkedInPost` router: `list` (`{ items, total }`, offset paging, newest first, search on url/slug), `create`, `get`, `update` (status, tags), `archive`, `restore`, `labelMany`, `archiveMany`. Model `LinkedInPost`: `slug`, `url`, `expandedUrl`, `status` (`UNPROCESSED`/`PROCESSED`), `tags`, `archivedAt`.
- A post read (`postPage.readFull`, $0.002, `PRICE_MICROS.engagement`) stores `PageSnapshot` kind `POST` (`postSchema` in `core/pageSnapshot.ts`): text, author (name, url, avatar, headline, followers, isCompany), reactions, comments, shares, postedAt, media, articleUrl, repostNote. The list never reads it, so rows stay bare links.
- Drawer `PostView` already shows the read, Read button, comments/reactions (`PostEngagement`), people found from the post (`postPage.detail` matches `WorkflowListMember` by `postUrl` or signals `via`).
- Reusable from Companies: `components/table/` (`SortHeader`, `ColumnsMenu`, `useHiddenColumns`), TanStack Table + `useVirtualizer` + `useFillHeight` + `LOAD_AHEAD` (`companies-table.tsx`, `use-companies.ts` infinite query), `ReadManyButton` (cost preview), CSV import (`links/import-csv.ts`, `CsvKind`; brain `importedOf`, `IMPORT_BATCH`, `IMPORT_CAP`), `Picture`/`useMediaSource` through `/cdn`, filter chips.
- Reusable from Network: tab strip (Needs me / Waiting / Everyone), summary line (`my-network/summary.tsx`), `Photo`, people avatars stack (Companies `people { count, first[3] }`).

## Requirements

Confirmed (from the request):

- Redesign `/posts`, taking ideas from `/companies` and `/network`.
- Review with the persona (ICP) agents before locking (done, see below).
- Posts stay owner-wide (no client); client scoping is its own plan.
- Archive is removed from posts completely (row action, bulk action, Show archived, brain `archive`/`restore`/`archiveMany` for posts). No delete is added. Paid reads are no longer deleted by a post action.
- Posts archived today come back by a one-time additive data migration: `archivedAt` cleared, status `PROCESSED` (Done), label `archived` added, so workflows (which read To work posts) never pay for them again. Their reads were already deleted. The `archivedAt` column stays (no destructive migration).
- People found opens the post drawer's people section.
- CSV import yes; paste stays the default.
- Tabs: To work / Done (no Archived tab).
- Later plans, not here: Send to workflow, last mined by workflow, per-post people CSV, spend line, new since yesterday.

Open questions (must be empty before locking):

- None.

## Design (proposed)

### Brain

- `LinkedInPostService.list` adds per row:
  - `card` from the `POST` snapshot (one extra query by `(userId, kind POST, slug in page)`): author name, avatar, headline, isCompany, first ~140 chars of text, postedAt, media type, reactions, comments, shares; `null` before a read. Same pattern as `companyCardOf`.
  - `readAt` (snapshot `fetchedAt`).
  - `people { found, qualified, first[3] }`: list members found from this post (same match as `postPage.detail`, batched by url); `qualified` is state `QUALIFIED`; suppressed (Do not contact) people never counted or shown.
- Sorting `sort: { by: 'createdAt' | 'postedAt' | 'comments' | 'qualified', desc }`; unread posts sort last.
- Search also matches the read's author name and text (no separate author filter). Filter `read` (read / not read).
- `linkedInPost.import` (paste or CSV, 200 per call, review step, import label `import-YYYY-MM-DD`, "Read these posts now" opt-in, off by default, total shown first) and `linkedInPost.readMany` (200 picked ids, skips posts read in the last 30 days, `DataReadService.paidSince`), mirroring `linkedInCompany.import` / `readMany`. `linkedInPost.create` replaced.
- Remove `linkedInPost.archive`, `restore`, `archiveMany` and `LinkedInPostService.archiveForUser`, `restoreForUser`, `archiveMany`; `addMany` no longer restores (nothing new is archived). `postPage.readFull`'s "Restore the post first" check goes. Retention and `waitingWhere` keep their `archivedAt IS NULL` checks (always true after the migration).
- Migration `restore_archived_posts`: `UPDATE "LinkedInPost" SET "archivedAt" = NULL, status = 'PROCESSED', tags = <tags + 'archived', deduped, within LABEL_MAX> WHERE "archivedAt" IS NOT NULL`.

### Body

- Header: title, one summary line led by people ("38 people found, 12 qualified · 12 posts to work through, 4 not read yet"), Add posts.
- Tabs instead of the status dropdown and Show archived: To work (UNPROCESSED), Done (PROCESSED), with counts. Done is set by the user or by the existing Mark posts done workflow block; the tab says so in its empty state.
- Toolbar: search (link, author, text), Added, Labels, Read, columns menu; active filters as chips.
- Table on TanStack Table + virtualizer + infinite query (page 50), like `companies-table.tsx`:
  - Post: author avatar (`/cdn`), author name + "· 3d" posted, two-line text excerpt; before a read the link and a muted "Not read yet · Get details $0.002".
  - People found (second column): qualified / found + avatar stack; opens the drawer's people section.
  - Engagement: reactions and comments (no shares, no media type).
  - Labels, Added; Last read hidden by default; hideable columns kept per browser.
  - Row actions: Mark done / Back to work, Open on LinkedIn.
- Bulk bar: Read (cost preview, `ReadManyButton`), Mark done, Label. `LinkBulkBar` keeps archive for Companies only (archive becomes optional there, or posts get their own bar).
- Empty states per tab (To work: "No posts to work through. Add posts to find who engages with them.").
- `DetailDrawers kind="post"` keeps working with the loaded order.

## Persona review (2026-11-01)

GTM Engineer, Agency Owner, Founder and Sales Rep read the draft. Agreed by all: tabs, rich rows, People found per row is the most important column, bulk read only with the total first and never automatic on import, cut Shares, the author filter and Last read (hidden). Folded in above. Raised and decided in Requirements:

- Agency Owner: posts have no client, so eight clients' posts and read costs share one page; wants client scoping or a client on each row, spend on the page, and a CSV of people found per post for handover.
- GTM Engineer, Sales Rep: show qualified / found (folded in), "last mined by workflow / on", "Send to workflow" from the bulk bar; archive should keep the paid read.
- Sales Rep: People found should open My network filtered to this post, with "N new since yesterday".
- Founder: needs a clear next step after adding a post ("Find who engaged"); tab names New / Finished / Hidden; "Get details" instead of "Read" (folded in for the call to action); no CSV.

## Scope and non-goals

- In scope: `/posts` page, `components/posts/*`, the `linkedInPost` list/import/readMany, tests.
- Out of scope: the post drawer (`PostView`) content beyond removing its archive and restore controls, Write a post (`/posting`), workflows, finding posts by keyword (a workflow block already does it), client scoping of posts, saved views, archive on Companies and Profiles (unchanged).

## Approach

- [x] Persona review (GTM Engineer, Agency Owner, Founder, Sales Rep) and fold in the feedback.
- [x] User locks the open questions.
- [x] Tests first: `list` returns `card`, `readAt`, `people` (integration); import and readMany skip rules; the restore migration on a test database (archived row becomes Done with the label, not in `waiting`); pure card/summary helpers (unit).
- [x] Brain: list summary, sorting, filters, `import`, `readMany`, tab `counts`; remove post archive and restore; migration.
- [x] Body: `use-posts.ts` infinite hook, TanStack `posts-table.tsx`, tabs, summary line, toolbar, bulk bar, add dialog (paste + CSV); drop archive from `PostView`.
- [x] Delete replaced code (`Pager`, old table, `PasteLinksDialog`, `RowActions`, `selection.tsx`, `post-statuses.ts`, post archive code and tests).
- [x] Checks, Outcome, `MEMORY.md`. Browser walk-through not done (see Outcome).

## Edge cases and risks

- Post never read: row shows the link and a Read call to action; sorting by engagement puts unread last.
- Snapshot that does not parse (`readPostSnapshot` null): treat as not read.
- Short `lnkd.in` links without `expandedUrl`: still listed; read expands first (existing worker path).
- Same post under two ids: not detected (known gap, unchanged).
- Bulk read cost: preview before spending; wallet floor refuses; 30-day skip so a double click does not pay twice.
- Engagement sort in SQL needs the JSON numbers: a join on `PageSnapshot` with jsonb casts, keys from code constants only (as `companyFilters.ts`).
- Author avatars and media load only through `/cdn` (`useMediaSource`).
- Restored archived posts: brought back as Done with label `archived`, so `waiting` (To work only) never feeds them to a workflow; a post already holding 20 labels keeps its labels and skips the extra one.
- Workflows or Mark posts done referencing a formerly archived post: unaffected (they read by status).
- Body build: anything still calling `linkedInPost.archive*` fails `ts:check`, which finds every caller.
- Large lists: virtualized; tab counts in one grouped query.
- Migration is additive data only (no column dropped); rollback is a manual re-archive by label if ever needed.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests.
- Page seen in a browser with read and unread posts, bulk read on a local wallet.

## Outcome

Shipped as planned, verified with `pnpm lint`, `ts:check`, `test:unit:run`, `build` and all 50 brain integration test files (321 tests) against local Postgres, including the migration run on a test database. Not seen in a browser behind sign-in, and the migration is not applied to the local dev or staging database yet.

Deviations:

- `linkedInPost.create` stays: `/posting` saves the link of a post it published through it. Import is a new `preview` + `import` pair.
- `addMany` still restores archived rows through the shared `addLinks` (never reached now; kept to avoid a posts-only copy).
- Tab counts and the summary are owner-wide, not filtered, so they do not change with search or labels.
- Card text is 280 characters (planned ~140); the row clamps it to two lines.
- People found opens the post drawer (its people section sits right under the post); faces open the person drawer, as on Companies.
- New shared pieces instead of copies: `ImportLinksDialog`, `ReadManyButton`, `read-cost.ts` (moved from companies and given a noun), `table/sort-param.ts`, `DataReadService.queueEach`/`RECENT_READ_MS`, `useHiddenColumns(key, initial)`. `ListToolbar` lost its status and Show archived controls (Posts was the last user).
- The engine's Mark posts done now calls `setStatusMany` (was `markProcessed`).

Deliberately not refactored: the virtualised TanStack table scaffolding is now in four tables (companies, people, sessions, posts); one shared component needs the TanStack v9 feature generics typed across tables, a separate change.

Unverified: LinkedIn's `postedDate` format (only `YYYY-MM-DD` seen in a fixture) for the posted-date sort and "3 days ago" text; any other text is shown as given and sorts as text. Sorting by qualified people and the per-page people query scan the owner's list members per post; fine at today's sizes, worth an index on signals if lists grow large.

Follow-ups: the later plans listed in Requirements.
