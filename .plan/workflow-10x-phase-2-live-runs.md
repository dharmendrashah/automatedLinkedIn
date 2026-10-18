# Workflows 10x, Phase 2: Live runs in plain words

- Status: done
- Created: 2026-10-18
- Locked by user: yes, 2026-10-18
- Roadmap: `.plan/workflow-10x.md` (locked)

## Goal

While a workflow runs, the owner sees what it is doing right now, what it has cost so far, and when a request that failed will be tried again. When a run ends badly, one plain sentence says why, with a button that opens the block to fix.

## Today (checked in the code)

- **Polling:** [Workflow.tsx](../apps/body/src/pages/Workflow.tsx) polls the runs and the run detail every 3 s while a run is RUNNING.
   - The canvas shows a run only when "Show the last run on the canvas" is ticked.
   - The Runs tab has no badge.
- **The canvas block** ([block-node.tsx](../apps/body/src/components/workflows/block-node.tsx)) shows a status icon, "N in, M out" and the cost. Nothing says a block is waiting for a retry, or how many of its requests are done.
- **The run detail** ([runs.tsx](../apps/body/src/components/workflows/runs.tsx)) shows "State" as a raw code (`running`, `partial`, `failed`). It has the run message in red, and no way from a failed step to the block.
- **Since PR #61** a step keeps up to 5 requests in flight and retries uncharged failures after 1, 2, 5, 15 and 30 minutes (`WorkflowStepCall.attempts`, `retryAt`, `finishedAt`). None of this reaches the screen.
- **Messages:** step messages are plain sentences written by the engine (`WALLET_LOW`, `SERVICE_BUSY`, `PLAIN_FAILURE`, `NOT_CONFIGURED`, `StepError`). Raw data service errors stay in `WorkflowStepCall.error` and are never shown.

## Proposal

### 1. Progress per block (brain)

- `runDetail` gets, for each step, its requests: total, finished, failed, waiting for a retry, and the next retry time. This is one `groupBy` over `WorkflowStepCall` for the run.

### 2. One status sentence per run

- **A pure helper** turns a run into one line. It says "qualified" everywhere, as the tables do:
   - "Running: reading comments, 3 of 5 requests done, 140 people so far, about $1.80 spent of up to $4.00."
   - "Waiting to retry 2 requests at 14:32 (retries are not charged unless they answer). Everything else is done." The day is shown when the retry is not today.
   - "Done: 12 qualified and 9 maybe from 140 people (9%) for $3.10, $0.26 per qualified person."
   - "Finished with gaps: 2 requests never answered (not charged). What was found is kept."
   - "Stopping: finishing 3 requests already paid for." Then "Stopped by you: 4 qualified for $1.20."
   - Wallet stops keep the engine's own message (the shared wallet is never named to clients).
- **Where it shows:** at the top of the Runs tab, on the canvas while a run is live, and on each row of /workflows.

### 3. A live canvas

- While a run is RUNNING, the canvas shows it automatically. The "Show the last run" checkbox stays for finished runs.
- The working block gets a plain "working" tag. No pulsing ring and no line animation (cut on review).
- Each block shows "3 of 5 done · retrying 2 at 14:32", plus its counts and spend.
- Editing stays allowed; a run uses the graph it started with. Blocks that are not in the run are faded, and a note says so.

### 4. Plain step states and a way to fix

- **Plain states:** waiting, working, done, done with gaps, failed, and "waiting to retry" when a request is pending a retry.
- **Fixing:** a failed or gap step gets "Open the block", which switches to the canvas and opens that block's settings.
- **Running another workflow:** a step that waits on another workflow shows "Waiting for <workflow>", with a link to that run.

### 5. Attention badge

- The Runs tab shows a dot while a run is live, and a warning dot when the latest run failed or finished with gaps.
- The /workflows list shows each workflow's latest run as its status sentence.

### 6. Notice when a run ends

- If the page is open when a run ends, a toast gives the sentence, with "See the people" (to Leads) or "Open the run". Nothing is sent outside the app. Links only ever point inside the owner's account.

### 7. Stop a run

- "Stop run" on a live run, after a confirm.
- The run first shows "Stopping: finishing N requests already paid for": nothing new starts, and jobs already running are looked at until they end and are booked. Then the run ends as **Stopped**, a separate state (not Failed).
- The cost shown is then what was really charged.

## Requirements

Confirmed (from the locked roadmap): live block counts, spend so far and retry times; one plain sentence per run; failures open the block; a Runs tab badge.

Open questions: none. Locked by the owner on 2026-10-18 with the review answers: "Stop run" waits for jobs in flight and ends as Stopped; the live canvas opens automatically; the toast shows only while the page is open.

## Persona review of this plan (2026-10-18)

- **GTM engineer:** the block progress and retry time matter most, then "Open the block". Asked for the pass rate in the done sentence, a rough finish time, fading blocks not in the run, and freshness on /workflows. Answered yes to all three questions and to waiting for jobs in flight. Cut: the animations.
- **Agency owner:** asked for the estimate cap in the running sentence, "qualified" everywhere, "per qualified person", gap counts with "not charged", the retry day when it is not today, "Stopped" as its own state, and links only inside the account. Answered yes to all three, and to waiting. Cut: the animations.
- **Not taken:** a finish-time estimate (retry times are shown instead), and "updated N s ago" on /workflows (it refreshes every 3 s while a run is live).

## Scope and non-goals

- In scope: the progress query, the sentence helper (unit-tested), the live canvas, plain states, "Open the block", the badge and the /workflows status column, the toast, and "Stop run" if confirmed.
- Out of scope:
   - Cost per qualified lead per block (Phase 5).
   - Websockets; polling every 3 s stays.
   - Email or Slack notices.

## Approach

- [x] 1. Lock this plan (after the GTM engineer and agency owner reviews).
- [x] 2. Brain, tests first:
   - `WorkflowRunService.progress(runId)`, added to `runDetail` and to the latest run on `workflow.list`.
   - Additive migration: `WorkflowRunStatus.STOPPED` and `WorkflowRun.stopRequestedAt`.
   - `WorkflowService.requestStop`, plus the engine settling jobs in flight (look at each, book it) before ending the run as STOPPED.
- [x] 3. Body: `runSentence` (pure, unit-tested); plain step labels; block progress line; live overlay and edge animation; "Open the block"; badge; /workflows status; end toast.
- [x] 4. Verify all gates, the brain integration tests, and one local run against the fake engine. Then a persona re-review (GTM engineer, agency owner), then MEMORY.md and Outcome.

## Edge cases and risks

- **Many steps (For each rounds):** progress is summed per block across rounds, as `combineRounds` already does.
- **Stopping during a retry wait:** the step's calls stay unfinished; the run is no longer RUNNING, so the engine never picks them up again. Paid jobs already finished are booked; jobs in flight are not looked at again. They were paid at the data service, but the money stays unbooked in the ledger. Option: stopping waits for jobs in flight ("Stopping…") before ending the run. Proposed: wait, so the books stay right.
- **Clock:** retry times are shown in the owner's local time, from the server's `retryAt`.
- **Polling cost:** one extra `groupBy` per poll, only while a run is open.
- **Privacy:** nothing new is shown about people; counts and money only.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, plus the brain integration tests (progress counts with a retry pending, and stop if confirmed).
- A persona re-review of the finished screens.

## Outcome

- **Shipped:**
   - **Brain:**
      - `WorkflowRunService.progress` per step: requests, done, failed, not charged, waiting to retry, next retry time. It is on `runDetail`.
      - Migration `add_run_stop`: `WorkflowRunStatus.STOPPED` and `WorkflowRun.stopRequestedAt`.
      - `WorkflowService.requestStop` and the route `workflow.stopRun`.
   - **Body:**
      - `run-sentence.ts` (unit-tested), used on the Runs tab, in the live banner, in the end-of-run toast and on /workflows.
      - Plain step states, with "Waiting to retry".
      - The block shows "3 of 5 done · retrying 2 at 14:32", a "Working" tag, and "Not in this run" fading.
      - The canvas shows the live run on its own.
      - "Open the block" on failed or gap steps opens the canvas with that block's settings.
      - Runs tab dots: blue live, red failed, amber gaps.
      - "Stop run" with a confirm. The toast follows the newest run.
- **Deviation:** stop no longer settles jobs on the side (that version dropped what paid jobs found). It winds down through the engine instead:
   - `collectEach` starts nothing new once a stop is asked for, but jobs in flight finish and their people are kept.
   - Free steps such as score and add to list still run, and paid steps end "Stopped by you. What was found so far is kept."
   - No new loop or For each rounds start, "Run another workflow" neither starts nor waits for its child, and the run ends STOPPED with no chained runs.
- **Persona re-review (GTM engineer), fixed:**
   - What paid jobs find is kept on stop.
   - The live banner and the canvas follow the newest live run, not the one selected.
   - One name, "Done with gaps".
   - A plain stopping sentence.
   - The day on block retry times.
   - No duplicate state on /workflows, and the cap shown there.
   - An amber dot (not red) for gaps.
- **Verified:** lint, ts:check (forced), unit, build, and brain integration (87, including a pending retry in progress and a stop). Not checked in a browser, because that needs sign-in.
- **Gotcha found:** there is no `apps/brain/.env.test`, so integration tests use the dev database. A running dev worker can claim the tests' queued drawer reads (a flaky person test). Create `.env.test` pointing at a separate database, or stop the dev worker while testing.
