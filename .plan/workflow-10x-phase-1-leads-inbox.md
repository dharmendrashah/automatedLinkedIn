# Workflows 10x, Phase 1: Leads inbox

- Status: done
- Created: 2026-10-18
- Locked by user: yes, 2026-10-18
- Roadmap: `.plan/workflow-10x.md` (locked)

## Goal

/lists becomes the place a sales rep or founder works every day. It is one inbox across all lists, opening on the people to work now. Each person shows why they fit and every signal they gave. Working through 50 people takes minutes from the keyboard, not about 200 clicks.

## Today (checked in the code)

- **Lists page:** [Lists.tsx](../apps/body/src/pages/Lists.tsx) (369 lines) works on one list at a time, picked from a dropdown.
   - Tabs: All, Qualified, Maybe (`LIST_VIEWS`).
   - A separate status select: New, In review, Done, Not a fit (`WorkflowListMemberStatus`).
   - A loose "Label" input and a "Needs review only" checkbox.
   - No counts on the tabs, no bulk selection, no keyboard.
- **The table:** [members-table.tsx](../apps/body/src/components/lists/members-table.tsx) shows "Found via" with only the first signal (`reasonOf`), and the score as grey text. Actions sit in a "⋯" menu: Mark as, Move to, Do not contact, Delete. Remove, Move and Do not contact go through confirm dialogs.
- **Scoring:** [icpScore.ts](../apps/brain/src/core/icpScore.ts) already produces `matched` labels, such as `title "growth"` or `comment mentions "pipeline"`, and stores them on the member. The points behind each label are not stored.
- **The person drawer** (`?person=`) already exists, with Previous/Next, notes and list status.

## Proposal

### 1. One inbox across all lists

- **Top line:** "12 new people this week. Start with these 5." It sits above the list, with the best five first.
- /lists opens on **All lists**. The list dropdown becomes a filter ("All lists" or one list). List management (new, rename, delete, export) moves into a small "Lists" menu.
- **No duplicates:** a person is in at most one of the owner's lists (schema rule), so the inbox shows one row per person.
- **Views (tabs with counts):** To do (status New), Contacted, Replied, Not a fit, and All.
   - "Do not contact (3)" is a separate view that can be checked.
- **"New since your last visit":** a dot on each person added since the owner last left the inbox.
- **Filters as chips:** Fit (Strong fit, Maybe, No score yet) and "Found by: <workflow name>".
   - "Needs review" is renamed "Untouched for 6 months".
   - Labels are hidden from the page in this phase.
- **Sort:** best fit first, then the most recent signal (the default on To do), or newest added.
- **Empty state:** "No new people yet. <workflow> runs <when>." It links to the workflows when there are none.
- **Nothing on this page spends money** except the paid reads in the person drawer, which already show their price.

### 2. One status flow

- **Statuses:** New, Contacted, Replied, Not a fit. Qualified and Maybe are no longer something the rep sets; they are the fit the workflow gave, shown as a chip and used as a filter.
- **Migration (additive):**
   - Add `CONTACTED` and `REPLIED` to the enum, plus `contactedAt`.
   - Backfill In review to New, and Done to Contacted (with `contactedAt = updatedAt`).
   - The old enum values stay unused, to be removed in a later cleanup.
- "Mark as Maybe/Qualified" is removed from the menu. The fit stays what the score says, and the owner can still move a person to Not a fit.

### 3. A score you can trust

- **Score breakdown:** `scorePerson` returns `reasons: [{ label, points }]` (for example "Title matches \"growth\" +30", "Commented on a post about \"pipeline\" +20"). The workflow saves it in a new `WorkflowListMember.reasons` JSON column.
- **In the row:** a coloured fit chip ("Strong fit" in green, "Maybe" in amber, with the score in small type), sortable, plus one plain reason line built from the reasons and the strongest signal. For example: "Head of Sales · commented on a post about pipeline 2 days ago".
- **In the drawer:** the full breakdown. People scored before this show "Reasons appear on the next run".
- **Every signal shown:** all of them, newest first, each with how recent it is ("commented 2 days ago", "reacted last week", "company is hiring"). Each links to the post or company, with the comment excerpt.
- The Contacted view shows "Contacted 9 days ago, no reply", so follow-ups are easy.

### 4. Triage mode

The click path comes first; the keys are an extra for reps and are not shown on the first visit.

- **Split view:** the list on the left and the person drawer docked on the right. Moving through the list keeps your place, and the drawer follows the selected row.
- **Keyboard keys** (listed in a "?" help, never active while typing):
   - J / K: next or previous person.
   - C: contacted. R: replied. X: not a fit. U: back to New.
   - O: open on LinkedIn. Y: copy the message.
   - Z: undo the last action.
   - D: do not contact, the only key that asks to confirm.
- **Moving on:** after C, R or X the next person is selected automatically. The person leaves the view with a 5-second undo toast.

### 5. Bulk actions and undo

- A checkbox per row, "select all on this page", and a bar with: Mark contacted, Not a fit, Move to list, Remove.
- Every status change, move and remove gets an undo toast, for one person or in bulk. Undoing a remove brings everything back, notes included.
- Do not contact keeps its confirm, in bulk too. It already stops every workflow from adding that person again, in every list; the confirm text says so.

### 6. Hand-off: copy the message

- **One main button per person:** "Copy message and open LinkedIn". It copies the message and opens their profile in a new tab, then offers "Mark contacted" (which stores today's date). Nothing is marked automatically.
- **The message:** a fixed default filled from the strongest signal. It names the post topic and never quotes their words back to them:
   - "Hi Ada, saw your comment on <author>'s post about <topic>. …"
   - For a hiring company: "Hi Ada, noticed <company> is hiring for <role>. …"
- **Stale signal:** when the strongest signal is over 30 days old, a warning says so.
- Editing the message template is left for later. Nothing is sent from the app.

## Requirements

Confirmed (from the locked roadmap):

- The one status flow and the mapping of old statuses.
- Score reasons saved at scoring time.
- Copy opener as a fixed template: no AI, no sending.

- Answered by the owner on 2026-10-18:
   - **New:** both a dot for people added since your last visit (saved when you leave the page) and the "N new this week" top line.
   - **Copy message:** copies the message and opens LinkedIn only. A "Mark contacted" button is then offered; nothing is marked automatically.
   - **Do not contact** stays final, with no unblock.

Open questions: none.

## Persona review of this plan (2026-10-18)

- **Sales rep:** triage mode and every signal with a link matter most. Asked for no duplicates (already true), a link on every reason, undo for bulk and single actions alike (notes kept), no quoting a comment back, a warning on stale signals, "contacted N days ago", Z for undo, and an unblock. Cut: labels and editing the template.
- **Founder:** understood the page, but not the words workflow, "Not scored", Blocked, Label or "Needs review". Wants a "12 new this week, start with these 5" top line, a plain reason per row, one "copy message and open LinkedIn" button, a helpful empty state, and nothing that spends money unannounced. Would cut the keys; they are kept but out of sight.

## Scope and non-goals

- In scope: /lists (inbox, filters, counts, sort, split view, keys, bulk, undo, opener), the status migration, `reasons` on scoring and members, the drawer showing reasons and every signal, tests.
- Out of scope:
   - A "not a fit teaches the score" hint (Phase 5).
   - Labels on this page (they stay on the data and in CSV).
   - Editing the message template.
   - CSV export changes, beyond adding the reasons and the new statuses as columns.
   - The workflow canvas.
   - Email digests.

## Approach

- [x] 1. Lock this plan (after the sales rep and founder reviews).
- [x] 2. Brain, tests first:
   - `scorePerson` returns `reasons`.
   - Migration: `CONTACTED`, `REPLIED`, `contactedAt`, `reasons`, and `User.inboxSeenAt`, plus the backfill.
   - `WorkflowListService.inbox(query)` across lists, with counts per view, sort and filters.
   - Bulk update, move and remove, owner-scoped.
   - An undo-friendly delete: return the deleted row so it can be restored.
   - `opener(member)` in `core`, a pure function.
- [x] 3. Body:
   - Inbox page with chip filters and counts, and the split view with the docked drawer.
   - Keys and help, bulk bar, undo toasts, opener.
   - The drawer's reasons and signals.
- [x] 4. Verify all gates and the brain integration tests, then a persona re-review of the screens (sales rep, founder). Then MEMORY.md and Outcome.

## Edge cases and risks

- **Status backfill:** one UPDATE per old value, inside the migration. Rollback is a code revert; the old values remain valid.
- **Counts across lists:** one `groupBy` per request, owner-scoped. The index `[listId, state, createdAt]` exists; a `[listId, status]` index may be added for the counts.
- **Bulk:** at most 200 ids per request, all checked to belong to the owner in one query. A partial failure is all or nothing (one transaction).
- **Undo:** remove keeps the row data client-side for 5 s, and undo re-creates it with the same fields. A person added meanwhile by a workflow wins (the unique index refuses the undo, with a message).
- **Do not contact:** never undoable from a toast. It always confirms, in bulk too.
- **Keys:** off while any input, select, dialog or menu has focus, and off on touch devices.
- **Opener:** only uses the person's own public signal text, cut to 140 characters. It is copied to the clipboard only, never stored or sent.
- **Performance:** pages of 50, a server-side sort, and counts in parallel with the page query.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, plus the brain integration tests (inbox across lists, counts, bulk owner scoping, backfill, reasons saved by a workflow run).
- A persona re-review of the finished screens by the sales rep and founder agents.

## Outcome

- **Shipped:**
   - /lists is now "Leads", an inbox across all lists.
      - A "N new this week, start with the five marked below" line, with the five marked.
      - Tabs with counts: To do, Contacted, Replied, Not a fit, All, Do not contact.
      - Filters: fit chips, "Untouched for 6 months", search, and a sort (best fit or newest).
      - Rows show a dot for new people, a fit chip, a role line, the strongest signal linked to its post, the top reason with its points, a stale-signal warning, "Contacted N days ago, no reply yet", and "Copy message" (copies, opens LinkedIn, then offers "Mark contacted").
      - Bulk bar, undo toasts (Z works only while the toast shows), keys J/K/C/R/X/U/Y/O/Z/D with a help dialog, and the person drawer docked beside the list.
   - **Brain:**
      - `InboxService`: inbox, setStatus, move, remove, restore, suppressed, markSeen.
      - Migrations `add_inbox_statuses` and `add_inbox_statuses_backfill` (CONTACTED, REPLIED, `contactedAt`, `User.inboxSeenAt`; In review to New, Done to Contacted).
      - `explainMatched` in `core/icpScore.ts`.
   - The person drawer shows reasons with points and every signal, newest first.
   - A `Toaster` is mounted in the dashboard layout; toasts were used before but never shown.
- **Deviations:**
   - **Score reasons:** no new JSON column. The stored `matched` labels map one-to-one to the scoring weights, so `explainMatched` derives reasons and points, and people scored before now get them too.
   - **No topic or author in the message:** the post's topic and author are not stored, so the message says "a recent LinkedIn post". The row links the signal to the post instead.
   - **"Found by <workflow>" is the list filter:** each workflow writes to its own list.
   - **Sorting by the most recent signal** is not done, because signals live in JSON. The sorts are best fit (score) then newest, or newest.
- **Persona re-review (sales rep), fixed:**
   - A linked reason, the top reason with its points, the stale warning in the row, both dates kept, the five marked, a sort control.
   - "Copy message" and "marked contacted" wording, and "A workflow may find them again" on remove.
   - Bulk do not contact reports failures; Z expires with its toast.
- **Verified:** lint, ts:check (forced), unit, build, and brain integration (86, including 4 new inbox tests). Not checked in a browser, because that needs sign-in.
- **Follow-ups:**
   - Drop the old `IN_REVIEW` and `DONE` enum values in a later cleanup migration.
   - Store the post topic and author with a signal, so the message can name them.
