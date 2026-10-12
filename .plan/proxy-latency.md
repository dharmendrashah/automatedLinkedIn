# Show proxy latency

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-12
- Locked by user: yes, 2026-10-12 ("also show the latency as well")

## Goal

Show how fast each proxy is, next to its status, so the owner can tell a usable proxy from a slow one.

## Requirements

Confirmed by the request:

- Show the latency of each proxy in the `/proxies` table.

Settled by the existing design (nothing left to ask): latency is measured by the proxy test that already runs on
create, edit and "Test now" (one request to ipinfo.io through the proxy), so it is as fresh as the status and costs
no extra request.

- Definition: milliseconds from sending the request until the full response has arrived, through the proxy. It
  includes the proxy connection, the secure handshake and the ipinfo.io answer, which is what a browser session also
  pays. It is a single sample, not an average.
- A proxy that cannot be reached has no latency (stored as empty, shown as a dash).

## Scope and non-goals

- In scope: `ProxyServer.latencyMs` (nullable, additive migration), `IpInfoService` result, `ProxyServerService`,
  the proxies table column, tests, `MEMORY.md`.
- Out of scope: history or averages of latency; automatic periodic re-testing; ranking proxies by latency when
  choosing one for an account (`pickForAccount` stays primary then most recently tested).

## Approach

- [ ] Test first: the lookup result carries `latencyMs` (a whole number, 0 or more).
- [ ] Test first: create and update store the latency of a good test and clear it when the proxy is unreachable.
- [ ] Prisma column and migration; `IpInfoService`; `ProxyServerService` (outcome, create, update, select).
- [ ] Table column "Latency" with a plain label: under 500 ms "fast", under 1500 ms "ok", otherwise "slow", shown as
      `123 ms`.
- [ ] Apply the migration to the local databases the dev server uses; `MEMORY.md`; mark done.

## Edge cases and risks

- A slow ipinfo.io answer is counted as proxy latency. It is the same path a browser takes, but treat the number as
  indicative.
- The first request through a proxy includes its connection set-up, so a re-test right after can be lower.
- Existing proxies have no latency until they are tested again; the table shows a dash.
- Timeout (10 s) already ends the lookup as unreachable, so latency never exceeds it.
- Rollback: drop the column; nothing else depends on it.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Press Test now on a proxy; the table shows a latency next to its status.

## Outcome

Shipped as planned. `IpInfoService` measures the lookup with `performance.now()` and returns `latencyMs` (whole
milliseconds); `ProxyServerService` stores it on create and on every re-test and clears it (null) when the proxy is
unreachable; migration `add_proxy_latency` adds a nullable `latencyMs` column (applied to the `automatedlinkedin` and
`postgres` dev databases). `/proxies` has a Latency column showing `342 ms`, coloured and titled fast (under 500 ms),
ok (under 1500 ms) or slow, with a dash when there is none. The label logic is `describeLatency` with its own test.

Verified: lint, ts:check, unit tests (brain 274, spider 269, body 45, contracts 49), build, the column exists in the
dev database and the dev brain is healthy. Not verified: a real proxy's number in the browser (the owner presses
Test now).

Follow-up: none needed. A latency history or average and ranking proxies by latency stay out of scope.
