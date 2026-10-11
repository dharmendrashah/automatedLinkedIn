# Spider: drive Camoufox instead of Playwright's Chromium

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-12
- Locked by user: yes, 2026-10-12 (answers recorded under Requirements)

## Goal

Replace the headless Chromium that the spider worker launches with Camoufox (github.com/daijro/camoufox), an anti-detect
Firefox build. Authorization: the requester attests that LinkedIn authorized this repository, including fingerprint
spoofing and stealth browsers such as Camoufox (`.plan/linkedin-account-linking.md`, B1, authority verified by the
requester on 2026-10-12, no independent check).

## Facts checked (2026-10-12, from the Camoufox README)

- Camoufox is not a replacement for Playwright's API. It is a Firefox build that Playwright drives through Juggler.
  `playwright-core` stays a dependency; only `chromium.launch` goes away.
- Node package: `npm install camoufox playwright-core`, then `npx camoufox fetch` downloads the browser build.
  `await Camoufox({ headless: true })` returns a normal Playwright `Browser`. `NewContext()` gives one context its own
  identity. MIT licence for the package, MPL-2.0 for the browser.
- Latest browser release `v156.0.1-beta.36`. The README warns it "may not be suitable for stable production use" and
  that it can still be detected.
- It presents Firefox identities only. Options in the README: `proxy`, `geoip`, `humanize`, `headless: "virtual"`
  (Xvfb on Linux), `block_images`, `block_webrtc`.

## Verified from `typescript/README.md` (2026-10-12)

- `npm install camoufox playwright-core` then `npx camoufox fetch` is the supported install, confirmed by the requester
  too. Node 22.15 or newer (the repo uses 25).
- **Version conflict:** `playwright-core` is a peer dependency "below 1.63". The spider app uses `playwright ^1.64.0` and
  the worker image is `mcr.microsoft.com/playwright:v1.64.0-noble`. Spider must move to `playwright-core` 1.62.x (the
  version must match the browser protocol Camoufox ships), and the Playwright base image no longer applies.
- `Camoufox({ headless: true })` returns a Playwright `Browser`; `NewBrowser(firefox, opts)` takes your own
  `BrowserType`. `headless: true` is Firefox headless with the known tells patched; `"virtual"` needs Xvfb (Linux).
- Options are snake_case (`humanize`, `geoip`, `block_images`, `canvas_noise`, `virtual_display`), anything else goes to
  Playwright's `firefox.launch()`. `fetch` installs the build paired with the package version; each npm release
  pins one browser build, so pinning the npm version pins the browser. `camoufox` data dir is `~/.cache/camoufox`.
- On a host without a GPU (a container) it claims a drawn GPU; canvas noise turns on only for another OS or GPU and emits
  a `LeakWarning`. `uBlock Origin` is installed by default (`exclude_addons: ["UBO"]` drops it).
- npm registry check: `camoufox@0.5.8` is the `latest` tag (published 2026-10-06, provenance attested, MIT, Node >= 22.15),
  `0.5.9-beta.1` is the `next` tag. All `0.1.x` versions are an unrelated, deprecated unofficial port; never use them.
  `0.5.8` declares `peerDependencies: { "playwright-core": "<1.63" }`, its own dev pin is `1.62.0`, and it is
  `"type": "module"` with `main: dist/index.js` and no CommonJS `exports` entry.
- Still to check while coding: whether `require('camoufox')` from the CommonJS spider build works on Node 25 (`require(esm)`)
  or needs a dynamic `import()` that TypeScript does not rewrite to `require`.

## Requirements

Confirmed by the requester (2026-10-12):

- R1 Replace Chromium with Camoufox (one driver, no env switch).
- R2 Pin `camoufox` to exactly `0.5.8`. Its peer `playwright-core` is pinned exactly to `1.62.0` (the version the
  package is tested with; the peer range is `<1.63`).
- R3 Use `humanize: true`. Headless stays `true` unless the image work shows a need for `"virtual"`.
- R4 Allow LinkedIn: `linkedin.com` (which includes `www.linkedin.com` and other subdomains) is added to the allowlist
  for local runs (`apps/spider/.env.example` and the compose `spider` services). Production still has no default and an
  operator must list it on purpose.
- R5 Optional proxy per task, with credentials inline in the RabbitMQ message (accepted by the requester). If present the
  worker uses it with `geoip: true` (timezone, locale, geolocation and WebRTC IP follow the proxy's exit IP); if absent
  the browser connects directly. A bad proxy fails the task, never falls back to a direct connection.
- R6 Session per account, through the object store. A task names its LinkedIn account (`account_id`). When the task
  starts, the worker loads that account's previous session and continues with it. When the task succeeds, the worker
  saves the refreshed session and returns only its storage key.
- R7 Authorization is the attested LinkedIn permission (`.plan/linkedin-account-linking.md`, B1). The Chromium-unmodified
  rule in `playwrightDriver.ts` and the "no fingerprint or user-agent spoofing" decision in `spider-scraper-app.md` are
  superseded for this change.
- R8 `SPIDER_ROBOTS_EXEMPT_HOSTS` (default empty, `linkedin.com` locally): robots.txt is not checked for those hosts. The
  allowlist, the rate limit and every other control stay. Every exempt host must also be in the allowlist.
- R9 One task per account at a time, across workers: a task takes a per-account lease before it starts and releases it
  when it ends; a second task for the same account waits and is retried later.

## Design

**Command (API and worker, `apps/spider/src/types`).** Two new optional fields on `ScrapeRequest` and
`ScrapeTaskCommand`, validated by zod, `strictObject` as today:

- `account_id`: string, `^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$` (brain's LinkedIn account id; the first character rules out
  `.` and `..`). It names the session and lock objects, so it must be path safe.
- `proxy`: `{ server, username?, password?, bypass? }` where `server` is an `http://`, `https://` or `socks5://` URL
  (max 2048 chars), `username` and `password` max 256 chars each. Errors and logs never echo it.
- `auth_session_key` becomes optional. It only seeds the very first run of an account that has no stored session yet.
  A session is required for a task if any action sets `use_session_cookies`, and then either `account_id` or a safe
  `auth_session_key` must be present.

**Session in and out.** Cookies never travel through RabbitMQ. A session is the cookies of the allowed hosts (no local
storage: LinkedIn authenticates with cookies, and fewer secrets are kept).

- Key: `sessions/<account_id>/state.json`.
- In, at task start (before any action): if `account_id` is set, the worker loads that object; if it does not exist it
  falls back to `auth_session_key` when given; if neither exists the task starts without a session (an action that needs
  one fails with "The stored session was not found"). Only cookies for allowed hosts are applied.
- Out, after the last action succeeds: the worker reads the context's cookies, keeps those for allowed hosts, and, if at
  least one remains, writes them to `sessions/<account_id>/state.json`. `ScrapeTaskResult` gets an optional
  `session_storage_path` (that key, never the cookie values). Nothing is written when the task fails or when no allowed
  cookie remains, so a failure or checkpoint cannot overwrite a good session. The session is written before the result
  is published; a failed write is an infrastructure error and the broker retries.
- Brain-side work (publishing `account_id` and `proxy`, bucket access, reading the returned key, encrypting at rest) is a
  separate plan. This plan covers the spider side and the message contract.

**Per-account lease (R9).** The lock is an object in the same store: `locks/<account_id>.json` holding
`{ task_id, expires_at }`. `ObjectStore` gets three conditional operations (GCS maps them to generation preconditions):
`create` (only if absent, returns the version), `getVersioned`, and `delete` (only while the version is unchanged).
`AccountLock.acquire(accountId, taskId)` creates the object; if it already exists and is not expired it reports busy; if
it is expired (a crashed worker) it deletes that exact version and creates its own. `processTask` takes the lease before
the engine runs and releases it in a `finally`. When the account is busy `processTask` throws `AccountBusyError`; the
consumer waits `SPIDER_ACCOUNT_BUSY_DELAY_MS` (default 10 s), republishes the message with the same retry counter (a busy
account is not a failure) and acknowledges the original. The lease lasts `SPIDER_ACCOUNT_LOCK_TTL_MS` (default 30 min, no
heartbeat); a task that outlives it could be overlapped, so the TTL must exceed the longest task.

**Driver.** `CamoufoxDriver` replaces `PlaywrightDriver` (file `camoufoxDriver.ts`): `Camoufox({ headless: true,
humanize: true })`, plus `proxy` and `geoip: true` when a proxy is given, then `browser.newContext()` with the same
allowlist `route` block, timeouts and `close()` order. `BrowserSession` gains `cookies()`; `BrowserDriver.open()` takes
an optional `{ proxy }`. `SPIDER_CHROMIUM_NO_SANDBOX` is removed.

**Robots (R8).** LinkedIn's `robots.txt` (fetched 2026-10-12) ends with `User-agent: * / Disallow: /` and says automated
access without LinkedIn's express permission is prohibited. The attested permission does not mention robots.txt, so the
exemption is the operator's explicit decision (recorded here), limited to the listed hosts.

## Scope and non-goals

- In scope: the Camoufox driver, the dependency change, the worker image, `account_id`, `proxy`, `session_storage_path`,
  session load and write-back, the per-account lease, the LinkedIn local allowlist, `SPIDER_ROBOTS_EXEMPT_HOSTS`, tests,
  docs, `MEMORY.md`.
- Out of scope: any brain or body change (publishing the new fields, reading the session back, encryption at rest),
  LinkedIn password or TOTP login, messaging or connection-request actions, proxy rotation, staging deployment.
- Unchanged and still enforced: the host allowlist in the API, the engine and the browser, the per-host rate limit,
  the record cap, cookies only for allowed hosts, a 4xx or 5xx is a failure, no secrets in logs. A LinkedIn checkpoint
  or login wall must fail the task, never be solved or worked around.

## Approach

- [x] Dependencies: removed `playwright`; added exact `camoufox@0.5.8` and `playwright-core@1.62.0`. `require('camoufox')`
      works from the CommonJS build on Node 25, so no dynamic `import()` helper was needed.
- [x] Tests first (unit): schema (`account_id`, `proxy`, session rules), `AccountLock`, `GcsStore` conditional operations,
      `HostPolicy` robots exemption, `processTask` (lease, session write-back only on `SUCCESS`, no cookie values in the
      result), engine (proxy to the driver, session auto-load and seed, cookies handed back, robots exemption), consumer
      (busy account re-queued without a retry), API (proxy and account queued, password never echoed).
- [x] Tests (e2e, real Camoufox against a local site): extract, click-through, record cap, robots refusal, blocked redirect,
      404 as failure, stored cookie sent, account session continued and refreshed, robots exemption, proxy failure is a
      task failure, the browser is Camoufox.
- [x] Types and schema: `account_id`, `proxy`, `session_storage_path`, `auth_session_key` optional.
- [x] Driver: `CamoufoxDriver` (`humanize`, proxy plus `geoip` only when a proxy is given), `cookies()` on the session.
- [x] Worker and engine: proxy and account passed through, `AccountLock` and `SPIDER_ACCOUNT_*` settings wired,
      `SPIDER_CHROMIUM_NO_SANDBOX` removed.
- [x] Env: `SPIDER_ROBOTS_EXEMPT_HOSTS`; local `SPIDER_ALLOWED_HOSTS` includes `linkedin.com` (env defaults, `.env.example`,
      compose).
- [x] Dockerfile `worker` target: `node:25-bookworm-slim`, Firefox libraries, `camoufox fetch` as the `node` user.
- [x] No Playwright browser download step remained in docs or CI.
- [x] `MEMORY.md` and `.plan/spider-scraper-app.md` updated.
- [x] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, the e2e run, the RabbitMQ integration test.
- [x] Worker image build and start: the image builds and Camoufox launches in it as uid 1000 (see Outcome).

## Edge cases and risks

- Beta software: Camoufox may break between releases, and the browser is a downloaded binary. Pin exact versions and
  check the checksum or source if the fetch step offers it. Rollback is reverting the driver and Dockerfile commit.
- Image size and cold pulls grow (Camoufox binary on top of, or instead of, the Playwright image). The staging node
  already cannot fit Chromium (spider plan), and the worker stays local-only (Q6).
- The Playwright image version must still match `playwright-core` if the Playwright base image is kept. Because
  Camoufox needs `playwright-core` below 1.63, the current 1.64 image and `playwright ^1.64.0` dependency cannot stay.
  Prefer a plain Debian or Ubuntu base with Firefox's runtime libraries plus `camoufox fetch`, and a non-root user.
- Resource cleanup: the browser and context must close in a `finally` before ack, as today.
- CommonJS: if `camoufox` is ESM-only, the driver needs a dynamic `import()` or another approach. Verify first.
- Firefox differs from Chromium: `page.click` and `waitForLoadState` behave slightly differently, response status codes
  and the route-abort reason `blockedbyclient` may differ. The e2e tests catch this.
- Detection and bans: Camoufox can still be detected, and spoofing does not remove rate limits. Account restriction by
  LinkedIn remains a business risk even with the permission. Keep the rate limit and robots controls on.
- Authorization evidence: the attested email has no agreement number, conditions or term. Re-check scope and expiry
  before LinkedIn hosts are allowlisted (linking plan).
- Secrets: cookies and session keys are never logged. Identity or fingerprint values are not secrets but are not logged
  per task either.
- No data migration. Existing messages and stored results are unaffected. The new command and result fields are
  optional, so old messages still validate.
- Session write-back: a failed write after a successful scrape must not announce `SUCCESS` without the session. Treat a
  store failure as an infrastructure error (retry through the broker), as the result write is today. A crash between
  writing the session and publishing the result re-runs the task on redelivery and overwrites the same key, which is
  idempotent. Writing `state.json` replaces the previous session, so keep GCS object versioning on the bucket for
  rollback.
- Session contents are secrets: encrypted by the bucket at rest, never logged, never in an error message, only allowed
  cookie domains are written. Local storage is included in `storageState()`, so filter it to allowed origins too.
- Proxy: a bad or unreachable proxy fails the task with a clear error and must not fall back to a direct connection
  (that would reveal the host IP and defeat the point). Proxy credentials appear in the RabbitMQ message and in
  dead-letter copies; use `amqps` in production and keep the dead-letter TTL.
- Humanize slows every click and adds random movement; the per-action timeout (`SPIDER_ACTION_TIMEOUT_MS`) may need to
  be raised, and the e2e tests must not rely on timing.
- LinkedIn behaviour: login wall, `/checkpoint/`, CAPTCHA, 429 or 999 responses all end the task as `FAILED` (never
  retried by solving them), and a failed task never overwrites the stored session. Repeated failures for one account
  should pause that account (brain-side follow-up).
- Account ban risk: spoofing does not make automation safe for the account; keep conservative delays and limits and do
  not run several tasks for one account at once.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- E2E with a real Camoufox against the local test site: extract, click-through, record cap, robots refusal, blocked
  off-allowlist redirect, 404 as failure, stored cookie sent.
- Pipeline integration test on RabbitMQ is unchanged and must still pass.
- Unit tests prove: the result and logs never contain cookie or proxy values, the session is written only on `SUCCESS`,
  and an invalid `account_id` or `proxy` is a 400 that does not echo the input.
- A manual local run against a test page with a stored session shows the refreshed session at
  `sessions/<account_id>/state.json` and `session_storage_path` in the result. No manual run against live LinkedIn is
  part of this plan.
- `docker build --target worker -f apps/spider/Dockerfile .` and start the container as a non-root user.

## Outcome

Shipped on branch `feat/spider` (not committed). The spider worker now drives Camoufox (`camoufox@0.5.8`,
`playwright-core@1.62.0`, `humanize: true`) instead of Chromium. New command fields: `account_id`, `proxy` (credentials inline,
`geoip: true` with a proxy, a failing proxy fails the task, no direct fallback), `auth_session_key` now optional (seed only).
New result field: `session_storage_path`. With an `account_id` the engine loads `sessions/<account_id>/state.json` at
start (falling back to the seed key), and after a successful task `processTask` writes the refreshed cookies of allowed
hosts back to the same key and returns the key, never the cookie values. One task per account: `AccountLock` keeps a lease
object `locks/<account_id>.json` using GCS generation preconditions (`create`, `getVersioned`, `delete` added to
`ObjectStore`); a busy account throws `AccountBusyError` and the consumer re-queues the task after
`SPIDER_ACCOUNT_BUSY_DELAY_MS` without using a retry. `SPIDER_ROBOTS_EXEMPT_HOSTS` skips robots.txt for listed hosts (each must
be allowed). Local `SPIDER_ALLOWED_HOSTS` includes `linkedin.com`; compose and `.env.example` set the same.
`SPIDER_CHROMIUM_NO_SANDBOX` is gone. The worker image is `node:25-bookworm-slim` with Firefox libraries and
`camoufox fetch`, with its own `worker-build` stage.

Deviations and findings:
- Sessions are cookies only (no local storage), a deliberate narrowing of the first draft.
- The image's dependencies must be installed on glibc: the first build installed them on Alpine and the `impit` native
  binding was missing at run time. Fixed with the `worker-build` stage.
- `camoufox fetch` prints no progress without a TTY and the build is 1.29 GB; about 15 minutes locally, about 2 minutes in
  the image build (cached network).
- The e2e suite takes about 2.5 minutes because a real browser starts per test.
- GeoIP: the database is downloaded by Camoufox on first use, so the first proxied task needs outbound network. It is not
  baked into the image. Not exercised here (no real proxy was available).

Verification: `pnpm lint`, `pnpm ts:check`, `pnpm test:unit:run` (spider 199, brain 181, body 37) and `pnpm build` pass; 11
real-Camoufox e2e tests pass; 5 RabbitMQ integration tests pass (including the busy-account re-queue); the worker image
builds and launches Camoufox as uid 1000. NOT verified: a proxied task with real credentials, the lease against the real GCS
bucket (only the store calls are unit tested), and anything against live LinkedIn.

Follow-ups: brain publishes `account_id` and `proxy`, reads `session_storage_path` from the bucket and stores the session
encrypted (separate plan; needs bucket access); GCS object versioning on the spider bucket; a lease heartbeat if tasks can
run longer than 30 minutes; bake the GeoIP database into the image; staging deployment (bigger node).
