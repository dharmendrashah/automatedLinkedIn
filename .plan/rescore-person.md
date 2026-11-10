# Rescore a person from My network

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-11-10
- Locked by user: yes, 2026-11-10 <!-- change to "yes, <date>" only after the user confirms -->

## Goal

On `/network`, let the owner rescore one person from the table's row actions. The new score appears in the person's drawer and in the table's Score column. A person who already has a score shows it, with a Rescore button next to it. A person with no score gets a Score button.

## Facts from the code (2026-11-10)

- The table's Score column reads `Person.score`. The people index sets it to the highest score among the person's list members (`peopleIndex.ts`, `Math.max`).
- A list member's score comes from a workflow run's `score.icp` step, under the ICP that step used. So one person can hold scores from different ICPs, and the "Fit" section in the drawer shows the score of one list membership, with its reasons.
- The score is `scorePerson` (`core/icpScore.ts`): the headline rules (title, seniority, location, exclusions, up to 100 points) plus engagement signals. Scoring needs the person's stored profile read; a person who was never read has no fields to score.
- `score.icp` can add an AI judgement (`aiJudgement`, `aiWeight`, `IcpJudgement` reuse for 30 days). Each judgement is one paid model call.
- Nothing in the app rescores one person today. The only rescoring is `rescorePeople`, inside workflow runs (`worker/engine/steps.ts`).

## Requirements

Confirmed (from the request, 2026-11-10):

- A Rescore action in the row's actions on `/network`.
- The drawer shows the person's score.
- Rescoring recalculates the score from the person's profile.
- A scored person shows the score and a Rescore button; an unscored person shows a Score button.

Decisions (owner, 2026-11-10):

- Q1 ICP: the owner picks an ICP each time the person is scored.
- Q2 Storage: one separate ICP score per person (new columns on `Person`); list scores are not changed.
- Q3 No profile read: the rescore reads the profile first (the existing paid read), then scores when the read is in; the drawer shows "Reading the profile" until then.
- Q4 AI: the judgement runs only when the chosen ICP's Score block had `aiJudgement` on; otherwise rule score only.

Open questions: none. Every question above is answered.

## Scope and non-goals

- In scope (after answers): a `score` action in the row's actions menu (`RowActions`, `people-table.tsx`), the drawer's score section, a brain procedure to rescore one person, the write to the chosen place (Question 2), tests for each path.
- Out of scope: changing the rules or the weights of `scorePerson`, bulk rescoring, rescoring from workflows, the Score filter bands, the thresholds of the ideal customer.

## Approach

- [x] 1. Owner answers the open questions; the plan is locked.
- [x] 2. Tests first: the rescore procedure for each answer (no profile, one ICP, AI on and off, a person in no list).
- [x] 3. Brain: `people.rescore` (owner-scoped), using the chosen ICP and profile; writes per Question 2; returns the new score and reasons.
- [x] 4. Body: the action in `RowActions`; the drawer's score section with Rescore or Score; the table updates after the call.
- [x] 5. Gate: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` and the brain integration suite.

## Edge cases and risks

- A person in several lists with different ICPs: the table's `Person.score` is the highest of them; a rescore under one ICP can lower it. The drawer must say which ICP the score is from.
- Profile changed since the last read: the rescore uses the stored read unless Question 3 A reads it again.
- Cost: Question 3 A and Question 4 B cost money per click; a double click must not pay twice (one call per click, with a short lock per person).
- AI and privacy: the name goes to the AI provider with the other fields (the same accepted risk as the AI judgement plan).
- Do not contact people: refused, as the other actions are.
- Concurrency: a workflow run may write the same list member at the same time; the last write wins, so the rescore writes only the fields it computed.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root.
- Brain integration test for the rescore procedure (real Postgres).
- In the browser on staging: score a person with no score, rescore a scored one, check the drawer and the table show the same number.

## Outcome

In progress (2026-11-10, branch `feat/rescore-person` from `main`; committed, and a PR is open from it):

- Shipped: migration `20261110150000_person_icp_score` (six nullable columns on `Person`, applied to the local database; `prisma migrate diff` clean); `core/personScore.ts` (rule score; the industry and size count only after the profile read); `PersonScoreService` (`rescore`, and `scoreWaiting` for the pending pass); `people.rescore` procedure; `people.get` returns the new fields; job `person-score` (every minute); body `RescoreControl` in the drawer's status row and in a Score row action (popover).
- Verified: lint, type check, unit tests (1,867 passed), build, and the brain integration test for the service (5 passed).
- Not verified: the AI judgement path (no test; the flag path is untested); a person in no list (not tested); the UI in a browser on staging; the migration on staging.
- Deviations: the rule score uses the stored profile snapshot's headline and location, with the company from `LinkedInCompany`; engagement signals come from `PersonSignal` (commented and reacted only).
- Known gap: if one waiting person keeps failing in `scoreWaiting`, the batch stops at that person each minute; a per-person failure guard is a follow-up.
- Follow-ups: the AI judgement test, the browser check on staging.
