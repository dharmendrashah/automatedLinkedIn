# Invites: a run stopped by LinkedIn must not use up the tries of invites it never opened, and must not leave a wrong sentence on them

- Status: locked <!-- draft | locked | in progress | done -->
- Created: 2026-11-15
- Locked by user: yes, 2026-11-15 (the owner asked to handle the case of the run of session 53496711 that landed on an invite already pending and was blocked; the fix below is what that run showed)

## Goal

Session `53496711` (dharmendrashaheagle+linkedin@gmail.com, 2026-11-15 15:39 UTC) was asked for four people. The first, Manthan Patel, had an invite already pending (sent by hand from this account); the task found the Pending link and answered `ALREADY_PENDING`, and brain recorded it as `SENT` ("An invite was already waiting on LinkedIn") with the person `PENDING`. That case works. The second profile answered HTTP 999 and the run ended `BLOCKED`. Reading what brain did with the other three exposed two faults:

1. They were put back in the queue with the sentence "LinkedIn did not show whether it was sent. It is not sent again." That sentence is the stamp for an unsure send (`UNKNOWN`) that is applied first when a run ends; `sendChange('NOT_SENT')` re-queues but never clears it, so the owner reads that an invite is never sent again while it is still queued.
2. Each of them got a try counted (`tries + 1`) although the run never opened their profile. After three such runs an invite becomes `FAILED` ("It could not be sent in 3 tries"). On staging Divya Napa is already at 2. A LinkedIn block or limit would therefore end invites that never had a turn.

A good result: an invite that never had its turn in a run LinkedIn stopped goes back in the queue with no try used and no sentence; an invite that was opened and did not work still counts a try.

## Requirements

Confirmed (request): handle the case of a run that lands on an already pending invite and is blocked.

Open questions: none.

## Scope and non-goals

- In scope: `sendChange` (clear the stale sentence on a re-queue; no try for an invite that did not have its turn in a stopped run), `LinkedInInviteService.store` (reads the run's verdict), tests, `MEMORY.md`.
- Out of scope: the spider and the contract (no new outcome: an old brain would reject it during a deploy; the rule is read from the run's verdict instead), the 999 itself (spacing is in PR #226), the already-pending path (works).

## Approach

- [x] Tests first: `sendChange('NOT_SENT', ...)` clears `reason`; with the run stopped it keeps `tries` and clears `reason`; a stopped run does not change the other outcomes; `NOT_SENT` still ends at 3 tries in a normal run.
- [x] `inviteRules.ts`: `STOPPED_RUNS` (BLOCKED, LIMIT_REACHED, RESTRICTED, SIGNED_OUT) and a `stopped` argument of `sendChange`.
- [x] `linkedInInvite.service.ts` `store`: read the session's verdict once and pass `stopped` for the file's invites.
- [x] Integration test: a `BLOCKED` run's file with `ALREADY_PENDING` and `NOT_SENT`: the first is `SENT`, the others are `QUEUED` with the same `tries` and no `reason`; a normal run's `NOT_SENT` still adds a try.
- [x] `MEMORY.md`, root gate (`pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, then `pnpm test:integration:run`).

## Edge cases and risks

- An invite opened and not sent (a step did not show) in a run that was later blocked also gets no try: one extra retry at most, harmless.
- A run without a verdict (null) counts as a normal run.
- Rows already stored with the stale sentence on staging stay until their next run changes them; no data migration.
- Idempotency: `store` only touches rows still `SENDING` or `UNKNOWN` of that session, as before.
- Rollback: revert the commit; no schema change.

## Verification

- Unit and integration tests above; root gate. Not run here: anything on live LinkedIn.

## Outcome

Built and committed in PR #226 (same branch as the invite spacing). Gate green: lint, ts:check, unit, build, integration. The already-pending case needed no change; on staging the invite to Manthan Patel is `SENT` and the person `PENDING`. The three invites left queued by session `53496711` still carry the old sentence until their next run.
