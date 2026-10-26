# Start anyway, with a check, when an account may not browse now

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-26
- Locked by user: yes, 2026-10-26 (the answers below)

## Goal

The "Run again" window on a session refused with "This account is resting between two sessions. It can start again at 13:17." and offered only Cancel. The owner may start it anyway, after ticking a box that says they understand it can put the account at risk.

## Requirements

Answered by the owner on 2026-10-26:

1. **Which refusals:** any browsing-time refusal (the rest between two sessions, spread through the day, outside working hours, the day's minutes full).
2. **Where:** everywhere the owner starts a task by hand. Scheduled and automatic starts never skip the check.
3. **The check:** a tick box, "I understand this can put the account at risk". The start button stays off until it is ticked.

## Scope and non-goals

- In scope: brain (`TaskService.request` option `startAnyway`, honoured for a manual request only; `BrowseBudgetService.reserve` option `override`; the tRPC inputs of `task.run`, `accountProfile.read` and the profile and company page views; an error shape that says `budgetRefusal` so the page needs no sentence matching) and body (the Run again window, the Accounts page, the profile Read button, the view page window).
- The time is still booked: an override changes only whether the start is refused, so the day's total stays true and the next refusal counts it.
- Out of scope, listed so they are not mistaken for done: replies from the Unibox, the messages refresh, posts (a queued post waits and shows why; it has its own queue), workflow runs (they wait by design), sign-in checks (never refused). The spider side and the 10 minute "ran a moment ago" confirmation are unchanged.

## Approach

- [x] 1. Tests first: the service passes `override` only for a manual request; `reserve` books and does not refuse on an override and still refuses an automatic one (integration); the resolvers pass the flag on; the error shape.
- [x] 2. Brain: option, override, inputs, error shape (`asTrpcError` keeps the cause).
- [x] 3. Body: `StartAnywayDialog` and `isBudgetRefusal`; the Run again window shows the tick box under the refusal; Accounts, Account profile and the view page window open the dialog on a budget refusal.
- [x] 4. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; integration test of `reserve` where PostgreSQL is available.

## Edge cases and risks

- **This is an account-safety control.** The rest and the hours exist to keep accounts from looking automated. The override is the owner's explicit choice behind a tick box; it never applies to automatic starts, and the booked time makes the next start count it.
- **A second refusal after a confirmation:** the window sends `confirmed` and `startAnyway` together, so the "ran a moment ago" question is not asked again in a loop.
- **A forged flag:** the server honours `startAnyway` only for `trigger: manual`, and every procedure is already scoped to the owner.
- **Two sessions at once on one account:** the spider's account lease still holds one at a time; the second waits and is retried.
- **Rollback:** remove the option and the dialog; refusals behave as before.

## Verification

- Unit tests above; `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Not seen in a browser: the dialogs need a refused account to appear.

## Outcome

Built as planned: brain `startAnyway` (manual requests only) to `reserve({ override })`, `budgetRefusal` in the tRPC error data, and `StartAnywayDialog` (tick box) on the Run again window, Accounts, Account profile Read and the profile and company view windows. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` pass and the budget integration test passes on local PostgreSQL (10 of 10). Not seen in a browser. Not covered: Unibox replies, the messages refresh, posts and workflow runs (listed under scope).
