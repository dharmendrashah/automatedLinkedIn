# Invite run state-machine fixes (option B)

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-11
- Locked by user: yes, 2026-11-11

## Goal

Make the invite run's outcomes match what happened on LinkedIn. Three places can leave an invite in a state that is wrong: a throw after a press can leave the invite queued for a retry, a command that was delivered again marks profiles unsure that were never touched, and a withdrawal that gives up is recorded under a success state name. Fixing them keeps a retry from pressing Connect twice and keeps the Sent list honest.

## Requirements

Confirmed:

- Option B from the state-machine review: fix the problems in place, with tests, and do not add a new explicit state machine yet.
- A press that may have landed is never reported as not sent (`NOT_SENT`), so brain does not requeue it.
- Repository rules: TDD, `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` green, conventional commit with the Co-authored-by trailer, MEMORY.md updated, no push without the user's OK.

Decisions (locked by the user, 2026-11-11):

- Q1 withdraw give-up: **B**. After 3 failed tries the row goes back to `SENT` with the reason "Withdraw failed after 3 tries; the invite may still be pending on LinkedIn." No migration.
- Q2 repeated command: **A**. Keep all rows unsure when the command is repeated.
- Q3 unsure before press: **yes**. Mark the Connect and Withdraw-confirm presses `UNSURE` before pressing; a throw after the press point ends as `UNKNOWN`, never a retry.

Questions as asked (answered above):

1. Withdraw give-up (`withdrawChange` default branch, `apps/brain/src/database/inviteRules.ts` line ~319). Today after 3 tries the row becomes `WITHDRAWN` with "could not be withdrawn; check the Sent list". Which should it become?
   - A. Keep `WITHDRAWN`, reword the reason only. No migration. Still a success-named state.
   - B. Go back to `SENT` with the reason "Withdraw failed after 3 tries; the invite may still be pending on LinkedIn." No migration, the row counts toward limits as it should, and the state matches LinkedIn. Recommended.
   - C. New `LinkedInInviteState` value `WITHDRAW_FAILED` (additive migration, UI label in `apps/body/src/components/jobs/describe.ts` or the invite view). Clearest in the UI, most work.
2. Repeated command (`settleRepeated`, `run.ts` ~line 636). Today every invite and withdrawal is flipped to `UNSURE`, including ones this delivery never reached (`NOT_SENT` left by the queue, or `NO_CONNECT` and `NOT_AVAILABLE` seen before the repeat).
   - A. Keep the current rule: all unsure. Safe, but a harmless `NO_CONNECT` row becomes `UNKNOWN` for a person to check. Recommended for now, since the page check (`ALREADY_PENDING` / `ALREADY_CONNECTED`) guards a later retry from a second press.
   - B. Only flip items this delivery could have pressed (the ones it reached `mayPress` for). Less noise, but a narrower rule to reason about.
3. Mark the Connect control unsure before the first press (the conservative choice). Today `sent[index]` becomes `UNSURE` only after `pressConnect` returns true. A throw in `pressConnect` or in `openMenu` after `mayPress` leaves `NOT_SENT`. The plan marks it `UNSURE` before the press and sets `NOT_SENT` back when `pressConnect` returns false without a press. Confirm this is acceptable: a throw while only opening the More menu will end as `UNKNOWN` even though nothing was pressed.

## Scope and non-goals

- In scope:
  - `apps/spider/src/tasks/linkedinInvite/run.ts`: mark the Connect press and the Withdraw confirm press `UNSURE` before they are pressed; fix the `SignedOut` / `Restricted` outcome after `repeated` so the outcome matches the settled items; reword or change the withdraw give-up per question 1; apply question 2.
  - `apps/spider/src/tasks/linkedinInvite/run.unit.test.ts`: tests for each change.
  - `apps/brain/src/database/inviteRules.ts` and `inviteRules.unit.test.ts`: the withdraw give-up transition (question 1).
  - `apps/brain/prisma/schema.prisma` plus a migration, and the UI label, only if question 1 picks C.
  - `MEMORY.md` changelog, and the plan's Outcome.
- Out of scope:
  - A new explicit state machine or a state table (option A).
  - The `NO_NOTE` sentinel leaking into the `DialogEnd` type (note only; the type stays as it is unless the change is trivial).
  - The one-invite-per-run change (separate plan, not started).
  - The staging 999 cause.
  - The uncommitted change to `.github/copilot-instructions.md` already in the working tree (not ours; not staged).

## Approach

- [x] Write failing unit tests first in `run.unit.test.ts`: (a) a throw after the Connect press leaves the item `UNSURE` and the run `UNKNOWN` (done); (b) a repeated delivery with a `SignedOut` error (not covered by a harness test, see Outcome); (c) the withdraw confirm press throwing marks the withdrawal `UNSURE` (done).
- [x] In `sendOne`, set `sent[index]` to `UNSURE` before the first `pressConnect`, and back to `NOT_SENT` only on the path that returns without a press (question 3).
- [x] In `withdrawOne`, set `withdrawn[index]` to `UNSURE` before the confirm press, not after it.
- [x] In the main `catch`, decide the outcome after `settleRepeated`, so `SignedOut` / `Restricted` after a repeat matches the items (`result` settles first, the verdict is passed in).
- [x] Apply question 2 in `settleRepeated`: no code change (rule A, all rows stay UNSURE); no new test added for it.
- [x] Apply question 1 in `inviteRules.ts`: give-up goes to `SENT` with the new reason; the give-up assertion in `inviteRules.unit.test.ts` is replaced.
- [x] Run `pnpm lint:fix`, then `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- [x] Update `MEMORY.md`, set this plan to `done`, fill in the Outcome, commit (conventional, with the Co-authored-by trailer), and ask before any push.

## Edge cases and risks

- A throw during `openMenu` after `mayPress` (question 3). Conservative: `UNKNOWN`, which needs a person to check. Acceptable, but it can flag profiles that were never pressed.
- A throw from `hands.clickNth` after the browser has already clicked (`pressAt` in `apps/spider/src/scraping/camoufoxDriver.ts` line ~590: `moveTo`, then `mouse.click`). Confirmed to be possible; the fix treats it as possibly pressed.
- A repeated command (`markAttempt` returns false) presses nothing, so every profile it reached must not be retried as if it were fresh. The page check (`ALREADY_PENDING`, `ALREADY_CONNECTED`) guards a retry from a second press.
- `result()` runs `settleRepeated` only when `repeated`. The `SignedOut` / `Restricted` branches compute `isUnsure()` before settling, so the outcome can disagree with the items. Fix by settling first.
- Brain `sendChange` / `withdrawChange` are exhaustive switches. Changing the withdraw give-up to `SENT` (B) or a new state (C) must keep `store` (`linkedInInvite.service.ts` ~line 870) guarded by its `from` states (`WITHDRAWING`, `WITHDRAW_QUEUED`); a row that goes back to `SENT` must not be counted as withdrawn.
- Existing rows: a row already `WITHDRAWN` with the old reason is not rewritten. No data migration needed for A or B. For C, the migration is additive only (`ALTER TYPE ... ADD VALUE`), and no reset.
- Docker and CI: no change to images or workflows. Spider and brain both build from the monorepo as before.
- Rollback: each change is a small revert in `run.ts`, `inviteRules.ts`, and the tests. C needs the enum value left in place when rolling back (Postgres cannot drop enum values easily).

## Verification

- Failing tests first, then passing: `pnpm test:unit:run` from the repo root, which covers `run.unit.test.ts` and `inviteRules.unit.test.ts`.
- Definition of done from the repo root: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Staging check (after the user's OK, not part of the commit): one invite run on a test account to confirm the outcome shape in `invites.json` (`contract: 2`) is unchanged.

## Outcome

Shipped:
- Spider `run.ts`: an invite is UNSURE before the Connect press, and a withdrawal is UNSURE before its confirm press. A throw after either press no longer ends as NOT_SENT or NOT_CLICKED, so the run ends UNKNOWN.
- Spider `run.ts`: `result()` settles repeated items first, then takes the SignedOut or Restricted verdict, so the verdict matches the items.
- Brain `inviteRules.ts`: a withdrawal that gives up after 3 tries goes back to `SENT` with the reason "Withdraw failed after 3 tries; the invite may still be pending on LinkedIn.", not `WITHDRAWN`. No schema change, no migration.
- Tests: two new harness tests in `run.unit.test.ts` (they fail on the old `run.ts`, pass on the new one); a changed give-up assertion in `inviteRules.unit.test.ts`.

Deviations and gaps:
- Q2 (repeat rule A) is no code change. No new test was added for it.
- The SignedOut-after-repeat ordering fix is by inspection only. The harness cannot reach that path, because a repeated command stops the run before a sign-in check.
- Q3 tradeoff: a throw from `openMenu` (after `mayPress`) also ends UNSURE, even though nothing was pressed.
- Not run on staging. The staging check of one invite run on a test account (confirming `invites.json` `contract: 2`) needs the owner's OK.

Follow-ups: the one-invite-per-run change is not planned yet.
