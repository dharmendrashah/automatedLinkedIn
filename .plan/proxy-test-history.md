# Proxy test history

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-12
- Locked by user: yes, 2026-10-12

## Goal

Keep a record of every proxy test, with exactly what was sent and what came back, and show it in a shadcn drawer, so
the owner can see why a proxy is slow, wrong or failing without guessing.

## Requirements

Confirmed by the request: for each test save the request (headers and body), the response (headers and body) and the
latency, and show them in a shadcn drawer.

Settled by the existing design (not asked):

- A "test" is every run of the proxy test: Add a proxy, Edit, and Test now. Nothing else creates one.
- History is per proxy, newest first, opened from the proxy's row menu ("Test history") in a right-hand shadcn
  `Drawer`: a list of tests (time, status, latency), and the selected test's Request and Response in tabs.
- Failed tests are saved too (the useful ones): a refused connection or a timeout has a request and an error, no
  response; an HTTP 403 from ipinfo.io has a response with its body.
- The request is a `GET` with no body, so its body is shown as empty. The response body is the JSON from ipinfo.io.
- Latency per test is the elapsed time of the attempt (for a timeout, about 10 seconds). The table's Latency column
  stays "last successful test only".
- Secrets: the `Authorization` request header holds the ipinfo token and is saved masked (`Bearer ***`), never in full.
  The proxy's own username and password are not part of this request (they are in the proxy connection), so they are
  never saved or shown.
- A response from a proxy that re-signs or alters traffic is untrusted content. It is shown as plain text only,
  never as HTML, and each body is cut at 64 KB (flagged as truncated).
- Deleting a proxy deletes its history (cascade).
- Existing past tests are not recorded; history starts from this change.

## Open questions

None. Confirmed by the user on 2026-10-12: keep the last **7 days** only (instead of the recommended latest 50 per
proxy). Consequences: every save deletes tests older than 7 days (all proxies, one indexed delete, no scheduled job),
and reads only return tests from the last 7 days, so a proxy that is never tested again shows nothing old even before
its rows are removed. There is no count cap: someone pressing Test now many times in a week keeps all of them, each
up to the 64 KB body cap.

## Scope and non-goals

- In scope: `ProxyTest` model (additive migration), `IpInfoService` returning the full exchange (also on failure),
  `ProxyServerService` saving it and trimming, two read procedures (`proxyServer.history`, `proxyServer.historyEntry`),
  the drawer and row action, tests, `MEMORY.md`.
- Out of scope: exporting or searching history; charts or averages; recording tests that are not proxy tests
  (account validation); showing the proxy credentials; backfilling.

## Approach

- [ ] Prisma `ProxyTest`: `id`, `proxyServerId` (cascade), `testedAt`, `status` (the `ProxyServerStatus` it ended
      in), `statusMessage`, `latencyMs`, `requestMethod`, `requestUrl`, `requestHeaders` (Json), `requestBody`
      (text, nullable), `responseStatus` (nullable), `responseHeaders` (Json, nullable), `responseBody` (text,
      nullable), `responseTruncated`, `error` (nullable). Indexes `(proxyServerId, testedAt)` and `(testedAt)`.
- [ ] Test first: `IpInfoService` result and `IpInfoError` carry the exchange: request (headers with the token masked,
      empty body), response (status, headers, body) when one arrived, elapsed time; a non-200 keeps its response.
- [ ] Test first: `ProxyServerService` saves one `ProxyTest` per create, update and test, including unreachable and
      non-200 results, deletes tests older than 7 days on every save, lists only the last 7 days, and never stores
      the token or the proxy credentials.
- [ ] Test first: `history` and `historyEntry` only return tests of the caller's own proxies (NOT_FOUND otherwise).
- [ ] Drawer in `apps/body` (`Drawer`, `Tabs`, plain `pre` for bodies); row action "Test history"; a pure helper to
      format headers and pretty-print a JSON body, with a test.
- [ ] `db:generate`, apply the migration to both local databases, `MEMORY.md`, mark done.

## Edge cases and risks

- A saved response body can be large or hostile (a proxy can answer anything). Cut at 64 KB, rendered as text only.
- A test is saved after the proxy row exists; on Add the proxy is created first and the test is attached to it. If
  saving the test fails, the proxy result must still be returned (log and continue), as with validation requests.
- Two tests at the same time on one proxy: both are saved, the 7-day delete is idempotent, harmless.
- `Authorization` masking must also cover a lower-case `authorization` key and any future token header; mask by
  header name, not by value.
- Storage: unbounded by count within 7 days, bounded per row by the 64 KB cap; a normal ipinfo.io answer is well
  under 1 KB.
- Rollback: drop the table and remove the procedures; the proxy list is unaffected.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Press Test now on a proxy, open Test history: the test appears with its request, response and latency, and the
  Authorization header shows `Bearer ***`.

## Outcome

Shipped as planned, with 7-day retention as the user chose. `IpInfoService` now records the exchange (request line,
headers with `authorization` as `Bearer ***` and cookies masked by header name, empty body; response status, headers
and body cut at 64 KB with a flag; elapsed time) and attaches it to a failure too (`IpInfoError.exchange`), so a 403 keeps
its body and a refused connection keeps its request. `ProxyServerService` saves one `ProxyTest` row per create, edit
and Test now, deletes everything older than 7 days on every save, and never lets a failed save fail the test.
`proxyServer.history` (summaries, last 7 days) and `proxyServer.historyEntry` (one test in full) are owner-scoped
and answer NOT_FOUND otherwise. `/proxies` has a Test history row action that opens a right-hand shadcn `Drawer`: a
list of tests (time, status, HTTP status, latency) and Request / Response tabs, all as plain text.

Deviations: `historyEntry` returns the headers typed as plain string maps because Prisma's recursive `Json` type made
the API output too deep for the web app's `tsc` (TS2589); `IpInfoError` assigns `exchange` in its constructor because
the web app compiles brain's source with `erasableSyntaxOnly`. The body formatting helpers and their tests were
written together, not red first.

Verified: lint, ts:check, unit tests (brain 298, spider 269, body 56, contracts 49), build; the table exists in the dev
database; the dev brain is healthy. Not verified: the drawer in a browser (it needs a signed-in session) and a real
proxy's recorded exchange; the owner presses Test now and opens Test history.

Follow-ups: no count cap within the 7 days; a proxy that is never tested again keeps invisible old rows until the next
save anywhere deletes them.
