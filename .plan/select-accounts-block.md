# "Select accounts" block, with round robin for profile and company visits

- Status: built, waiting for the live run <!-- draft | locked | in progress | done -->
- Created: 2026-10-25
- Locked by user: yes, 2026-10-25 (answers below)

## Goal

A workflow block where the owner picks one or more of their own LinkedIn accounts. The visit blocks after it ("Visit profile", "Visit company") take turns across those accounts (round robin) instead of using one fixed account. It builds on the single-click tasks `linkedin-view-profile` and `linkedin-view-company` (`.plan/visit-profile-task.md`, `.plan/visit-company-task.md`).

## What exists today (checked in code, 2026-10-25)

- Workflow blocks come from one closed catalog in `packages/contracts/src/workflow.ts` (`BLOCK_TYPES`, `BLOCKS`, each with `group`, `input`/`output` item kind, a zod `config` and `fields` the canvas draws). Executors are in `apps/brain/src/worker/engine/executors.ts` (`EXECUTORS`), one per type; a step can give itself back with `Waiting` (`engine/context.ts`), as "Run another workflow" does.
- Field kinds the canvas can draw include `workflow` and `icp` (values read from the owner's own data). There is no `accounts` field kind.
- No block uses the owner's LinkedIn accounts: every block today reads from the paid data supplier or the owner's lists. So "Visit profile" and "Visit company" do not exist as blocks; they are single-click tasks only, and both plans listed a workflow block as out of scope.
- The visit rules live in `PageVisitService.request` (`database/pageVisit.service.ts`): account must be `ACTIVE`, 15 visits per account per 24 hours (profiles and companies together), the same page once per 30 days per account, own profile refused, plus the task policy (3 minute gap per account, one task at a time per account, `TaskBusyError` / `TaskRecentError`). The visit row (`LinkedInPageVisit`) carries `sessionId`, `status` (`ASKED`/`DONE`/...) and is finished by the task hook.
- A graph edge is only a line between two blocks; items flow along it. Several inputs of one block are merged.

## Proposal

### Three blocks, one new canvas group "Account Actions"

1. **`account.select`, "Select accounts"** (new). Sits in the line. Setting: `accounts`, a list of 1 to 20 of the owner's account ids (several can be selected). It passes every person or company through unchanged and costs nothing. It does the choosing for the visit blocks after it: the closest one upstream of a visit block is that block's pool (several in one path: the nearest wins).
2. **`account.visitProfile`, "Visit profile"** (new). Takes people, asks one visit per person through the pool, gives out the people it visited.
3. **`account.visitCompany`, "Visit company"** (new). Same for companies.

(Without 2 and 3 the first block would choose accounts for nothing, so they are part of this plan.)

### Round robin

Each visit goes to the pool account that went longest without a visit (oldest `LinkedInPageVisit.createdAt`; never visited = first, ties by the order the owner listed them). That is round robin that stays fair across runs and days with no stored counter. An account is skipped for this person when it is not `ACTIVE`, is at 15 in 24 hours, is inside the 3 minute gap or busy, or already viewed that page in 30 days. If every account is skipped for now, the block waits and tries again (see below); a person every account already viewed in 30 days is skipped for good and counted.

### Running (no busy worker)

- The visit block asks one visit per person as accounts become free, using `PageVisitService.request` unchanged (never `confirmed`, so the gap and caps are never overridden) with the owner's `runId` and `nodeId` saved on the visit row (two new nullable columns on `LinkedInPageVisit`, additive migration). The step gives itself back with `Waiting` until every visit it asked ended (`DONE`, `NOT_AVAILABLE`, failed) or its time is up; the engine tick is every 5 s.
- Time limit: the step ends after a fixed wait (proposed: 8 hours). People not visited by then are left out of its output and noted ("12 people left for the next run"); the next run asks again, and the 30 day rule keeps anyone already visited from being visited twice.
- A person whose visit ended `SIGNED_OUT`/`ERROR` is retried on another account once; then counted as failed.
- Preview runs start no visit ("A preview visits nobody").
- Output: the people (or companies) that were visited, with the account and time added to the item's note.

### Where it shows

- Canvas: block summary "Takes turns across 3 accounts"; the inspector's new field kind `accounts` lists the owner's accounts (email, status; a paused or blocked one is shown disabled with the reason, as in the visit dialog).
- Estimate (no money): "About 3.5 minutes per visit per account", so "40 people with 2 accounts: about 70 minutes, at most 30 a day".
- Runs page: the step lists, per account, how many visits it asked.

## Requirements

Confirmed (from your request): a new node, "select LinkedIn accounts", where one or more accounts are chosen, to be used for round robin by LinkedIn actions such as visit profile and visit company.

Answered by the owner on 2026-10-25 (every default accepted; no extra workflow cap, so question 10 is no). Naming confirmed by the owner on 2026-10-25: exactly three nodes, "Select accounts" (several accounts can be selected), "Visit profile" and "Visit company", in one canvas group named "Account Actions":

1. **Visit blocks.** They do not exist yet. Build them in this plan (default: yes, "Visit profile" and "Visit company"), or build only the account block now?
2. **How the visit block finds its accounts.** The nearest "Select accounts" upstream; with none, the run is refused with a clear error (default), or fall back to all of the owner's `ACTIVE` accounts?
3. **Round robin meaning.** "Account that went longest without a visit, skipping ones that cannot act now" (default), or strict order 1, 2, 3, 1, 2, 3 with a stored counter?
4. **Same person, several accounts.** One person is visited by one account, then left alone for 30 days across the whole pool (default; keeps rotation from becoming repeated nudging and keeps the per-account rules), or each account may visit them once?
5. **Limits.** Keep the existing per-account rules unchanged (15 in 24 h, 30 days, 3 minute gap, one at a time) and never raise them for a pool (default). More accounts means more total visits, each account still inside its own limits.
6. **When it cannot finish.** End the step after 8 hours and leave the rest for the next run (default), or a different wait (4 h, 24 h)? Or let the owner set it on the block?
7. **Failures.** One retry on another account, then count it failed and go on (default).
8. **Who may be chosen.** Only the owner's own accounts, checked when the run starts and again for each visit (an account removed or paused later is skipped, noted); a pool with no usable account at run start fails the step ("none of the chosen accounts can act now") (default).
9. **Which people.** The visit block takes any people reaching it (saved profiles, found people, `/profiles` input), skipping the account's own profile and anyone on the do-not-contact list (default: yes, unlike the single click, because here nobody chose the person by hand; say if you prefer the same as the click, which does not check it).
10. **Scope of limits for a pool.** Is a daily cap on the whole workflow wanted (for example "at most 30 visits a day across the pool")? Default: no extra cap beyond each account's 15.

## Scope and non-goals

- In scope: the three blocks (catalog entries, config, `accounts` field kind, summary and estimate text), executors with the wait, the additive migration (`runId`, `nodeId` on `LinkedInPageVisit`), runtime owner and status checks, notes in `validateGraph`, canvas inspector field, tests, `MEMORY.md`.
- Out of scope: other LinkedIn actions (message, connect, like, follow), choosing accounts per client or by label, weighting an account more than another, changing any limit, scheduling by time of day, reading anything from the visited pages, a new page for pools.

## Approach

- [x] 1. Lock this plan (answer the open questions).
- [x] 2. Contracts, tests first: block catalog entries, config schemas (`accounts` unique, 1 to 20 ids), `accounts` field kind, `validateGraph` (a visit block with no pool before it is an error; a pool with no visit block after it is a note), estimate text; guard test that no text names the data supplier.
- [x] 3. Migration `add_visit_workflow_link` (create-only, folder name sorts last, read the SQL, apply to both local databases): `runId`, `nodeId` on `LinkedInPageVisit` with an index on `(runId, nodeId)`.
- [x] 4. `PageVisitService`: accept a run link; a pure `pickAccount` (oldest visit first, skip rule) with unit tests; a way to ask "can this account act now" without starting the task, so the engine does not have to catch refusals.
- [x] 5. Executors for `account.select` (pass through, runtime ownership check) and the two visit blocks (ask as accounts free up, `Waiting`, timeout, one retry, output), with unit tests and an integration test on Postgres (round robin order across 3 accounts, cap and gap skipping, an account paused mid-run, preview starts nothing, timeout leaves the rest, no double visit across runs).
- [x] 6. Body: the `accounts` field in the block inspector, block icons and summaries, estimate line; pure helpers with tests first.
- [ ] 7. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` with all warnings fixed, brain integration tests, one live run on staging or locally with 2 test accounts and a short list, your go-ahead before any live visit; `MEMORY.md`; plan done.

## Edge cases and risks

- **Compliance and account risk.** The caps and gaps stay per account, so a pool raises the total only by adding accounts, each as slow as before; the pool never confirms past a gap or cap. Even so, rotating many accounts to view many people is the kind of volume LinkedIn watches, and the visits are automated activity by accounts that belong to the owner. The default of one visit per person across the whole pool in 30 days keeps it from turning into repeated nudging. Nothing is read from the pages. A hard daily total for the workflow (question 10) is the stronger brake if wanted.
- **Empty or invalid pool.** No account, a duplicate id, more than 20: refused when saving. An account of another owner (a crafted graph): the step fails at run start with a fixed message; `NOT_FOUND`-style, never says it exists.
- **Accounts that change mid-run.** Paused, blocked, signed out or removed accounts are skipped for later visits; their running visit finishes on its own. All skipped: the step waits until its time limit, then ends with what it did.
- **Concurrency.** Two runs (or two workflows) using the same account at once: the per-account rules in `PageVisitService` and the task policy decide, so the block only sees refusals and waits. The pick is by "oldest visit", read at ask time; two engine workers claiming the same step is already prevented by `claimedAt`.
- **Idempotency.** Each item's visit is keyed by run, node and slug, so a retried or resumed step never asks twice (the visit row's `runId`, `nodeId`, `slug` are read first). A resume after a crash reads the visit rows and continues.
- **Long runs.** A run can stay RUNNING for hours: the wallet floor and run limits are unaffected (the block is free), but the "Run another workflow" depth and the engine's stale-claim rules must hold with a step that gives itself back for hours (check in step 5).
- **Loops and For each.** Each round or batch asks its own visits; the 30 day rule makes a loop back harmless.
- **Existing data.** Additive migration with nullable columns; single-click visits keep `runId` null and are unchanged. Old graphs have no new block types, so they validate as before. Rollback: remove the three catalog entries and their executors; the columns stay unused.
- **Security.** The graph holds account ids only (never emails or secrets); the inspector reads the owner's accounts through the existing owner-scoped list. Log lines carry counts and ids, never page content.
- **Dev vs production, Docker, CI.** No new env var, image or dependency. The worker does the asking, so staging's idle checker sees log lines only when a visit was asked for.
- **Not verifiable here.** How many people the pool can really visit per day before LinkedIn reacts; whether visits by several of the owner's accounts to the same company page look different to LinkedIn.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; brain integration tests with Postgres.
- One live run with 2 test accounts and 3 to 4 people, with your go-ahead at that moment, to watch the order of accounts, the gap, and the step waiting and finishing. State what could not be run.

## Outcome

Built on `feat/select-accounts-block` (steps 1 to 6 done; step 7 waits for a live run with your go-ahead). Shipped: contracts blocks `account.select` ("Select accounts"), `account.visitProfile` ("Visit profile"), `account.visitCompany` ("Visit company") in the group "Account Actions", the `accounts` field kind, `nodeBefore`, and `validateGraph` (a visit block with no "Select accounts" before it is an error; an unused "Select accounts" is a note); migration `add_visit_workflow_link` (`runId`, `nodeId` on `LinkedInPageVisit`); `PageVisitService.request` takes the run link and refusals carry a `reason` (`REPEAT`, `CAP`, `OWN`, `LINK`); `VisitPoolService` and `idleFirst`; executors in `worker/engine/visitPages.ts`; body account picker, icons, group style and card summary.

Deviations: the time limit is 8 hours from the run's start (the step has no start time of its own); the output carries the people viewed unchanged (no account or time note on the item; the step message counts them); no time estimate (the estimate is money only, and these blocks cost none); an account is skipped for the rest of a tick on any refusal that says it is not free now, which saves the engine from asking a busy account for every person.

Checks: lint, `ts:check`, unit tests (contracts 172, body 576, brain 1,213, spider 1,022), build, brain integration (160, including three runs through the engine with three accounts: turns, waiting, done with a page not available, a person the pool viewed lately left out, and a pool with no usable account failing). Not run: a live visit through a workflow; how LinkedIn reacts to several accounts visiting.

Follow-ups: one live run with 2 test accounts and a short list, with your go-ahead.
