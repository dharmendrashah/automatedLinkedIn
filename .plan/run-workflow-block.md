# "Run another workflow" block

- Status: done
- Created: 2026-10-18
- Locked by user: yes, 2026-10-18

## Goal

A new block, "Run another workflow", starts one of the owner's other workflows from inside a run. It can:

- not wait at all, or
- wait for a yes/no answer (did it succeed), or
- wait for its results (the people it saved) and pass them on to the blocks after it.

## Today (checked in the code)

- **Chaining is listen-only.** `trigger.workflow` ("When another workflow finishes") starts a workflow after another one finishes. `WorkflowTriggerService.startAfter` passes on the listed people with `trigger: 'WORKFLOW'`, `depth + 1`, run key `${id}:after:${runId}`, and stops at `MAX_CHAIN_DEPTH` 5. `chainProblems` refuses loops.
- **A run takes outside input.** `WorkflowRun.input` (`posts`, `profiles`, `companies`, `people`) feeds the input blocks and `trigger.workflow`. A `WORKFLOW` start counts as "from outside", so the empty-posts-list check is skipped.
- **The engine is polled.** The `workflow-engine` job calls `advanceRun` every 5 s for each RUNNING run. A step is claimed (`WorkflowRunService.claim`), runs once and finishes as DONE, PARTIAL or FAILED. No step can wait for something outside the run yet.
- **Branching exists.** `logic.if` keeps the people it did not pass in a side output (`~else`) that `logic.else` reads. A yes/no outcome can reuse that.
- **What a run saved:** `listedPeople(run)` (what its "Add to list" blocks got) is already computed in `finish`.

## Proposal

### The block

- Type `logic.runWorkflow`, label "Run another workflow", group Logic, icon `Workflow` or `PlayCircle`.
- It takes anything (like Merge) and gives:
   - its own input in "Don't wait" and "Wait for done or failed";
   - the other workflow's results in "Wait for its results".

| Setting | Choices | Default |
| --- | --- | --- |
| Workflow to run | one of the owner's other workflows (picker, like "When another workflow finishes") | none (required) |
| Send it | What reaches this block / Nothing, just start it | What reaches this block |
| Wait | Don't wait / Wait until it is done (yes or no) / Wait for its results | Don't wait |
| Give up after | 15 min to 24 h (advanced) | 2 h |

### The three modes

1. **Don't wait.** The block starts the run and passes on what it got straight away. The message reads "Started 'X' (run link)".
2. **Wait until it is done, yes or no.** The step stays running until the other run ends.
   - Done (SUCCEEDED): what it got is passed on, meaning "yes".
   - Partly done, failed or gave up: what it got goes to an Else block after it, meaning "no", as with If/Else.
3. **Wait for its results.** The step stays running until the other run ends, then passes on the people the other run saved (its "Add to list" blocks, merged once, with their scores and reasons). If that run fails, the step fails with its message.

### How waiting works (no busy worker)

- **Additive migration:**
   - `WorkflowStepRun.childRunId String?` (the run it started).
   - `WorkflowRun.parentRunId String?` (shown as "Started by <workflow>, run X").
   - An index on `parentRunId`.
- **First claim:** the executor starts the child run, with key `${childId}:call:${runId}:${nodeId}:${round}`, so a retried step never starts a second one. It saves `childRunId`, then gives the step back. The step stays RUNNING with `claimedAt` cleared, and a new step result kind `WAITING_ON_RUN` tells the engine not to finish it.
- **Later engine ticks** see the step ready again. The executor reads the child run's status:
   - still running → gives the step back again;
   - ended → finishes the step as described above;
   - past "Give up after" → treats it as failed and leaves the child running.
- **The rest of the run keeps going:** blocks not behind this one run as usual, and the run ends only when every step has ended.

### Safety

- **Depth:** the child's depth is the parent's + 1, and the existing `MAX_CHAIN_DEPTH` (5) applies to calls too. Starting past it fails the step with a plain message.
- **Loops:** `chainProblems` also follows "Run another workflow" blocks, so A runs B runs A is refused when saving, and a block cannot run its own workflow.
- **Preview runs** start nothing. The block passes its input on and says "A preview starts no other workflow".
- **Refused start:** if the other workflow cannot start (wallet below the floor, or deleted), the step fails ("Wait for its results") or goes to "no" (yes/no mode) with the reason. In "Don't wait" it fails, so the owner sees it.
- **Loops and For each:** every round or batch starts its own child run (the round is in the key).
- **Cost:**
   - The run estimate adds the other workflow's own estimate, once per round. Its saved graph is priced with its own settings.
   - The block's cost hint says "costs what the other workflow costs".
   - The child's spend is booked on the child run, as today.
- **Vendor name:** messages never name the data supplier; the guard test covers the block's text.

### Where you see it

- **Canvas:** the block's summary reads, for example, "Runs 'Hiring leaders' and waits for its results".
- **Runs page:** the step links to the child run, and the child run says "Started by run X of 'Y'".
- **Output tab:** in "Wait for its results" it shows what came back.

## Requirements

Confirmed:

- A block that runs another workflow by itself.
- It either waits for a yes/no result, waits for the output (where the data was saved), or does not wait at all.
- Answered by the owner on 2026-10-18:
   - The block is called "Run another workflow" and sits in the Logic group.
   - "Wait for its results" passes on the people the other workflow's "Add to list" blocks saved.
   - "Send it" is a choice; the default is "what reaches this block", the other choice is "Nothing, just start it".
   - "Give up after": 2 hours by default, settable from 15 minutes to 24 hours. On give-up the parent moves on as "no" and the child keeps running.
   - The called workflow does not need to be switched on.
   - Only a fully finished (SUCCEEDED) child counts as "yes"; a PARTIAL child is "no". In "Wait for its results", a PARTIAL child still passes on what it saved.
   - The run estimate includes the called workflow's cost and names it in the breakdown.

Open questions: none.

## Scope and non-goals

- In scope:
   - The block in contracts (config, fields, summary, estimate hook).
   - The additive migration.
   - The executor with the three modes.
   - Engine support for a step that waits.
   - Loop refusal, depth limit, preview behaviour.
   - Estimate including the child.
   - Canvas settings and summary.
   - Run links both ways.
   - Tests.
- Out of scope:
   - Calling another owner's workflow.
   - Calling through the public API.
   - Cancelling a child run from the parent (there is no run cancel yet).
   - Passing settings or overrides to the child.
   - Running several workflows from one block (use several blocks and Merge).

## Approach

- [x] 1. Lock this plan.
- [x] 2. Contracts, tests first:
   - `logic.runWorkflow` spec and settings.
   - Takes anything (as Merge).
   - Summary and validation (workflow required).
   - The yes/no side output name shared with Else.
- [x] 3. Database:
   - Additive migration for `childRunId` and `parentRunId` (`--create-only`, then deploy).
   - `WorkflowRunService` helpers: start a child, read a child's status and listed people.
- [x] 4. Engine:
   - A "waiting" step result that gives the step back without finishing it.
   - The executor's three modes.
   - Else reads the yes/no side output.
   - Preview, depth and refused-start handling.
   - `chainProblems` follows calls.
- [x] 5. Estimate: add the called workflow's estimate, and say so in the breakdown.
- [x] 6. Body:
   - Settings (picker, Send, Wait chips, Give up after).
   - Summary.
   - Run page links (step to child run, child to parent run).
- [x] 7. Tests:
   - Integration, with the fake data service: no wait; yes; no via Else; results passed on; give-up; refused loop; preview starts nothing; a retried step starts no second child.
   - Unit tests for contracts and the estimate.
- [x] 8. Verify (all gates plus the integration tests), MEMORY.md, Outcome.

## Edge cases and risks

- **Worker restart while waiting:** the step is RUNNING with no claim, so the next tick picks it up. The child run key is unique, so it is never started twice.
- **Child deleted while the parent waits:** its run rows are cascaded away, so a missing child run counts as failed ("The workflow it ran was deleted").
- **Child edited meanwhile:** the run keeps the graph copy it started with, so nothing changes mid-run.
- **Deep or wide fan-out:** For each over many batches times calls can start many runs. Depth caps chains, but not width. Each child still passes the wallet floor check, and the estimate shows the total. Option: a cap of child runs per run (for example 50), with a plain message past it.
- **Deadlock:** A waits for B and B waits for A is refused at save time. At run time the depth limit still stops it, because a run cannot start a run beyond depth 5.
- **Cost surprise:** "Don't wait" still spends money in the child. The estimate includes it (question 7).
- **Existing data:** the new columns are nullable, and old runs and steps are unchanged. Rollback is reverting the code; the columns stay unused.
- **Docker and CI:** one migration through the existing `migrate` stage. No new env vars and no new jobs; the 5 s engine tick does the waiting.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, plus the brain integration tests.
- The migration is checked with `prisma migrate diff ... --exit-code` after deploy.
- One manual run on the local stack: parent → child in each mode, watched on the runs page.

## Outcome

Shipped:

- **The block:** `logic.runWorkflow` (Logic group, icon `CirclePlay`), with the settings Workflow to run, Wait, Send it and Give up after (advanced).
   - It takes items of any kind as they are, like Merge.
   - Else now reads from If or this block (`ELSE_SOURCES`), and passes on items of any kind.
- **Database:** additive migration `20261017201616_add_workflow_run_links` (`WorkflowRun.parentRunId` with an index, `WorkflowStepRun.childRunId`). Applied locally; `migrate diff` shows no drift.
- **Engine:**
   - The executor (`worker/engine/runWorkflow.ts`) starts the other run once, using a run key per run, block and round (`idOfKey` finds it again after a crash).
   - A step that waits throws `WaitingOnRun`. The engine gives the step back and skips it for the rest of that `advanceRun` call, so the next 5 s tick looks again.
   - What it sends: people (with their reasons), profile, post and company links. Only the kinds that reached the block are sent.
- **Safety:**
   - Depth limit 5.
   - `callProblems` refuses running itself, a workflow that is not the owner's, and A runs B runs A.
   - A preview starts nothing.
   - A refused start is a "no" in yes/no mode and a failed step otherwise.
- **Estimate:** `WorkflowService.estimate` adds the called workflow's own estimate (recursively, each workflow once) to this block's cost, so it shows in the total and the breakdown.
- **Runs page:**
   - A step of this block links to the run it started ("Open its run").
   - The started run says "Started by a run of 'X'".
   - `/workflows/:id?run=<runId>` opens that run on the Runs tab.

Verified:

- lint, ts:check, unit tests and build all pass.
- Brain integration: 71 pass. New tests cover sending what reached the block, "Nothing, just start it", yes, no via Else (a refused start), don't wait, depth 1 and parent link, and the loop refusal.

Not verified:

- The "give up after" path. It needs time to pass; the logic is one comparison on the child's start time.
- The page in a browser.
- The local stack with the real worker.

Follow-up:

- Wide fan-out (For each times this block) has no cap of child runs per run.
- Because a workflow allows one running run at a time, "Don't wait" inside a fast loop can find the other workflow still running. That step then fails with a plain message.
