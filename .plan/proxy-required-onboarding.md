# Proxy-required onboarding (fix the chicken-and-egg)

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-12
- Locked by user: yes, 2026-10-12

## Goal

A new LinkedIn account always starts with no proxy, because a proxy can only be attached to an existing account.
`.plan/proxy-server-manager.md` made validation refuse to run without a healthy proxy, so a new account is stuck in
`PENDING` with no explanation and nothing re-queues it once a proxy is added. Make the flow work end to end without
ever opening LinkedIn from the server's own network.

## The problem, as observed

- `LinkedInAccountValidationService.request` logs "it has no working proxy" and returns `false`. The account stays
  `PENDING` with `statusMessage` null, so the owner sees nothing.
- Adding a proxy later does not trigger validation, so the account stays `PENDING` until the owner clicks `verify`.
- Nothing in the UI tells the owner a proxy is the next step.

## Requirements

Confirmed (from the original request): accounts must never be opened from the server's own network; a proxy is how
they get a safe location.

Proposed, needs confirmation (see Open questions):

1. No proxy means no validation, and no direct fallback. The account stays `PENDING` with a plain-language
   `statusMessage`: "Add a proxy to verify this account." (shown by the existing status badge tooltip).
2. When a proxy becomes healthy (created or edited or re-tested into `ACTIVE`), every `PENDING` account of that
   owner that is waiting on a proxy is validated automatically. A paused (`DISABLED`) account is never touched.
3. The Add account dialog tells the owner the next step: after saving, a notice with a link to `/proxies`.
4. The `/proxies` page's Add dialog works with an account that is still `PENDING`; nothing else changes there.

## Open questions

None. Confirmed by the user on 2026-10-12: hold (no direct fallback); validate automatically when the first proxy
turns healthy; no inline proxy in the Add account dialog, a next-step notice linking to `/proxies` instead.

## Scope and non-goals

- In scope: `LinkedInAccountValidationService.request` (set the status message when there is no proxy),
  `ProxyServerService` (trigger validation when a proxy becomes healthy), the Add account dialog notice, tests.
- Out of scope: inline proxy in the account dialog; scrape tasks (not wired yet); a new account status value
  (reuse `PENDING` plus `statusMessage`).

## Approach

- [ ] Test first: `request` with no proxy sets `statusMessage` on the account (still `PENDING`, nothing published).
- [ ] Test first: creating, updating or testing a proxy that ends `ACTIVE` or `GEO_MISMATCH` requests validation for
      its account only when that account is `PENDING`; an `UNREACHABLE` result or a `DISABLED` account does not.
- [ ] `request`: when `pickForAccount` is null, update `statusMessage` (and `statusUpdatedAt`) and return `false`.
      A later successful publish clears it (`applyResult` already resets `statusMessage` for `VALID`).
- [ ] `ProxyServerService`: after create/update, if the stored status is healthy and the account is `PENDING`, call
      `LinkedInAccountValidationService.request(accountId)` and swallow its errors the same way the resolver's
      `requestValidation` does (the proxy is already saved; a failed publish must not fail the request).
- [ ] Mind the import cycle: `linkedInAccountValidation.service` already imports `proxyServer.service`. Put the
      trigger in the `proxyServer` resolver (as `linkedInAccount` does with `requestValidation`) instead of the
      service, so the services do not import each other.
- [ ] `apps/body`: a short notice in the Add account dialog's success state, or on the accounts table row, linking to
      `/proxies`.
- [ ] `MEMORY.md`, mark this plan done.

## Edge cases and risks

- Several proxies turn healthy in a row: each would request a validation. The existing `validationId` /
  `validationRequestedAt` mechanism means only the newest answer applies, and the 5 minute cooldown applies to the
  owner's `verify`, not to `request`, so guard with "only when the account is `PENDING` and has no validation in
  flight" to avoid a burst of logins to LinkedIn.
- A proxy edit that keeps it healthy (for example a password change) must not re-validate an `ACTIVE` account; only
  `PENDING` accounts are triggered.
- An account whose only proxy goes `UNREACHABLE` after it was `ACTIVE` stays `ACTIVE` (last known good); the next
  validation will then refuse and set the message again. Out of scope to change here.
- Existing data: accounts created before this change have no `statusMessage`; they get one the next time `request`
  runs. No migration.
- Rollback: revert the resolver trigger and the message; behaviour returns to "silently stays PENDING".

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Manually: add an account (status `PENDING`, tooltip says to add a proxy), add a working proxy, the account moves to
  validating without clicking `verify`.

## Outcome

Shipped as planned. Deviations: the trigger is `LinkedInAccountValidationService.requestIfWaiting` (called from the
`proxyServer` resolver after create, update and test), not code inside `ProxyServerService`, to avoid a service
import cycle. "Waiting" means status `PENDING` and no `validationId`; a no-proxy `request` never sets a
`validationId`, so such an account qualifies. The UI notice lives on the `/accounts` page
(`NeedsProxyNotice`, computed from the proxy list) rather than inside the Add account dialog, so it also covers
accounts added earlier and disappears by itself once a healthy proxy exists. Proxy mutations now also refresh the
accounts list.

Verified: lint, ts:check, unit tests (brain 267, spider 266, body 37, contracts 49), build. The validation
integration test's consumer case fails only while a dev brain is running against the same RabbitMQ (it steals
`accounts.validated`); the file's header already says to run it with nothing else consuming.

Follow-up: an account whose only proxy goes `UNREACHABLE` after it was `ACTIVE` stays `ACTIVE` until it is validated
again (accepted, see Edge cases).
