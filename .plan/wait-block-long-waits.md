# Wait block: minutes, hours, days and weeks

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-01
- Locked by user: yes, 2026-11-01 (longest wait 1 year; the other defaults accepted)

## Goal

The Wait block (`logic.wait`, `.plan/logic-wait-result-retry.md`) only counts seconds, up to 1 hour. Let the owner wait in seconds, minutes, hours, days or weeks, so a workflow can say "visit, wait 3 days, then message". It stays generic: it passes any items on unchanged, for every block.

## Requirements

Confirmed (from the request): wait for hours, days and weeks, in the Wait node.

Proposed defaults (change any before locking):

1. A unit picker next to the number: Seconds, Minutes, Hours, Days, Weeks (minutes added so there is no gap between 59 seconds and 1 hour).
2. Longest wait: 1 year (365 days, 52 weeks) in one block, the owner's answer. Chain two Waits for more.
3. Both modes keep working: Exactly (`amount`) and Between (`minAmount` to `maxAmount`, one random moment picked once, to the second).
4. A day is 24 hours, a week is 7 days (no calendar or time zone logic).
5. The run view says when a waiting step resumes ("Resumes 8 Nov, 14:30").
6. Stopping a run ends the wait at once, however long it was.
7. Saved workflows keep working: a data migration renames the old settings (`seconds` becomes `amount` with unit seconds).

Open questions (must be empty before locking):

- None. Answered 2026-11-01: ceiling 1 year (it keeps the run's people and scores in the database that long); the rest accepted.

## Scope and non-goals

- In scope: contracts (units, amount keys, cap, summary), engine wait time, hold-back release on stop, retention of items of a run that is still waiting, migration of saved graphs, body form, card summary, run view note, tests, `MEMORY.md`.
- Out of scope: waiting for a time of day or a weekday, business-hours waits, waiting per item, the Retry pause (stays 0 to 3,600 seconds), calendar-aware days (daylight saving).

## Approach

- [x] 1. Contracts, tests first: `WAIT_UNITS`, `UNIT_SECONDS`, `toSeconds`, `MAX_WAIT_BLOCK_SECONDS` (365 days), Wait config `unit`, `amount`, `minAmount`, `maxAmount` (refine: low end not above high end, longest end not above the cap), field list with the unit picker.
- [x] 2. Engine, tests first: the Wait executor picks its moment from amount and unit (random between, once); `advanceRun` does not hold back a step with a future `waitUntil` once the owner asked to stop.
- [x] 3. Retention, tests first: items of a run that is still `RUNNING` are not deleted at 14 days (a run's wait is capped at a year per block, so they cannot stay forever; they go with the first retention pass after the run ends).
- [x] 4. Migration `20261101220000_wait_block_amount_unit` (data only): rewrites `logic.wait` nodes in `Workflow.graph` and `WorkflowRun.graph`. Checked on a scratch database with sample graphs (also run twice), then applied to both local databases.
- [x] 5. Body, tests first: summary ("Waits 3 days", "Waits 2 to 4 hours"), the generic form shows Wait, In (unit), then the amounts for the mode; run view note "Resumes 8 Nov, 14:30" (`waitUntil` added to the step read).
- [x] 6. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` pass, brain integration tests (51 files, 327 tests) pass; `MEMORY.md`.

## Edge cases and risks

- **One live run per workflow.** A run that waits for days keeps the workflow's run `RUNNING`, so a schedule tick or Run now answers "A run of this workflow is still going" (the schedule job skips it quietly). A weekly wait on a daily schedule therefore runs the workflow once a week. Worth a line in the block's hint.
- **Raw data kept longer.** Items are deleted at 14 days today, even for a run that is still going: a wait over 14 days would lose its people. Retention must skip running runs. Privacy: the owner accepted that a waiting run keeps its people and scores for as long as it waits (up to a year per Wait block); they are deleted at the first retention pass after the run ends.
- **Stop.** The engine holds a step back until `waitUntil`, so Stop would not be seen for weeks; the hold must lift once a stop is requested.
- **Existing workflows.** Saved graphs and runs use `seconds`, `minSeconds`, `maxSeconds`; a data migration renames them, and the new config defaults make a missing `unit` mean seconds. A run in flight whose Wait already has a `waitUntil` is untouched.
- **Invalid input.** Zero, negative, fractional, or above 1 year is a graph error (shown on the block, run refused). Low end above the high end stays an error.
- **Restart and double run.** `waitUntil` is saved on the first claim, so a restart or a second worker waits for the same moment; a random wait is never rolled again.
- **Wallet and accounts.** A long wait holds no money and no account. Whatever runs after it still checks the wallet floor and the browsing budget at that time.
- **Loops.** Each round of a loop or For each waits again, so a 3 round loop with a 1 week wait takes 3 weeks (bounded by the loop rounds).
- **Retry pause unchanged.** `MAX_WAIT_SECONDS` stays for Retry.
- **Security and secrets.** None involved. **Dev vs production, Docker, CI:** no new env var or dependency. **Rollback:** revert the code; the migration is not reversible by itself (old keys would need renaming back), so keep a copy of the old graphs in the migration comment.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Brain integration tests: a day-long wait holds a step, a stopped run ends it, retention keeps items of a running run.
- Through the real path: save a workflow with Wait 2 days through the page, run it, see the "Resumes" note, stop it.

## Outcome

Shipped: the Wait block takes an amount and a unit (Seconds, Minutes, Hours, Days, Weeks), Exactly or Between, up to 1 year per block (`MAX_WAIT_BLOCK_SECONDS`; `toSeconds`, `amount`/`minAmount`/`maxAmount`/`unit` in the contract). The engine converts to seconds and still saves one `waitUntil`; Stop now lifts the hold at once (`advanceRun`), retention keeps the items of a run that is still `RUNNING`, a data migration renames the old `seconds` keys of saved graphs and runs, and the run view's Note column says "Resumes 8 Nov, 14:30" for a held step.

Deviations: minutes were added to the list the owner named (so there is no gap between 59 seconds and 1 hour); the amount stepper allows up to 3,600 in any unit and the year cap is checked on top, so 60 weeks is a graph error rather than a blocked key press; switching the unit keeps the number, so a Between left at its default 20 to 60 shows the year error after switching to weeks until it is lowered.

Follow-ups: the Retry pause stays 0 to 3,600 seconds; a waiting workflow keeps its single live run, so a schedule or Run now answers "A run of this workflow is still going" until it ends (the schedule job skips it quietly). Not run: the page in a browser behind sign-in; a real multi-day wait (tested by dating `waitUntil` and items back, and by Stop).
