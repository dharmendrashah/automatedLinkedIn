# Plan 003: Refuse non-public proxy addresses before brain connects through a proxy

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 298446d..HEAD -- apps/brain/src/database/proxyServer.service.ts apps/brain/src/core apps/brain/src/trpc/api/resolvers/proxyServer`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW to MED (an owner who deliberately runs a proxy on a private network would be refused; see STOP conditions)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `298446d`, 2026-11-16

## Why this matters

A signed-in owner can add a proxy with any `host` and `port`. Brain then opens a connection to that host from its own pod (to test the proxy through ipinfo.io), repeats the test daily, and stores the failure sentence it got back, which is returned to the owner. That makes brain a port and address scanner for anything its pod can reach (cluster services, the metadata address, localhost), with the reason of each refusal visible. The `/cdn` route already refuses non-public addresses; the proxy path does not. After this plan a non-public host is refused before any connection, with a fixed sentence.

## Current state

- `apps/brain/src/trpc/api/resolvers/proxyServer/proxyServer.ts:~15-35` — inputs: `host = z.string().min(1).max(255)`, `port = z.number().int().min(1).max(65535)`; no address check.
- `apps/brain/src/database/proxyServer.service.ts`:
  - `toConnectionUrl` (line ~107) builds `scheme://[user:pass@]host:port`.
  - `test` (line 199) is the ONE place brain connects through a proxy; `create`, `update`, `retest` and the manual "Test now" all go through it:

```ts
// Tests a candidate proxy by routing one request through it to ipinfo.io. ...
const test = async (input: ProxyServerInput, otherCountryCodes: string[]): Promise<TestOutcome> => {
   try {
      const result = await IpInfoService.lookupThroughProxy(toConnectionUrl(input))
      ...
   } catch (error) {
      return {
         status: 'UNREACHABLE',
         statusMessage: reasonFor(error, input.protocol),
         exchange: (error instanceof IpInfoError && error.exchange) || NOT_RECORDED,
      }
   }
}
```

  - `TestOutcome` (line 124) already has the `{ status: 'UNREACHABLE'; statusMessage: string; exchange: ProxyExchange }` shape; `NOT_RECORDED` (line 137) is the empty exchange for failures without a recording.
- `apps/brain/src/core/cdnFetch.ts` (lines 25-86): `export const isPublicAddress = (address: string) => ...` (a `BlockList` of private, loopback, link-local, unique-local, multicast, documentation and NAT64 ranges; IPv4-mapped IPv6 is checked by the IPv4 rules) and `publicLookup`. `apps/brain/src/worker/engine/sendApi.ts:44` has a second, near-identical copy of `isPublicAddress` (do not merge it here).
- `apps/brain/src/core/index.ts` is the barrel other code imports `IpInfoService` from (`import { IpInfoService } from 'core'`); it does not export `isPublicAddress`.
- Existing unit test: `apps/brain/src/database/proxyServer.service.unit.test.ts` mocks the whole `core` module (`vi.mock('core', () => ({ AbuseIpDbService, CryptoService, IpInfoError, IpInfoService }))`), so any new export used from `'core'` MUST be added to that mock.
- The decided exception for this area: `rejectUnauthorized: false` on the ipinfo request and the proxy operator being able to read the ipinfo token are accepted in `.plan/proxy-accept-resigned-https.md`. Do not change them.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Brain unit tests | `pnpm --filter @automatedLinkedIn/brain exec vitest run --dir src src/core src/database/proxyServer` | all pass |
| Brain integration (needs Postgres: `docker compose up -d postgres`) | `pnpm --filter @automatedLinkedIn/brain exec vitest run --config vitest.integration.config.mts --dir src src/database/proxyServer` | all pass |
| Gate | `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` | exit 0 |

Run from the repo root (login shell if `pnpm` is missing). Prettier first, then `eslint --fix` (their `object-curly-newline` rules conflict).

## Scope

**In scope**:
- `apps/brain/src/core/publicHost.ts` (create) and `publicHost.unit.test.ts` (create)
- `apps/brain/src/core/index.ts` (one export line)
- `apps/brain/src/database/proxyServer.service.ts` (the top of `test`)
- `apps/brain/src/database/proxyServer.service.unit.test.ts` (mock + cases)
- an integration test: `apps/brain/src/database/proxyServer.service.integration.test.ts` (create if it does not exist; otherwise add a case)

**Out of scope**:
- `sendApi.ts` and `cdnFetch.ts` (no refactor of the duplicated `isPublicAddress`).
- The spider worker's own connection to the proxy (a separate network and a separate plan).
- Rate limits on `proxyServer.test`.
- Any UI change (the existing status sentence is shown as is).

## Git workflow

- Branch: `fix/proxy-public-host`. Conventional commit, e.g. `fix: refuse non-public proxy addresses before testing a proxy` plus the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- Do NOT push or open a PR unless the operator told you to.
- The repo asks for a plan file under `.plan/<name>.md` for behaviour changes; copy this plan's Why/Steps into it.

## Steps

### Step 1: Write the failing tests

`core/publicHost.unit.test.ts` for `isPublicHost(host, lookup?)` (an async function returning `boolean`; `lookup` is injectable like `publicLookup(lookup)` in `cdnFetch.ts`):
- literal public IPv4 (`93.184.216.34`) → `true`; literal `127.0.0.1`, `10.0.0.5`, `192.168.1.1`, `169.254.169.254`, `::1`, `fd00::1`, `::ffff:10.0.0.5` → `false`.
- a hostname whose injected lookup returns only public addresses → `true`; returns any private address among several → `false`.
- a hostname whose lookup fails (DNS error) → `true` (the proxy test itself will report it as unreachable; the guard only refuses what it can prove is non-public).

In `proxyServer.service.unit.test.ts` add `isPublicHost: mocks.isPublicHost` to the `core` mock (defaulting to resolving `true` in `beforeEach`) and a case: with `isPublicHost` resolving `false`, `create('u1', input)` saves a proxy whose status is `UNREACHABLE` with the fixed sentence, and `lookupThroughProxy` was NOT called.

Integration case (real Postgres, real `IpInfoService` NOT called): creating a proxy for an owned account with host `127.0.0.1` stores a row with status `UNREACHABLE` and the fixed sentence, and no outbound connection is made (assert by spying `IpInfoService.lookupThroughProxy` or by the absence of a recorded exchange body).

**Verify**: the unit command above → the new cases FAIL (module and behaviour missing).

### Step 2: Implement `isPublicHost`

Create `core/publicHost.ts`:

```ts
import { lookup as dnsLookup } from 'node:dns'
import { isIP } from 'node:net'

import { isPublicAddress } from './cdnFetch'

// True unless the host is, or resolves to, an address that is not on the public internet. A name that does not resolve
// passes: connecting to it fails by itself, and the caller reports that.
export const isPublicHost = async (host: string, lookup: typeof dnsLookup = dnsLookup): Promise<boolean> => {
   const bare = host.replace(/^\[|\]$/g, '')

   if (isIP(bare) !== 0) {
      return isPublicAddress(bare)
   }

   return new Promise(resolve => {
      lookup(bare, { all: true }, (error, addresses) => {
         resolve(error ? true : addresses.every(({ address }) => isPublicAddress(address)))
      })
   })
}
```

Export it from `core/index.ts` next to the other `core` exports.

**Verify**: `pnpm --filter @automatedLinkedIn/brain exec vitest run --dir src src/core/publicHost` → all pass.

### Step 3: Use it in `test`

At the top of `test` in `proxyServer.service.ts` (before the `try`), add:

```ts
if (!(await isPublicHost(input.host))) {
   return { status: 'UNREACHABLE', statusMessage: PRIVATE_HOST, exchange: NOT_RECORDED }
}
```

with `const PRIVATE_HOST = 'This address is not on the public internet, so it cannot be used as a proxy.'` next to the other constants, and import `isPublicHost` from `'core'`.

**Verify**: the unit and integration commands → all pass, including the new cases.

### Step 4: Gate

**Verify**: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` → exit 0.

## Test plan

- Unit: `publicHost.unit.test.ts` (8 cases above); `proxyServer.service.unit.test.ts` (1 case; update the `core` mock).
- Integration: 1 case with a real database (private host saved as `UNREACHABLE`, no connection attempted).
- Pattern: `apps/brain/src/core/cdnFetch.unit.test.ts` for address cases; `proxyServer.service.unit.test.ts` for the service.

## Done criteria

- [ ] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` exits 0
- [ ] The new unit and integration cases exist and pass
- [ ] `grep -n "isPublicHost" apps/brain/src/database/proxyServer.service.ts` shows the guard at the top of `test`
- [ ] `git status` shows only in-scope files
- [ ] `.plan/README.md` status row updated

## STOP conditions

- `.plan/proxy-server-manager.md` or `MEMORY.md` records that owners run proxies on private networks on purpose (grep `private`, `localhost`, `10.`, `VPN`): stop and report; the guard would need an operator allowlist instead.
- A staging or production proxy already stored uses a private host (query the `ProxyServer` table read-only first): stop and report the count; do not disable it silently.
- The `core` mock in other tests also needs the new export (a test fails with "isPublicHost is not a function"): add it to that mock only, and report which files.

## Maintenance notes

- DNS can change between the check and the connection (rebinding). The window is small and only matters for an owner attacking their own account's test; a connect-time lookup guard (as `publicLookup` in `cdnFetch.ts`) would close it but needs `proxy-agent` to accept a custom lookup. Deferred.
- The worker's own use of the proxy (spider) is not covered here.
- Reviewer: confirm the fixed sentence is the only text returned for a refused host (no resolved address in it).
