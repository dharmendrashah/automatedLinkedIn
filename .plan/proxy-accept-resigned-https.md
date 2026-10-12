# Accept the certificate of proxies that re-sign HTTPS

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-12
- Locked by user: yes, 2026-10-12

## Goal

Some proxies (for example `52.140.40.92:80`) intercept HTTPS and answer with their own certificate, here issued by a
private CA that has expired. Today the proxy test refuses them and the browser would refuse them too. The owner has
decided that is acceptable ("we only care about getting the content"). Make proxies that re-sign HTTPS work, in the
proxy test and in the LinkedIn browser.

## Requirements

Confirmed by the user (2026-10-12):

- A proxy that replaces the certificate of secure websites is acceptable.
- Applies to **every proxy**, not a per-proxy setting (the user chose this over the recommended opt-in).
- No real-browser verification run (the user declined it).

Consequences that follow, and are part of the scope:

1. `IpInfoService` accepts any certificate when it goes through a proxy.
2. `CamoufoxDriver` creates the browser context with `ignoreHTTPSErrors: true` whenever a proxy is used (never for a
   direct connection, which is not allowed for LinkedIn anyway).
3. The certificate-specific error message is no longer needed and is removed with the check.
4. The proxy form tells the owner in plain words that a proxy can read what passes through it.

## Open questions

None.

## Scope and non-goals

- In scope: `IpInfoService`, `describeConnectionError`, `CamoufoxDriver`, the proxy dialog's help text, tests,
  `MEMORY.md`.
- Out of scope: any column, migration or contract change (nothing is stored per proxy); trusting a specific CA
  (installing the proxy's CA instead of ignoring errors is the safer alternative and a possible follow-up); a global
  on/off switch.

## Approach

- [ ] Test first: `IpInfoService` calls `https.get` with `rejectUnauthorized: false`.
- [ ] Remove `describeConnectionError` and its tests; an error is reported with its original reason again.
- [ ] `CamoufoxDriver.open`: `browser.newContext({ ignoreHTTPSErrors: true })` when a proxy is given, no option
      otherwise. Cover it with a unit test that fakes `camoufox`.
- [ ] Proxy dialog help text. `MEMORY.md`, mark this plan done.

## Edge cases and risks

- **Security.** Without certificate checks, a proxy that re-signs HTTPS can read and change everything that passes
  through it: the LinkedIn password, the two-step code and session cookies. The only signal that would reveal a
  tampering proxy is gone, and so is protection from anyone on the path between brain and the proxy. This is the
  owner's informed choice, made twice in this conversation. It is also why the proxy is the owner's responsibility:
  use only proxies they trust.
- The ipinfo token is sent through the proxy, so the proxy operator can read it. It is a free Lite token; rotate it
  if a proxy is ever not trusted.
- Camoufox's `geoip: true` looks up the proxy's address through the proxy too. If that fails on the certificate the
  browser will not start. **Not verified** (the user declined the real-browser run); the symptom would be the
  `The browser could not start through the proxy` task error, and the fix is to drop `geoip` for that case.
- Rollback: restore the certificate check (`rejectUnauthorized` default, no `ignoreHTTPSErrors`).

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- The owner presses Test now on the existing proxy; it should become `ACTIVE` with a detected country.

## Outcome

Shipped as planned. `IpInfoService` sends `rejectUnauthorized: false` (so the proxy test no longer fails on a
re-signed or expired certificate), `CamoufoxDriver.open` creates the context with `ignoreHTTPSErrors: true` whenever
a proxy is used, the certificate-specific error wording from the previous fix was removed, and the proxy form warns
that an account's traffic, including its password, passes through the proxy and that its certificate is not checked.
Nothing is stored per proxy: no column, migration or contract change.

Verified: lint, ts:check, unit tests (brain 269, spider 269, body 37, contracts 49), build. New `camoufoxDriver`
unit test fakes `camoufox`; the ipinfo test checks the options `https.get` receives. Not verified, by the owner's
choice: a real Camoufox run through the proxy, and the proxy test against the real proxy (the owner presses Test now).

Follow-ups: the safer alternative is to trust the proxy's CA instead of ignoring every certificate error; if
Camoufox's `geoip: true` fails on the proxy's certificate the symptom is the task error `The browser could not start
through the proxy`.
