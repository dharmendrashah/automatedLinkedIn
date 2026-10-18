# Labels edited in place, multi-select pickers, and "All or up to" on input blocks

- Status: done
- Created: 2026-10-18
- Locked by user: yes, 2026-10-18
- Ships in: the open branch `feat/labels-input-filters` (same PR as the labels work)

## Goal

Work with labels where they show, without opening an edit dialog. Pick labels from a list of all of them instead of typing. Make every "comma separated" block setting a chip picker. Let input blocks take "All" by default, or "Up to" a number.

## Today (checked in the code)

- **Table labels:** they show as badges in /profiles, /companies, /posts and /lists, but they are read only. Changing them needs the edit dialog (profiles, companies), the person drawer (list members) or the bulk bar. Posts have no edit dialog.
- **`LabelPicker`:** you type and get up to 8 suggestions. It does not show every label to tick, so with many labels you have to remember them.
- **Block settings of kind `words`** are a chip box where Enter or a comma adds a value. There are no suggestions except labels, and the hints still say "Separate with commas". 18 fields use it:
   - `labels`, `withoutLabels`, `process.tag` tags, and `logic.if` hasLabel.
   - Profile links.
   - Find posts: authors and mentioning.
   - Titles, locations, past titles and companies (people at a company, search people).
   - Domains.
   - The `process.filter` and `logic.if` "has" words.
- **Input blocks:** How many is a number (posts 1 to 50, default 5; profiles 1 to 200, default 25; companies 1 to 100, default 10). There is no "All".
- **Small bugs seen on the Posts block** (screenshot):
   - It says "1 posts waiting match now".
   - "Match: any or all" shows even with no labels.

## Proposal

### A. Labels edited in the table (/profiles, /companies, /posts, /lists)

- The Labels cell shows the labels as `Badge`s, each with an x to remove it, and a small "+" button.
- "+" opens a multi-select list of all the owner's labels:
   - A search box at the top, and a checkbox per label with its count.
   - "Create "<typed>"" when the typed label does not exist yet.
   - Ticking or unticking saves at once, with a small "Saved" or error state on the cell. No dialog.
- Saves go through routes that already exist: `linkedInProfile.update`, `linkedInCompany.update`, `linkedInPost.update` and `workflowList.updateMember` with `tags`.
- The edit dialogs keep their Labels field, using the same multi-select, so both places work the same way.

### B. One multi-select label picker everywhere

- It replaces today's type-ahead `LabelPicker` in:
   - the table filter and the bulk bar;
   - the add dialogs and the person drawer;
   - the block settings: With labels, Without labels, Add labels (`process.tag`) and If → has label.
- The same look everywhere:
   - A trigger shows the chosen labels as badges, plus "+N" when they do not fit.
   - The open list has a search box, every label with a checkbox and its count on this page, "Create …" and "Clear".
   - Labels keep their steady colors.
- Built with shadcn `Badge`, `Popover` and `Command` (the documented shadcn multi-select pattern; `Select` is single-choice only). See question 1.

### C. Easier "list" settings on every block (no more comma-separated)

- **One chip input for every `words` field:**
   - Paste many values at once; new lines, commas and tabs all split.
   - Each value shows as a `Badge` with an x.
   - Enter or an "Add" button adds a value.
   - Duplicates are ignored.
   - The hint text no longer says "commas".
- **Suggestions where they help:**
   - **Labels:** the owner's labels, using the picker from B.
   - **Titles and past titles:** a short built-in list of common job titles (founder, CEO, head of sales, VP marketing, …). Typing anything else still works.
   - **Locations:** a built-in list of countries and big cities.
   - **Profile links:** each link is checked as you add it. A non-LinkedIn link shows as an error chip and is not saved.
   - **Domains:** cleaned as you type (no `https://`, no path).
   - **Everything else** (authors, mentioning, "has" words, companies): free chips.
- Contracts mark each field with what it suggests: `suggest: 'labels' | 'titles' | 'locations' | 'links' | 'domains'`.

### D. "All or up to" on the three input blocks

- How many becomes the existing `limit` kind: "All" or "Up to N". New blocks default to All.
- "All" still has a safety cap (see question 3). The live count says "All 23 match now".
- Old blocks keep their number. Only blocks added from now on default to All.
- The estimate uses the live number of matches for "All", so the cost shown is real and not the cap.
- **Fixes:**
   - Plural words: "1 post waiting matches now".
   - "Match: any or all" shows only when two or more labels are picked. A new optional field rule `showWhen` covers this.

## Requirements

Confirmed by the request:

- Add and remove labels from the table on all four pages, without a dialog.
- See all labels as multi-select options.
- Chip pickers instead of comma-separated values on every block.
- How many is "All" by default, or "Up to".
- Use shadcn `Badge`, and shadcn for the picking.

Answered by the owner on 2026-10-18:

1. **The picker** uses shadcn `Popover` and `Command` (Radix, adds `cmdk`), with `Badge`.
2. **Labels are added and removed per row only.** There is no screen to rename or delete a label everywhere, so step 5 has no `label.rename` or `label.delete`.
3. **The cap for "All"** is today's maximum for each block: posts 50, profiles 200, companies 100.
4. **Titles and locations** get a short built-in list of suggestions.

Open questions: none.

## Scope and non-goals

- In scope: A to D, the two bug fixes, tests, MEMORY.md.
- Out of scope: label colors chosen by the user; reordering labels; suggestions from the data service.

## Approach

- [x] 1. Lock this plan.
- [x] 2. UI kit: add shadcn `popover` and `command` (or the choice from question 1); keep `badge`.
- [x] 3. Body:
   - `LabelMultiSelect`, which replaces `LabelPicker` everywhere.
   - `LabelCell` for the four tables, with optimistic save and rollback on error.
   - `ChipsInput` (paste-split, suggestions, validation) replacing `TagInput`.
- [x] 4. Contracts, tests first:
   - `suggest` on the words fields.
   - `howMany` as `limit` with `all` on the three input blocks, plus a cap and `showWhen`.
   - Old configs keep their number.
- [x] 5. Brain:
   - The input executors honour `all`.
   - The estimate uses the match count for "All".
   - With a manage screen (question 2): `label.rename` and `label.delete` across all pages, in one transaction.
- [x] 6. Verify:
   - All gates and brain integration.
   - By hand in the browser: edit labels in each table, run a filter, edit a block with chips, preview a run with "All".
   - Then MEMORY.md and Outcome.

## Edge cases and risks

- **Many labels (hundreds):** the list scrolls and search narrows it. The suggestion route already caps at 500.
- **Two quick edits on one row:** each save sends the full label list of the row, and the cell waits for the first save before sending the next, so nothing is lost.
- **Saving fails:** the cell goes back to the saved labels and shows the error.
- **Archived rows:** labels can still be edited; they count again when the row is restored.
- **Pasting 200 lines** into a chip field: still capped by each field's schema (50 values today), with a plain message.
- **Old graphs:** `howMany` numbers stay as they are. Only new blocks get "All", the same way new blocks got "New only".
- **The "All" cap and cost:** "All" never exceeds the cap, and the estimate shows it before a run.
- **Dependency:** `cmdk` (with Popover and Command) is a small, MIT-licensed, widely used package. It goes into `dependencies` of `apps/body` only.
- **Rollback:** a code revert. There is no migration, unless question 2 adds rename or delete (which also needs none).

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, plus brain integration.
- In the browser: the four tables, the block settings with chips, and a preview run with "All".

## Outcome

**Shipped:**

- **UI kit:** hand-written shadcn `popover` and `command` (Radix, from the unified `radix-ui` package), plus the `cmdk` dependency.
- **`LabelOptions` and `LabelMultiSelect`** (`labels/label-multi-select.tsx`):
   - Every label with a checkbox and its count, search (starts-with first), "Create …" and "Clear".
   - Used by the table filters, the bulk bar, the add and edit dialogs, and the block label settings.
- **`LabelCell`:** labels edited in place in /profiles, /companies, /posts, the /lists inbox and the person drawer.
   - The change shows at once.
   - One save at a time per row; the latest change waits for the one in flight.
   - If a save fails, it goes back and shows a toast.
- **Removed:** `LabelPicker` and `TagBadges`.
- **`ChipsInput`** (replaces `TagInput`) for every list setting on blocks:
   - A pasted list splits on new lines, commas, tabs or semicolons; there is an Add button and Badge chips.
   - Built-in titles and locations to pick from (`chip-values.ts`).
   - LinkedIn links are checked and websites cleaned; anything refused is shown.
- **Contracts:**
   - `Suggest` on the words fields.
   - `showWhen` (Match only with two or more labels).
   - `limit.allCap`.
   - The input blocks take `all` with `INPUT_MAX` (50 / 200 / 100), and `inputTake` is shared by the estimate and the executors.
   - `Available.byNode` (live counts per input block); the Tag block takes up to `LABEL_MAX`.
- **Brain:**
   - The executors use `inputTake`.
   - `WorkflowService.estimate` gets live counts per input block (`InputPickService.counts`), with the workflow id for "since the last run". Called workflows use the totals.
- **Body:**
   - New input blocks start on All (`startConfig`); old blocks keep their number.
   - The live count uses correct plurals and knows about All.

**Deviations:** none.

**Not run:** the browser check. The local app asks for a sign-in, and no test account is available to the agent. Lint, types, unit tests (body 283, contracts 144, brain 979) and the build pass.
