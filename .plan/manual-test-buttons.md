# Manual test buttons on /proxies and /accounts

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-13
- Locked by user: yes, 2026-10-13 (the request names both buttons and the proxy rule; "most reliable" is defined below)

## Goal

Let the owner start the spider worker by hand: a visible "Browser test" button on every proxy, and a visible "Test login" button on every LinkedIn account that signs in through the account's most reliable proxy.

## Requirements

Confirmed:

- `/proxies`: a button on each row (not hidden in the menu) that runs the `browser-detection` task through that proxy.
- `/accounts`: a button on each row that runs the `linkedin-login` task for that account (a manual check).
- The account check goes through the account's most reliable proxy. "Most reliable" is: ACTIVE before GEO_MISMATCH, then the primary proxy, then the lowest latency of the last test, then the most recently tested. This rule is the one `pickForAccount` uses for every task.
- Both start a spider session, so the result shows in Sessions; the page says so with a link.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: `ProxyServerService.pickForAccount` ordering; body buttons, states and messages on both pages; tests; MEMORY.md.
- Out of scope: a proxy test history based success rate, choosing the proxy by hand for the account test (the session Retry dialog already does), new tasks, scheduling.

## Approach

- [x] Brain: `pickForAccount` orders by status, primary, latency, last tested (test first).
- [x] Body: Proxies row shows a "Browser test" button, disabled with a reason when the proxy is not usable or the worker has not announced the task.
- [x] Body: Accounts row shows a "Test login" button that calls `task.run` with the account, disabled for a paused account or one with no working proxy; refusals (cooldown, no proxy) are shown; success links to Sessions.
- [x] Remove the now unused catalog filter `runnableOnProxy`.
- [x] Lint, type check, unit tests, build; update MEMORY.md.

## Edge cases and risks

- The catalog is empty until a worker has started and announced its tasks: the proxy button is disabled with "The spider worker has not announced this task yet", and the account button (which does not read the catalog) answers with the server's "This task is not available".
- A repeated click: the button is disabled while its request is in flight; the server's cooldown (5 minutes for a manual login check, 5 minutes per proxy for the browser test) answers the rest in plain words.
- No usable proxy: the account button is disabled with a reason; the server still refuses with the same sentence if the list is stale.
- Paused account: disabled, the server refuses too.
- Ordering change affects every task that picks a proxy (login, retries): only the choice among several usable proxies changes; accounts with one proxy behave as before. `status` sorts in the enum's declared order, ACTIVE before GEO_MISMATCH.
- A manual login check logs in to LinkedIn: it is the account owner's own action, rate limited by the existing cooldown.
- No migration, no contract change, rollback is reverting the commit.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Brain unit tests for the ordering; body unit tests for the button rules.
- Not verifiable here without a running worker and a real proxy: a real click through to a finished session.

## Outcome

Shipped: `pickForAccount` ordering (status, primary, latency, last tested) with a unit test; a shared `TestButton` with the reason tooltip; the "Browser test" button on proxy rows (`browser-test.ts`) and the "Test login" button on account rows (`login-test.ts`), with unit tests of the blocker rules; `runnableOnProxy` and the generic proxy menu entries removed. Lint, type check, unit tests (body 138, brain 498, spider 414, contracts 79) and build pass.

Not verified: a real click through a running worker and proxy; the pages in a browser. Both buttons need the spider worker running (the proxy button also waits for the catalog it announces, cached 5 minutes in the body).
