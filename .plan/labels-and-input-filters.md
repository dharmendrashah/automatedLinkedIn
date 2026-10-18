# Labels on /profiles, /companies, /posts, and filtered input blocks

- Status: done
- Created: 2026-10-18
- Locked by user: yes, 2026-10-18
- Ships in: a new branch and PR off `main`

## Goal

Let the owner label what they save (many at once) and see the labels in every table. Then let a workflow's input block take exactly the slice they mean: "profiles labelled fintech, added this week, not contacted yet", instead of "the newest 50".

## Today (checked in the code)

- `LinkedInProfile.tags` and `LinkedInCompany.tags` exist (`String[]`). They are edited only in each row's edit dialog, as a comma-separated text field (up to 10, 30 characters each). The table shows them as badges, and clicking one filters by that single tag.
- `LinkedInPost` has no tags.
- None of the three tables can select rows, so nothing can be labelled in bulk. The add dialogs cannot label what they add.
- Input blocks (`input.profiles`, `input.companies`, `input.posts` in `packages/contracts/src/workflow.ts`) take only `howMany` (profiles also take fixed links).
   - Profiles and companies take the newest N (`recent`), every run, with no filter.
   - Posts take the oldest N not done yet (`waiting`).

## Proposal

### A. Labels (the UI says "Labels"; the database keeps `tags`)

1. **Posts get labels**, through an additive migration (`tags String[] default []`).
2. **One label picker everywhere**:
   - Chips, with suggestions from the owner's existing labels and the count of each. Enter or comma adds a label.
   - It is used in the edit dialogs, the add dialogs and the bulk bar.
   - New route `labels.list`: the distinct labels across the owner's profiles, companies and posts, with counts.
3. **Label while adding**: the add dialogs get "Labels for everything you add". The labels go on new and restored links, and are merged into ones already saved, so pasting a list again still labels it.
4. **Bulk labelling**: a checkbox column and an "N selected" bar on all three tables (the same pattern as /lists): Add labels, Remove labels, Archive. Routes `labelMany({ ids, add, remove })` and `archiveMany`.
5. **See and filter by labels**:
   - Posts get a Labels column.
   - Each label gets a steady color, taken from its text, so "fintech" looks the same everywhere.
   - The toolbar gets a label filter (several labels, matching any of them) and an "Added" filter: Today, This week, Last 30 days, Any time.
   - The filters live in the URL, so a filtered view can be shared or bookmarked.
6. **Limit**: raised to 20 labels of 30 characters per item. A bulk add that would pass 20 keeps the existing labels first and says how many items were full.

### B. Input blocks that select a slice

New optional settings on `input.profiles`, `input.companies` and `input.posts`. Old workflows keep working unchanged, because every setting defaults to today's behaviour.

| Setting | Options | Default |
| --- | --- | --- |
| Added | Any time, Today, This week, Last 7 days, Last 30 days, Since this workflow's last run | Any time |
| With labels | the owner's labels (suggested), any of them | none |
| Without labels | the owner's labels | none |
| Status (profiles, companies) | New, Contacted, Replied | all |
| Order | Newest first, Oldest first | profiles/companies: newest; posts: oldest |
| How many | as today | as today |

- **Posts** still take only posts that are not done yet. Labels and Added narrow that set further.
- **"Since this workflow's last run"** takes only what was added after the start of this workflow's last successful run (SUCCEEDED or PARTIAL). Failed, stopped and preview runs do not count, so nothing they missed is skipped, and the people they already reached are still dropped by the existing Seen filter rather than paid for again. The block shows the date it uses ("added since Mon 09:00"). A first run takes everything that matches.
- **Today and This week** use the time zone of the browser that set the block, saved on the block, as the Schedule block does.
- **Live count** in the block form: "23 profiles match now" (route `workflow.inputMatches`). The owner sees before running whether the slice is empty.
- **Canvas card summary**: "Up to 50 profiles · labelled fintech, saas · added this week · new only".
- **Nothing matches**: the step says it plainly ("No profiles labelled fintech were added this week.") and the run ends with nothing spent.
- **Label suggestions by prefix:** typing `acme:` suggests the owner's labels that start with it, so an agency can keep clients apart with a `client:` prefix. There are no label groups.
- **Privacy:** labels, counts and suggestions come only from the signed-in owner, and a test proves another owner's labels never show.
- **Links sent through the API, or set on the block, are taken as given**: filters apply only when the block reads the owner's lists.
- **The estimate stays "up to"**: How many is still the cap.

## Review (GTM Engineer, Agency Owner, 2026-10-18)

- **Both:** the live count and "since last run" are the most useful parts; labels on add are how each client's list gets sorted.
- **Both:** "since last run" must be plain about failed runs. It now counts only successful runs and shows the date it uses.
- **GTM:** keep clients apart. Answered with prefix suggestions (`acme:`) rather than label groups.
- **GTM:** wants "all of these labels" (client and vertical together). **Agency:** start with "any".
- **Both:** include the status filter. **Agency:** new blocks default to "New only".
- **Agency:** base the estimate on the live count when it is smaller than How many. Deferred, because `estimateGraph` has no database; the form shows the count next to the estimate instead.
- **Agency:** a privacy test that labels never cross owners. Added.

## Requirements

Confirmed by the request: labels on all three pages, many at once, shown in the tables; input blocks filtered by when items were added and by labels.

Answered by the owner on 2026-10-18:

1. **Label matching:** an "any or all of these labels" switch on the input blocks and on the table filter.
2. **Status filter** on the profiles and companies input blocks: yes. New blocks default to "New only"; old blocks keep all.
3. **Limit:** 20 labels per item, 30 characters each.
4. **Labels on people in /lists: now.** Labels can be edited in the person drawer's workspace, added or removed in bulk from the /lists bar, filtered in the inbox toolbar, and suggested from the same `labels.list` (which now includes list members).

Open questions: none.

## Scope and non-goals

- In scope: everything in A and B; tests; MEMORY.md.
- Out of scope:
   - A workflow block that adds labels to people.
   - Renaming or merging labels across everything (it can come later from `labels.list`).
   - Triggering a run when something new is labelled.

## Approach

- [x] 1. Lock this plan.
- [x] 2. Brain, tests first:
   - Migration `add_post_tags`.
   - A shared label helper: normalize (trim, lowercase, dedupe, at most 20 of 30 characters each) and merge.
   - `labels.list`; `labelMany` and `archiveMany` per resource; labels on `addMany`; list filters `tags` (any of) and `addedSince`.
   - Input filter: `inputWhere(config, now, lastRunAt)` builds the where clause for each kind and is unit-tested. `recent` and `waiting` take it; `workflow.inputMatches` counts with it.
- [x] 3. Contracts:
   - New optional fields on the three input blocks, with defaults.
   - `words` fields gain `suggest: 'labels'`.
   - The block summary text, plus contract tests that old configs still parse.
- [x] 4. Body:
   - `LabelPicker`, label colors, and the selection column and bulk bar on the three tables.
   - Labels in the add dialogs, the Added and label filters in the toolbar, and the Posts labels column.
   - The block form's live count and the summary on the card.
- [x] 5. Verify: all gates, brain integration (filters, last run, bulk label merge), and a real check through the page and a preview run. Then MEMORY.md and Outcome.

## Edge cases and risks

- **Empty or odd labels:** blank or whitespace labels are dropped. They are lowercased, so "Fintech" and "fintech" are one label. Commas split.
- **Bulk on ids that are not the owner's:** ignored, as `owned()` does today. The bulk size is capped at 200 per call.
- **Concurrent edits:** `labelMany` reads and writes in one transaction per item set, so an edit dialog save and a bulk add do not drop each other's labels (last write wins on the same item, as today).
- **Existing data:** the new post column defaults to empty, and old block configs default to today's behaviour. No backfill.
- **"Since last run" with no previous run:** everything that matches. A stopped or failed run counts as a run only if it finished. Previews never count.
- **Time zone missing on old blocks:** falls back to UTC.
- **Performance:** filters use the existing `[userId, archivedAt, createdAt]` index. Label `hasSome` scans only the owner's rows, which are small per user, so there is no GIN index for now.
- **Privacy:** labels are owner-only data, deleted with the item.
- **Rollback:** a code revert. The migration only adds a column.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, plus `pnpm --filter @automatedLinkedIn/brain test:integration:run`.
- By hand: label 3 profiles in bulk, filter the table by the label and by Added today, then set an input block to "labelled X, added today", see the live count, and run a preview.

## Outcome

**Shipped:**

- **Migration `add_post_tags`**: `LinkedInPost.tags`, default empty.
- **Shared rules in `database/linkedInRecord.ts`:**
   - `labelWhere`: any or all of the labels, minus the excluded ones.
   - `inputWhere` and `inputOrder`.
   - `mergeLabels` and `relabel`: remove first, then add, up to `LABEL_MAX` (20, from contracts).
- **Services:**
   - Each link service has `labelMany` (in a transaction), `archiveMany` (companies and posts also drop their page reads), `addMany(..., labels)`, and `pick` or `waiting` with a filter.
   - `InboxService.labelMany`.
   - `InputPickService` (`lastRunAt` counts only successful, non-preview runs of the owner; `filter`; `count`).
   - `LabelService.list`: one parameterized SQL query, owner only, with counts per page.
- **Routes:**
   - `label.list`.
   - `labelMany` and `archiveMany` on profiles, companies and posts; `labels` on `create`.
   - `linkedInPost.update` takes `tags` (replaces `setStatus`).
   - `workflowList.labelMany`; `updateMember` takes `tags`; the inbox takes `tags` and `tagMatch`.
   - `workflow.inputMatches`.
   - The list filters take `tags`, `tagMatch` and `addedSince`.
- **Contracts:**
   - `inputPickSchema` (added, labels, labelMatch, withoutLabels, statuses, order, timeZone) on the three input blocks. Old configs parse to "everything".
   - `inputPickOf` and `addedSince` (time zone aware; weeks start Monday).
   - `words` fields can have `suggest: 'labels'`.
- **Body:**
   - `LabelPicker` (suggestions with counts, prefix first), `LabelBadge` (a steady color per label) and `LabelFilter` (any or all).
   - Selection and a bulk bar on /profiles, /companies, /posts and /lists. The Lists page now uses the shared selection and bar.
   - Labels in the add dialogs and the edit dialogs. Labels on a list member and on a profile can be edited in the person drawer.
   - A Labels column on posts; labels under each person in the inbox.
   - The Added and label filters live in the URL (`?labels=&match=&added=`).
   - Input block form: the live count (`InputMatches`) and the card summary ("Up to 50 people · labelled acme and fintech · added this week · new only").
   - New profile and company blocks start with `statuses: ['NEW']` and the browser time zone (`startConfig`).

**Deviations:**

- The estimate does not use the live count; the block form shows the count instead.
- Posts have no edit dialog, so their labels are set when added or in bulk.
- Search and status filters stay local state, as before; only labels and Added are in the URL.

**Not run:** a browser check of the pages, and a preview run by hand. Covered by brain integration (labels, picks, the last run, owner scoping, inbox labels) and unit tests.
