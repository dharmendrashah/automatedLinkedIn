# Proxy server manager

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-12
- Locked by user: yes, 2026-10-12

## Goal

Let a non-technical owner attach one or more proxy servers to each LinkedIn account, so every automated
session for that account (validation today, scraping once brain calls spider's API) always goes through a
working, correctly-located proxy instead of the server's own network — the thing that actually keeps accounts
from being flagged, regardless of where the automation infrastructure happens to run.

## Requirements

Confirmed (from the request, plus the user's answers):

- A LinkedIn account can have many proxies attached (not a 1:1 limit).
- Each proxy belongs to exactly one LinkedIn account; never shared across accounts (reusing one proxy IP for
  two accounts is itself a correlation risk).
- Having several proxies per account means automatic failover: brain always picks the best `ACTIVE` proxy for
  that account (most recently verified first); it does not require the owner to pick one by hand.
- Each proxy supports `http://`, `https://`, `socks4://`, `socks5://`.
- Country/location is looked up through ipinfo.io, routed through the proxy itself (so the result reflects the
  proxy's exit address, not brain's). The user has a paid ipinfo.io token, using the **Lite** API
  (`https://api.ipinfo.io/lite/<ip>`, `Authorization: Bearer <token>`) — confirmed by example output: it returns
  `ip`, `asn`, `as_name`, `as_domain`, `country_code`, `country`, `continent_code`, `continent`. **It does not
  include the `privacy` (VPN/proxy/hosting) field** — that is only on ipinfo's Core/Plus tiers. So
  residential-vs-datacenter cannot be verified automatically; "prefer residential with a sticky session" stays
  advisory text in the UI, not an enforced check. The token is read from an env var (`IPINFO_TOKEN`), never
  hardcoded or logged.
- Country match target: **consistency across that account's own proxies**, not a separately-set target country.
  The first proxy added to an account sets the account's expected country implicitly; later proxies for the
  same account are flagged (`GEO_MISMATCH`, not blocked) if ipinfo's `country_code` differs.
- A proxy is tested before it is saved (brain reaches ipinfo.io's Lite endpoint through the candidate proxy); the
  result sets its status, shown the same way account status is shown today (`PENDING` / working / broken, with
  a short reason).
- An owner can re-test a proxy manually at any time; whatever the result is, it updates the stored status.
- Proxy username/password are encrypted with the existing `CryptoService`/`LINKEDIN_CRED_ENC_KEY` mechanism, not
  a separate key.
- UI: a dedicated `/proxies` page with its own sidebar entry — a table of all of the owner's proxies (every
  account's, not scoped to one), row actions (edit, test, remove), and an "Add a proxy" button at the top that
  includes a LinkedIn-account picker (since a proxy must belong to exactly one account).
- Must work for a non-technical person: plain language, a working/not-working signal that does not require
  reading logs, and the system (not the owner) actually enforces "proxy only, never a direct connection" the
  same way spider already refuses to fall back to a direct connection when a given proxy fails
  (`camoufoxDriver.ts`).

Open questions: none.

## Security note

The ipinfo.io token pasted into chat as an example should be treated as compromised once a conversation history
exists anywhere outside your own control — rotate it on ipinfo's dashboard before relying on it in a real
environment, and put the new value only in `secrets.env` (git-ignored) and the deploy secret, never in code or
in a plan file. This plan does not repeat the token value anywhere.


## Scope and non-goals

- In scope: Prisma model, brain service + tRPC resolver (CRUD + test), the proxy test itself (brain reaches
  ipinfo.io's Lite endpoint through the candidate proxy directly, no browser needed), wiring the account's
  selected proxy into `ValidateAccountCommand` (new field, `packages/contracts`) so account validation already
  uses it, the `apps/body` `/proxies` page and sidebar entry, `MEMORY.md`/this plan.
- Out of scope (follow-up, separate plan): brain calling spider's scrape API at all (not built yet, so there is
  nothing to wire a scrape-time proxy into beyond the schema already supporting it); a real browser (Camoufox)
  proxy test, only brain's own direct-to-ipinfo test; residential-vs-datacenter detection (ipinfo Lite does not
  expose it); automatic proxy rotation mid-task; billing/usage limits per proxy provider; buying or
  provisioning proxies (the owner pastes in details from whatever provider they already use).

## Approach

- [x] `apps/brain/prisma/schema.prisma`: `ProxyServer` model — `id`, `linkedInAccountId` (FK, cascade delete),
      `protocol` (enum `HTTP | HTTPS | SOCKS4 | SOCKS5`), `host`, `port`, `username`/`password` sealed the same
      way as `LinkedInAccount.secret` (one AES-256-GCM bundle), `status` (enum, mirrors `LinkedInAccountStatus`:
      `PENDING | ACTIVE | GEO_MISMATCH | UNREACHABLE | DISABLED`), `statusMessage`, `lastTestedAt`,
      `detectedCountryCode`, `detectedCountry`, `detectedIp`, `isPrimary` (bool, app-enforced at most one per
      account), `createdAt`/`updatedAt`. Additive migration.
- [x] `packages/contracts`: a shared `proxySchema` (protocol/host/port/username/password/bypass), replacing the
      proxy shape duplicated today in `apps/spider/src/types/schema.ts`; add an optional `proxy` field to
      `validateAccountCommandSchema`.
- [x] `apps/brain/src/env/env.ts`: `IPINFO_TOKEN` (required in production, a throwaway `devDefault` for local).
- [x] `apps/brain/src/core`: a small ipinfo.io Lite client that issues one request through a given proxy.
      Deviation: `undici`'s `ProxyAgent` only covers HTTP(S); used the `proxy-agent` package instead (maps
      `http(s)://`/`socks4://`/`socks5://` to the right `http.Agent`, works with Node's native `http`/`https`),
      one dependency instead of two. Hard 10s timeout so a dead proxy cannot hang a save.
- [x] `apps/brain/src/database`: `ProxyServerService` (static class, matching `LinkedInAccountService`'s shape) —
      create (tests before insert; if this is the account's first proxy, its detected country becomes the
      account's expected country; otherwise compare and set `GEO_MISMATCH` on mismatch), update, remove, list
      (all of the owner's proxies, across accounts, for the `/proxies` table), `test(id)` for the manual re-test
      button, and "pick the best proxy for this account" used when publishing a validation command.
- [x] `apps/brain/src/trpc/api/resolvers/proxyServer`: CRUD + `test` mutation, ownership-checked the same way
      `linkedInAccount` is. Deviation: extracted the shared `ownerProcedure` middleware out of
      `linkedInAccount.ts` into `trpc/trpc.ts` so both resolvers use the same one instead of duplicating it,
      now that there are two consumers. `list` returns every proxy the owner has, joined with its LinkedIn
      account's email for display.
- [x] `apps/brain` validation flow: `LinkedInAccountValidationService.request` resolves the account's selected
      proxy and includes it on the published `ValidateAccountCommand`. Deviation (edge case closed): if no
      proxy is healthy, `request` now logs and returns `false` without publishing anything, same as a missing
      account — it does not silently validate without a proxy.
- [x] `apps/spider`: consume the new optional `proxy` field in `ValidateAccountCommand` in
      `processValidation.ts` (already drives `CamoufoxDriver.open` the same way scrape tasks do).
- [x] `apps/body`: new `/proxies` route + sidebar entry. Table (protocol, host\:port, linked account, status
      badge, detected country, last tested, actions: test/edit/remove). "Add a proxy" dialog: LinkedIn-account
      picker, protocol dropdown, host, port, username, password, with help text recommending residential +
      sticky-session proxies. Deviation: a parallel `ProxyStatusBadge` component (own status map), not a shared
      generic one with the account status badge — same visual pattern, kept separate since the two status sets
      differ and the component is small.
- [x] `MEMORY.md`, mark this plan `done`.

## Edge cases and risks

- Empty/invalid input: host/port validation, a proxy URL that embeds credentials pasted into the host field by
  mistake (common non-technical mistake) — detect and either parse it out or reject with a plain-language error.
- A test that hangs (dead proxy, slow DNS) must time out and fail cleanly, not block the request or the event
  loop; same for the manual re-test button (disable it while in flight).
- Concurrency: two simultaneous "Test" clicks on the same proxy, or a manual test racing the automatic
  pre-save test — the last write wins on `status`/`lastTestedAt`, acceptable since this is a point-in-time check.
- `isPrimary` with more than one candidate: app-level invariant (setting one clears the others for that
  account), not a DB constraint, since Postgres partial unique indexes complicate the migration for a small gain.
- Country consistency has no meaning for an account's first proxy (nothing to compare against yet) — it always
  passes and sets the baseline; removing every proxy and adding a new one re-baselines from that new one, which
  is the intended behaviour, not a bug.
- Secrets: proxy password must never appear in logs, error messages, or the test result's status message
  (mirrors `camoufoxDriver.ts`'s existing rule for the browser-session proxy). `reveal`-style endpoint only if
  the owner explicitly asks for one (match `linkedInAccount.reveal`'s existing precedent).
- Existing data: no proxies exist today, so the migration only adds the table; no backfill.
- Dev vs production: ipinfo.io calls need network egress from brain, already true for RabbitMQ/Postgres: no new
  Docker/CI concern beyond a possible new env var (`IPINFO_TOKEN`) and a new dependency for SOCKS test support.
- If every proxy for an account is unhealthy, publishing a validation command should fail the same way a
  missing account does today (log and return `false`), not silently publish without a proxy.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root.
- Unit tests for `ProxyServerService` (create tests before insert, status transitions, primary selection,
  ownership checks) and the resolver, co-located per the repo's test convention.
- A real-network test (not CI) against one real proxy, read ipinfo.io through it, confirm the detected country.

## Outcome

Shipped as planned, with the deviations noted inline in Approach above (a different ipinfo client dependency,
`ownerProcedure` extracted to be shared, a stricter no-proxy guard in `request`, and a separate status badge
component). `IPINFO_TOKEN` is brain-only; no change needed in `apps/spider` or `apps/body` env.

Verified: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` all pass across the whole repo
(brain 243 unit tests, spider 266, contracts 49, body builds). Not verified: a real proxy against the real
ipinfo.io Lite API (only a local mock HTTP forward-proxy was exercised in tests); the first real proxy added
by the owner is the actual end-to-end proof.

Follow-ups: brain calling spider's scrape API at all is still a separate, not-yet-planned change — once it
exists, it should reuse `ProxyServerService.pickForAccount` the same way validation does. The edit dialog's
username/password fields are "blank keeps the stored value" only; there is no UI affordance to explicitly
clear a saved proxy credential short of removing and re-adding the proxy (the backend supports it via `null`,
the resolver passes it through, only the dialog does not expose it) — add one if that turns out to matter.
