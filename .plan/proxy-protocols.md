# Proxy protocols: only HTTPS and SOCKS5

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-13
- Locked by user: yes, 2026-10-13 ("it should only give https and socks5 proxy option")

## Goal

The proxy form offers only `https://` and `socks5://`, and the API refuses the other two, because a proxy that cannot carry HTTPS cannot work for LinkedIn or the detection pages.

## Requirements

Confirmed:

- Add and edit proxy offer only HTTPS and SOCKS5 (new proxies default to HTTPS).
- `proxyServer.create` and `proxyServer.update` accept only those two.

Open questions (must be empty before locking):

- None. Decided: no HTTPS check in the proxy test (the user chose to accept it); existing HTTP and SOCKS4 proxies keep working and stay in the database.

## Scope and non-goals

- In scope: the body form options and default, the edit form for a stored HTTP or SOCKS4 proxy, the create and update input validation, tests.
- Out of scope: removing the enum values (would be a destructive migration), migrating stored proxies, a CONNECT check in the proxy test.

## Approach

- [x] Brain: restrict the `protocol` input of create and update (test first).
- [x] Body: `protocols.ts` with the offered list and the options for a stored value (test first); use it in the fields, default `HTTPS` in the add dialog.
- [x] Edit dialog sends `protocol` only when it changed, so a stored HTTP or SOCKS4 proxy can still be edited.
- [x] Lint, type check, unit tests, build; MEMORY.md.

## Edge cases and risks

- A stored HTTP or SOCKS4 proxy: the edit form shows its current protocol marked "no longer offered" and sends no protocol unless the owner picks another one; nothing breaks for it.
- A plain `http://` proxy that tunnels HTTPS (the most common kind of "HTTPS-capable" proxy) can no longer be added; the owner has to use `https://` (a TLS proxy) or `socks5://`.
- An old client sending HTTP or SOCKS4 gets a validation error.
- No migration, rollback is reverting the commit.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.

## Outcome

Shipped: `proxyServer.create` and `update` accept only HTTPS and SOCKS5 (tests for both, and for refusing HTTP and SOCKS4); the proxy form lists `https://` and `socks5://` (`protocols.ts`, with a unit test), new proxies default to HTTPS, and a stored HTTP or SOCKS4 proxy shows its protocol as "no longer offered" and keeps it unless another one is picked. Lint, type check, unit tests (body 141, brain 504, spider 414, contracts 79) and build pass. Not verified in a browser. Follow-up if wanted: a CONNECT check in the proxy test.
