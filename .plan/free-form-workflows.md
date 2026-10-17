# Free-form workflows: simpler start, any block to any block, logic blocks

- Status: done
- Created: 2026-10-17
- Locked by user: yes, 2026-10-17 (re-locked the same day with the CSV export block and per-block output)

## Goal

Let the owner build any workflow they like in a few steps. Creating one asks only for a name and "blank or ready-made template", then opens the canvas. Blocks connect freely on any side, scoring becomes optional, and new blocks (If, Else, For each, Send via API) plus loops make flows fully configurable.

## Requirements

Confirmed by the owner (2026-10-17):

- New workflow page: 1) the workflow name, 2) blank or a ready-made template. Both open straight on the canvas; the ideal customer and template options (keywords, customer link, titles) are set there. Nothing runs from this page.
- Every block can connect to every other block, from any of its four sides.
- Mixed kinds: any line is allowed. Where it is free and natural, items convert (posts → their authors, people → their current companies); items a block cannot use pass through untouched. The line shows a soft note, not an error.
- Nothing blocks a run except invalid block settings. No trigger, unconnected blocks, no "Add to list", no Score block: all allowed (shown as notes). Run starts from the triggers, or from the blocks with no input when there is no trigger.
- Scoring is optional and removable. Without it, people reach "Add to list" without a score.
- "Tag" is renamed "Add label": it adds labels to each person; labels show on the list and can be filtered.
- `/lists` shows people without a score with only their labels (no Qualified/Maybe badge), in a new "All" view.
- "Get full profile" reads everyone that reaches it; the owner decides who reaches it with If or Filter blocks before it. Its estimate shows the cost.
- If: conditions on a person's fields (score, followers, headline/location/company contains, commented or reacted, has label), combined with All (and) or Any (or) inside the block. It passes on the people that match.
- Else: a separate block connected after an If; it gets the people that did not match that If.
- For each: in batches of N, the blocks after it run per batch, so a run can stop early at the wallet floor.
- Lines back to an earlier block (cycles) are allowed and run as a loop with a cap.
- Send via API: an output block that POSTs the results as JSON to the owner's HTTPS address, with an optional secret header and retries; public addresses only.

Added by the owner (2026-10-17, second round):

- A new output block "Export to CSV": connect it at any point of the flow; after a run the owner can see what reached it and download it as a CSV.
- Every block shows its own output for a run: the owner can open any block of any run and see exactly what it passed on.

- Outputs open in both places: an "Output" tab in the block's dialog when the canvas shows a run, and by clicking a block's row in the Runs tab.
- Every block's output has "Download CSV". The Export to CSV block marks the main result; its file is listed on the run.
- Outputs can be seen for 14 days (the run-items rule); what reached an Export to CSV block is kept 90 days, like runs.
- CSV columns: people = name, headline, location, profile link, score, band, labels, reason, source link, date found; posts = link, author; companies = name, link, hiring roles.
- Blocks inside loops or For each: all rounds together, with a round column in the CSV and a round filter in the view.
- Previews show and export their outputs too.

Open questions: none.

## Scope and non-goals

- In scope: contracts (catalog, conversion, notes vs errors, new blocks, cycle-aware estimate), engine (conversion, If, Else, For each, loops, Send via API, unscored people, full profile for all), additive migrations, the canvas (four-side handles, notes), the new-workflow page, `/lists` "All" view and label filter, tests.
- Out of scope: user-written code or expressions, new data sources.

## Approach

One PR unless it grows too large to review; then split after step 4.

- [x] 1. Lock this plan.
- [x] 2. Contracts: problems get a level (`error` blocks a run, `note` does not); only invalid settings are errors. Kind conversion table. New blocks `logic.if`, `logic.else`, `logic.forEach`, `output.sendApi`; `process.tag` relabelled "Add label". Cycles allowed with a workflow-level "loop rounds" cap (default 3, max 10); the estimate multiplies loop parts by it. Tests first.
- [x] 3. Migrations (additive): list member state `UNSCORED`; step run `round` (default 0) in the step's unique key; run item `round` (default 0) and `keepUntil` (nullable; set to 90 days for items that reached an Export to CSV block, and the retention job skips them until then).
- [x] 4. Engine:
  - Run from triggers, or from input-less blocks when there is no trigger.
  - Conversion between kinds on each line; pass-through for what a block cannot use.
  - If and Else (Else reads its If's non-matching people); For each (per-batch execution, stops at the wallet floor); loops (one step run per round up to the cap, stops early when a round finds nothing new).
  - Get full profile for everyone it receives; Add to list stores unscored people as `UNSCORED` with their labels.
  - Send via API: HTTPS only, the address resolved and refused when private, loopback or link-local (DNS rebinding guard), 10 s timeout, 3 retries with back-off, payload sent in pages (for example 1,000 people a request), the secret never logged or returned to the browser.
- [x] 5. Canvas: handles on all four sides; notes in amber on blocks and lines, errors in red; Run disabled only by errors.
- [x] 6. New workflow page: name, then "Blank" or a template card (icon, one line each); creates the workflow and opens the canvas. Create accepts any graph whose settings are valid.
- [x] 7. `/lists`: an "All" view next to Qualified and Maybe, unscored people with labels only, a label filter; CSV exports the current view.
- [x] 7a. Run outputs: a paged, owner-scoped tRPC query for one block's items in one run (`runId`, `nodeId`, round filter, page) and a CSV download built on the server (cells starting with `=`, `+`, `-`, `@` escaped), the "Export to CSV" block (`output.csv`, free, optional file name), the Output tab in the block dialog during a replay, a clickable row per block in the Runs tab, and the Export files listed on the run.
- [x] 8. Verification, MEMORY.md, Outcome.

## Edge cases and risks

- Without scoring, a list can fill with everyone a post reached; the estimate and run summary show volume and cost before Run. The wallet floor still stops a run.
- Get full profile for everyone is the most expensive block ($0.004 a person); its estimate shows the number before Run.
- Loops multiply spend: the round cap, the wallet floor, and an estimate counting every round.
- Loop rounds change the engine's recovery: a restarted worker must resume the right round of the right step.
- Else without an If before it: a note, and it passes nothing.
- Conversion: posts → authors needs the author's link on the post item (kept from the data service where present); otherwise the post passes through. People → companies uses the current company from the full profile only.
- Send via API sends personal data to an outside address the owner controls: SSRF guard as above, HTTPS only, requests logged without body or secret.
- Old saved graphs stay valid (rules only relax; "Tag" keeps its config keys).
- With no hard rules, a run may do nothing useful; the summary says why (for example "no output block, nothing kept").
- Outputs are personal data: only the run's owner can read them (scoped by user id). They disappear after 14 days, Export to CSV results after 90; a finished run deleted at 90 days takes its items with it. Large outputs are paged; a CSV is capped (for example 50,000 rows) and says so when cut.
- CSV injection: a cell that starts with `=`, `+`, `-` or `@` is prefixed so spreadsheets do not run it (the existing `toCsv` helper is reused and checked for this).

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Brain integration tests: If and Else split, For each batches, a capped loop, unscored people in a list, conversion posts → authors, Send via API to a local test server and a refused private address.
- Real path: create a blank workflow, build Find posts → Get commenters → If (followers ≥ 500) → Add label → Add to list without scoring, and run a preview.

## Outcome

- Shipped: everything in the approach. Contracts give problems a level (only invalid settings, duplicate ids, broken lines, a self-starting chain of workflows and an ideal customer that is not the owner's are errors), allow any line, find loops (`backEdges`, `repeatRegions`) and price every round. The engine runs in rounds (For each batches and capped loops), converts posts to their authors, passes through what a block cannot use, and adds If, Else, For each, Export to CSV and Send via API. Migration `add_workflow_rounds_and_unscored` (additive; the step and item unique keys gained `round`). New page: name, then blank or a template. Canvas: lines on any side, notes in amber, loop rounds, Output tab during a replay. Runs tab: one row per block with its output and CSV. `/lists`: All, Qualified, Maybe, a label filter, CSV of the view with labels.
- Deviations: people cannot become companies (the data gives no company link), so only posts convert (to their authors); everything else passes through. The Send via API secret lives in the block settings, so the owner sees it in the browser; it is never logged. "Get full profile" reads everyone who reaches it, so a scored workflow now also reads its Maybe people (put an If before it to limit cost). Creating a workflow no longer checks problems; templates start with 5 posts and 50 people per post.
- Verified: lint, ts:check, unit tests (contracts rules and loop estimate, If conditions, Send via API address guard and retries, CSV of outputs, graph conversion, loops), brain integration tests (66, including a run without trigger or scoring through If/Else, labels, an unscored list and a kept CSV; For each batches; a capped loop; Send via API with the secret header), build.
- Not verified: the pages in a browser (local sign-in needed); a live run with the data service; Send via API against a real HTTPS server.
