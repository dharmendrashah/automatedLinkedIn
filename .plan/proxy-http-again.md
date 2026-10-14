# Allow plain HTTP proxies again

- Status: done
- Created: 2026-10-14
- Locked by user: yes, 2026-10-14 ("enable http proxy this does not support https proxy")

## Goal

A proxy whose provider gives an `http://` address (an HTTP proxy that tunnels secure sites) can be added and works. This reverses part of `.plan/proxy-protocols.md` (only HTTPS and SOCKS5), which turned out wrong for the most common kind of proxy.

## Requirements

Confirmed:

- Add and edit offer `http://`, `https://` and `socks5://`. `http://` is the default for a new proxy.
- The proxy that raised this (a plain HTTP proxy, saved as `https://`) failed with a TLS error because the app tried to open a secure connection to the proxy itself. Checked with the stored login: as `http://` it works (detected in the US, 1.2 s), as `https://` it fails with `EPROTO ... packet length too long`.

Proposed (small, in the same change): when a proxy saved as `https://` fails with that kind of TLS error, the saved message says to try `http://`, instead of only the raw OpenSSL text.

Open questions: none.

## Scope and non-goals

- In scope: brain accepts `HTTP`; the form lists it and defaults to it; wording in the add dialog; the hint on that TLS failure; tests.
- Out of scope: SOCKS4 (still not offered, still kept if already stored), changing the proxy saved as `https://` by hand (the owner edits it to `http://` in Edit details and presses Test again), a CONNECT check in the proxy test, any spider change (the contract and the browser already accept `http://`).

## Approach

- [x] Brain resolver: protocol enum `HTTP`, `HTTPS`, `SOCKS5`; tests (accept the three, still refuse SOCKS4, on create and on update).
- [x] Brain service: TLS hint in the failed test message, only for `HTTPS`; test first.
- [x] Body: `protocols.ts` lists the three, labels in the select, `http://` default in the add dialog, help text; update the unit test.
- [x] Verify: lint, type check, unit tests, build for the whole monorepo; then the real path with the existing proxy (see below).

## Edge cases and risks

- A stored `HTTP` proxy (from before the earlier restriction) was already working in the database and in the spider; nothing to migrate.
- A genuine TLS proxy still works as `https://`; only its failure message gets longer when it is not one.
- The hint must not echo anything secret: it is fixed text added to the existing message, which already carries no credentials.
- Spider: Playwright and Camoufox take `http://host:port` as the proxy server; credentials stay separate fields (`toProxyConfig`).

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the root, clean.
- Real path: a throwaway script runs the saved proxy through `IpInfoService` as `http` and as `https` (done before the change: http works, https fails); after the change the real tRPC route is called without a token (401) and the proxy is re-tested after switching it to `http://` in Edit details, which needs the signed-in page, so that last step is the owner's.

## Outcome

Shipped as planned: brain accepts `HTTP`, `HTTPS` and `SOCKS5` (SOCKS4 still refused, tests on create and update); the form lists the three with plain labels (`protocolLabel`) and defaults new proxies to `http://`; the add dialog says to choose http:// when the provider's example starts with it; a failed test of an `https://` proxy with a TLS-handshake error (`EPROTO`, `wrong version number`, `packet length too long`) now ends with a hint to choose http://, only for `HTTPS` (tests for both, and for no hint on other failures or protocols).

Verified: `pnpm lint`, `pnpm ts:check`, `pnpm test:unit:run` and `pnpm build` for the whole monorepo, all clean. A throwaway script added the owner's proxy through the real router on a temporary user: as `http://` it is `ACTIVE` (detected in the United States), as `https://` it is `UNREACHABLE` with the OpenSSL error; the hint on the second is covered by the unit test (my printout cut the message before it). The temporary user was deleted. Not run: the signed-in page; the owner still has to open the existing proxy, choose `http://` in Edit details and press Test again (the saved row is left as the owner entered it).

Follow-up if wanted: the spider's browser check with an `http://` proxy that cannot tunnel (CONNECT) is unchanged, see the note in `MEMORY.md`.

Follow-up fix (same day): the protocol select showed a long label ("https:// (secure connection to the proxy, rare)") that overlapped the Port field next to it. The select now shows only the address start (`http://`, `https://`, `socks5://`), the explanation moved to a line under the row (`protocolHint`), and both columns got `min-w-0` so a long value can never push the layout. `DEFAULT_PROTOCOL` is now one constant the default-values object and the tests both read, instead of a literal `'HTTP'` in two places.
