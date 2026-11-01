# Workflow hardening, and Input, Output and Error details for every block

- Status: locked <!-- draft | locked | in progress | done -->
- Created: 2026-11-01
- Locked by user: yes, 2026-11-01 (answers below; build not started)

## Goal

1. Find and fix the edge cases of the workflow editor, validation and engine.
2. Every block shows what it takes in before it ran, what it passed on after it ran, and, when it failed or ended with gaps, a plain explanation of what happened, why, and what the owner can do about it.

## What exists today (checked in code, 2026-11-01)

- The block dialog (`block-settings.tsx`) shows "Output of the run" only while a run is replayed on the canvas (`output` prop, `BlockOutput`, router `workflow.output` and `outputCsv`). There is no input view at all, and a block that was not run shows nothing.
- A step stores `status`, `itemsIn`, `itemsOut`, `costMicros`, `message`, `tries`, `waitUntil`. A failure keeps one sentence (`message`), with no code, no cause and no advice. Every unexpected error, and every data service error except "not configured", becomes "Something went wrong in this step. The platform owner has been told." (`engine.ts` `PLAIN_FAILURE`); the real cause is only in the worker log.
- What a block takes in is never stored: it is the output of the blocks before it in the same round (`readInputs` in `engine.ts`).
- Run rows keep `graph` (a copy), items live 14 days (a run that is still going keeps them, since the Wait work).

## Part A: Input, Output and Error on every block

### What the owner sees

The block dialog gets a state strip, an optional error panel, and three tabs (Input, Output, Settings):

| Block state | Strip | Default tab | Input tab | Output tab |
| --- | --- | --- | --- | --- |
| Never ran (no run, or added after the run) | "Not run yet" | Input | What it will take (see below) | "Nothing yet. Run the workflow to see what this block passes on." |
| Waiting or working | "Waiting until 8 Nov, 14:30" or "Working, 12 of 40 done" | Input | What came in so far | What it passed on so far (refreshes) |
| Done | "Done, 25 in, 18 out, $0.12" | Output | What came in | What it passed on (existing table and CSV) |
| Done with gaps | as above plus "Done with gaps" | Output | as above | as above, plus the error panel for the gap |
| Failed | "Failed" | Output (empty) | What came in (so the owner sees what the block choked on) | "Nothing passed on" |
| Run changed since | badge "This block changed after the run" | unchanged | unchanged | unchanged |

Input before a run ("what it takes"): the kind it takes (people, posts, companies, anything), the blocks connected before it, the settings it will use (read only summary), the estimate for the block (about how many items and the cost, from `estimateGraph`), and for the input blocks (Profiles, Posts, Companies) the live matches (the existing `workflow.inputMatches` list). A trigger says how it starts. A block with nothing connected before it says so ("Nothing is connected before this block, so it gets nothing").

Input after a run: the items that really reached it (page by page, with the CSV download), the same table as Output, with a "from" column naming the block each item came from.

Which run a block shows: the run on the canvas when "Show the last run" is on or a live run is shown; otherwise the newest run of the workflow (live first). A block with no step in that run counts as never ran.

Error panel (above the tabs when a step is `FAILED`, or `PARTIAL` with a reason):

- **What happened**: one sentence ("Visit a profile stopped: none of the chosen accounts is signed in").
- **Why this can happen**: 1 to 3 short likely causes.
- **What you can do**: ordered steps, each with a button where the fix is one click away ("Open settings", "Go to LinkedIn accounts", "Add a Retry block after this one").
- **Details**: a small reference (error code, step id start, time, try number) with a Copy button, for support. Never raw error text, keys, addresses, personal data or the data supplier's name.

On the canvas a failed block shows a red line "Failed: <title>" and clicking it opens the dialog on the error. The Runs tab "Note" column shows the same title with a "Details" link that opens the block.

### Structured step errors (back end)

- New nullable column `WorkflowStepRun.errorCode` (additive migration, no backfill: older steps show their sentence only, with code `UNKNOWN`).
- `StepError` takes a code. `engine.ts` writes it with `finishStep`. Unexpected errors get `UNEXPECTED`; data service errors map by kind.
- One table in `packages/contracts/src/workflow.ts` (`STEP_ERRORS`, neutral wording, no supplier name) maps each code to `{ title, why[], fixes[{ text, action? }] }`. The body gets it through the step read; the brain keeps writing only the code and the existing owner-facing sentence.
- `runDetail` steps return `errorCode`; the body looks up the advice from the table so wording changes never need a migration.

Codes to cover (every place a step can end FAILED or PARTIAL today):

| Code | Where | Message today |
| --- | --- | --- |
| `ICP_DELETED` | score blocks | The ideal customer this workflow scores against was deleted. |
| `NO_BLOCK_BEFORE` | Task result, Retry | needs a block before it to look at |
| `NEEDS_SELECT_ACCOUNTS` | visit, Write a post | This block needs "Select accounts" before it. |
| `ACCOUNTS_MISSING` | visit | None of the chosen accounts was found. |
| `ACCOUNTS_SIGNED_OUT` | visit, Write a post | None of the chosen accounts can act now: they need to be signed in. |
| `VISITS_STOPPED` | visit | Visits stopped: <why>. |
| `POST_UNREADABLE` | Write a post | The post cannot be read. Open the block and write it again. |
| `POST_REFUSED` | Write a post | the account's limit sentence (1 hour between posts, 3 per 24 hours, same words 7 days) |
| `POST_UNSURE` | Write a post | The post may have gone. Check your posts on LinkedIn. |
| `POST_FAILED` | Write a post | The post did not go. Nothing was posted. |
| `CHILD_START_FAILED`, `CHILD_ENDED` | Run another workflow | Could not start the other workflow / <name> <outcome>, so it gave nothing back. |
| `DATA_NOT_CONFIGURED` | data blocks | Collecting data is not available right now. |
| `DATA_REJECTED` | data blocks (kind BAD_REQUEST) | falls into the generic message today |
| `DATA_UNAVAILABLE`, `DATA_TIMEOUT` | data blocks | "did not answer for some requests" (PARTIAL) or the generic message |
| `WALLET_LOW` | data blocks | Collecting stopped because the data wallet ran low. |
| `RUN_UNREADABLE` | engine | new, see part B |
| `UNEXPECTED` | anything else | Something went wrong in this step. |

### Input read (back end)

- New `workflow.input({ runId, nodeId, round?, page, pageSize })` and `inputCsv`, owner scoped like `output`. It reuses the engine's `readInputs` rule (same round, back lines, For each reads round 0, Else reads its source's `~else`), extracted into one pure helper in `database/` so the engine and the read cannot drift. Results carry the source block id of each item.
- Nothing new is stored. Items are subject to the same 14 day keep time; the panel says "These results were deleted after 14 days" when the step finished earlier than that (today it says "or it is older than its keep time").

## Part B: Edge cases found and what fixes them

Verified by reading the code (a failing test comes first for each):

1. **Unsaved canvas changes are lost when the owner opens the Runs, Settings or API tab** (Radix unmounts the hidden tab) and when leaving the page inside the app (only the browser's reload warning exists). Fix: keep the canvas mounted while hidden, and block in-app navigation with a "Leave without saving" confirm while there are unsaved changes.
2. **Two tabs or two people saving the same workflow: the last save silently wins.** Fix: `update` takes the `updatedAt` the editor loaded; a mismatch is a `CONFLICT` with a clear sentence and the choice "Reload" or "Save anyway".
3. **Blocks with a type the catalog no longer knows are dropped from the canvas** (`toFlow` skips them) and so deleted from the workflow on the next save. Fix: show them as an "Unknown block" card that can be deleted but never silently lost.
4. **Saving an enabled workflow that has a problem is refused with "switching it on"** although the owner switched nothing, so work in progress cannot be saved. Fix (owner's answer): the graph is saved, the workflow is switched off in the same write, and the page says so ("Saved. The workflow was switched off because it has problems: ..." with the problems listed). Asking to switch it on (`enabled: true`) with problems is still refused, as today. Switching off also clears `nextRunAt`, so no scheduled run starts from a half-edited graph.
5. **Deleting a workflow while a run is going** deletes the run rows under the worker. Fix: refuse with "Stop the run first" (a stop request already exists).
6. **A run whose stored graph no longer parses** (`readGraph` throws inside `advanceRun`) errors on every tick and stays `RUNNING` forever. Fix: end the run `FAILED` with code `RUN_UNREADABLE`.
7. **Generic "Something went wrong" hides the cause** for every unexpected error and every data service error except one: part A.
8. **A waiting run gives no sign why Run now or the schedule does nothing.** Fix: the conflict message says when the run resumes ("A run of this workflow is waiting until 8 Nov, 14:30"), and the live run sentence says "Waiting until ...".
9. **A block added after the run shows "Not in this run"** (misleading in the replay) and **a block whose settings changed after the run** is shown as if the run used the new settings. Fix: say "Added after this run", and show "This block changed after the run" by comparing the run's graph copy with the canvas.
10. **Output of a block whose results are older than 14 days** gives the same text as "nothing passed". Fix: separate texts (part A).

To verify first (an audit found them but they were not confirmed; each gets a test that proves or drops it): schedule next-run around a daylight saving change for "every few hours between"; a Task result that falls back to round 0 for a loop's later rounds; For each with a batch size of 0 sent through the API; edges to deleted blocks reaching the engine; workflow deleted or disabled while a run waits.

Known and deliberately left: a day of month above 28 is not offered (the schedule caps at 28 by design); one live run per workflow.

## Requirements

Confirmed (from your request): all edge cases found and fixed; every block shows its input when it has not run and its output when it has; an error shows the details, why it happened and what could fix it.

Open questions (must be empty before locking): none. Answered 2026-11-01:

1. Panel place: inside the block dialog.
2. Run shown with replay off: the newest run still shows its input and output.
3. Enabled workflow with a problem at save time: save the graph and switch the workflow off with a notice (changed from the plan's proposal, see edge case 4).
4. Error detail: code and reference only, no raw text.
5. Deleting a workflow with a live run: refuse, "Stop the run first".

## Scope and non-goals

- In scope: `packages/contracts` (error table, input shape), brain (`StepError` codes, `errorCode` column, `input`/`inputCsv`, delete guard, `update` version check, unreadable graph), body (dialog tabs and states, error panel, canvas failed line, Runs note, tab and navigation guard, unknown block card, conflict dialog), tests, `MEMORY.md`.
- Out of scope: new block types, retry rules, changing limits or prices, run history beyond 50 rows, editing a block while a run is live (runs keep a graph copy), a bell or e-mail for failures.

## Approach

Each step starts with a failing test.

- [ ] 1. Contracts: `STEP_ERRORS` table and codes; a test that every code has a title, a reason and a fix, never names the data supplier, and every `StepError` code is in the table.
- [ ] 2. Brain: `StepError(code, message)`, engine writes `errorCode` (migration `add_step_error_code`, additive), data errors mapped by kind, `RUN_UNREADABLE`, delete guard, `update` version check, wait-aware conflict sentence, switch-off on save with problems (the answer returns `switchedOff` and the problems).
- [ ] 3. Brain: shared input helper (extracted from `readInputs`), `workflow.input` and `inputCsv`, tests including loops, For each, Else and Retry.
- [ ] 4. Body: block dialog state strip, tabs (Input, Output, Settings), default tab rules, input before a run (estimate, matches, connections), error panel, copy details.
- [ ] 5. Body: canvas failed line, Runs note with Details, "Added after this run" and "changed after the run", unknown block card, expiry texts, waiting sentence.
- [ ] 6. Body: keep the canvas mounted across tabs, leave guard, save conflict dialog, enabled-workflow sentence.
- [ ] 7. Verify the "to verify" list with tests; fix what is real.
- [ ] 8. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests, run a failing workflow through the real path (tRPC and the page), `MEMORY.md`, plan `done`.

## Edge cases and risks

- **Privacy.** Input and Output show person data already stored for the run; they are owner scoped by run and obey the 14 day keep time. The error panel never shows raw error text, keys, addresses or the supplier's name (a test scans the table and the code strings).
- **Old steps.** Rows from before the migration have no code: they show their sentence, the generic fixes for `UNKNOWN`, and no reference.
- **Message vs code drift.** The sentence stays the source of "what happened" for coded steps that carry facts (account names, limits); the table supplies only why and fixes, so a reworded sentence never breaks a code.
- **Large inputs.** Input pages like Output (25 a page, CSV capped at the existing row limit); counting uses the same indexes.
- **Concurrency.** The input read is a read of finished rows; a step that is still working shows what is stored so far and refreshes every few seconds like the run view.
- **Version check.** An update without the loaded `updatedAt` (API clients, other callers) keeps working as today; only the editor sends it.
- **Leave guard.** Must not trigger after a successful save, on a reload (browser dialog already), or for a canvas that was only re-laid out.
- **Migration.** One nullable column, no data change, rollback is dropping it (the body ignores a missing code).
- **Cost of the unknown-block card.** A graph with an unknown type already fails `validateGraph`? To confirm in step 7; if so the card also shows that error.
- **Not verifiable here:** the page behind sign-in in a browser, a real data service failure (simulated with the fake client).

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; brain integration tests with Postgres (input read, error codes through the engine, delete guard, version check).
- Through the real path: a workflow that fails (deleted ideal customer), one that waits, one that finishes; open each block's dialog; confirm the three states and the advice.

## Outcome

Filled in when done.
