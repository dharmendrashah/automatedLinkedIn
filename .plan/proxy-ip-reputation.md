# Daily proxy score (reputation and latency), best proxy wins

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-13
- Locked by user: yes, 2026-10-13 (answers to Q1 to Q4 below)

## Goal

Once a day, score every proxy from 0 to 100 (higher is better) from its IP reputation (AbuseIPDB) and its latency. A proxy scoring 90 or more is "good". When a LinkedIn account has several proxies, they are sorted by score and the highest one is used for its browser automation. Everything lives on the existing `/proxies` page; there is no new page.

## Background (AbuseIPDB docs, read 2026-10-13)

- `GET https://api.abuseipdb.com/api/v2/check?ipAddress=<ip>&maxAgeInDays=<1..365, default 30>` with headers `Key: <api key>` and `Accept: application/json`. IPv4 and IPv6, one IP per call, the IP URL-encoded. Without `verbose` the answer is light.
- Useful `data` fields: `abuseConfidenceScore` (0 to 100, the field the docs say to act on), `totalReports`, `numDistinctUsers`, `lastReportedAt`, `isPublic`, `isWhitelisted` (may be null; docs say not to act on it), `isTor`, `usageType`, `isp`, `countryCode`.
- `GET /blacklist` is a list download, not a per-IP lookup: free plan capped at 10,000 IPs and 5 calls a day, `confidenceMinimum` is a subscriber feature. It cannot prove an IP is clean, and `/check` already covers every listed IP, so it is not used.
- Daily limits (free): `check` 1,000, `blacklist` 5. Over the limit: HTTP 429 with `Retry-After`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. Errors are JSON `{ errors: [{ detail, status }] }`; 401/403 bad key, 402 plan limit, 422 bad parameter.
- The key goes in a header (query strings end up in logs) and stays server side; CORS is blocked on purpose.
- The existing proxy test (`ProxyServerService`'s `test`, through ipinfo.io) already returns the exit IP, country and latency through the proxy; the proxies list already shows latency.

## Requirements

Confirmed by the user (answers of 2026-10-13):

- C1 No separate page: an extension of the body `/proxies` route (columns, detail).
- C2 Every proxy is scored once a day by a scheduled job.
- C3 The score is 0 to 100, higher is better, built from the blacklist/reputation answer and the latency. 90 or more is "good" and is what browser automation for a LinkedIn account uses.
- C4 With many proxies on one account, all are scored, sorted by score descending, and the highest scored one is used.
- C5 AbuseIPDB `/check`, free plan (1,000 checks a day).
- C6 A proxy is also scored right after it is created, edited or tested.
- C7 The daily job re-runs the proxy test first (fresh exit IP and latency), then asks AbuseIPDB.
- C8 Keep a score history table for 30 days.

Proposed (to confirm, see Open questions):

- P1 Formula: `score = round(0.7 * reputation + 0.3 * speed)`.
  - `reputation = 100 - abuseConfidenceScore` (no reports: 100).
  - `speed = 100` at 500 ms or faster (the "fast" limit already on `/proxies`), falling in a straight line to `0` at 3000 ms or slower; a failed test has no score.
  - Effect: 90 or more needs an abuse score of about 14 or lower and a latency of roughly 1.5 s or less (for example abuse 0 and 1000 ms gives 94; abuse 10 and 500 ms gives 93; abuse 0 and 1500 ms gives 88, so not good).
  - Weights and limits are constants in one file, so tuning is a one-line change.
- P2 Choosing the proxy for a task (`pickForAccount`): only `ACTIVE`/`GEO_MISMATCH` proxies, then highest `score`, then the existing tie-breakers (primary, lower latency, latest tested). Proxies with no score yet sort after scored ones. Below 90: see Q1.
- P3 Scheduler: in-process in brain, wakes every hour, scores the proxies not scored since the start of today (UTC). A missed day (restart, or staging shut down by the smart-shutdown plan) is made up at the next wake-up. No Kubernetes CronJob: the job needs the database, the encryption key (proxy passwords) and the ipinfo token, which brain already has; a CronJob would need all of them copied, and Compose and minikube would need a different mechanism.
- P4 Scoring right after create/edit/test (C6) runs after the response is sent (fire and forget) so a save is not slowed by a second network call. An AbuseIPDB answer for the same IP checked in the last 24 hours is reused, so repeated "Test now" never burns the daily quota; only the daily job and a new IP call the API.
- P5 The daily job's re-test is the existing proxy test: it updates `status`, `latencyMs`, detected IP and country and saves a `ProxyTest` row, exactly like "Test now". A proxy that fails it becomes `UNREACHABLE` until the next test. To avoid one network blip dropping a good proxy, the job retries a failed test once, a minute later, before recording `UNREACHABLE`. `DISABLED` proxies are skipped.
- P6 The AbuseIPDB call goes straight from brain, never through the proxy. Only the exit IP is sent.
- P7 No key means the reputation half is off: the proxy is scored from latency alone and marked "reputation not checked", it is never called "good" on latency only (cap at 89), and boot is not blocked (a new required key would break staging at the next deploy).

Decided on 2026-10-13 (these replace the questions):

- Q1 No proxy of 90 or more: use the best scored usable proxy anyway and show a warning. An account is never stuck because every proxy scored 85; 90 only drives the "good" label and the warning.
- Q2 The formula in P1 is confirmed (70% reputation, 30% speed, 500 ms to 3000 ms scale).
- Q3 `isPrimary` wins while its score is within 5 points of the best usable proxy (stops the account switching IP every day); otherwise the highest score wins, then the existing tie-breakers.
- Q4 The daily re-test may set a proxy `UNREACHABLE` after one retry a minute later (P5).

Open questions: none.

## Scope and non-goals

- In scope: AbuseIPDB `/check` client; scoring function; daily scheduler; re-use of the proxy test; score columns and a 30-day score history; `pickForAccount` ordering by score; `/proxies` score column and score history in the existing test-history drawer; env, Compose and deploy examples; tests; `MEMORY.md`.
- Out of scope: `/report`, `/check-block`, `/reports`, `/blacklist`, other reputation providers, per-user keys, a status-page module for AbuseIPDB, a "Check now" button (C6 covers re-scoring on test), auto-replacing or deleting bad proxies.

## Approach

- [x] 1. Env: `ABUSEIPDB_API_KEY` (string, default `''` = off) in `apps/brain/src/env/env.ts` and `env/index.ts`; add to `apps/brain/.env.example`, `docker-compose.yml` (`${ABUSEIPDB_API_KEY:-}`) and `deploy/overlays/{local,staging}/secrets.example.env` (optional, so it is not needed before the merge).
- [x] 2. Migration `add_proxy_score` (additive). On `ProxyServer`: `score Int?`, `scoredAt DateTime?`, `abuseScore Int?`, `abuseReports Int?`, `abuseLastReportedAt DateTime?`, `abuseUsageType String?`, `abuseIsp String?`, `abuseIsTor Boolean?`, `abuseCheckedAt DateTime?`, `abuseIp String?` (the address that was checked), `abuseError String?` (short fixed reason). New `ProxyScore` (id, proxyServerId with `onDelete: Cascade`, scoredAt, ip, score, abuseScore, latencyMs, reputationChecked Boolean, status), index `(proxyServerId, scoredAt)` and `(scoredAt)`. Deleted after 30 days on every write, like `ProxyTest`. Then `db:generate`.
- [x] 3. Test first, then `core/abuseIpDb.service.ts`: `AbuseIpDbService.check(ip)` with native `fetch`, 10 s timeout, headers `Key` and `Accept`, `ipAddress` URL-encoded, `maxAgeInDays=90`, no `verbose`; zod-validates the answer; typed errors `RATE_LIMITED` (with `retryAfterSeconds`), `AUTH`, `PLAN`, `UNAVAILABLE`, `BAD_RESPONSE`; the key and the response body never appear in a message.
- [x] 4. Test first, then `database/proxyScore.ts` (pure): `scoreProxy({ abuseScore?, latencyMs? })` per P1, constants in one place, cap 89 without reputation. A table of cases in the test.
- [x] 5. Test first, then `database/proxyScoring.service.ts` (`ProxyScoringService`): `scoreProxy(proxyId)` (reuse a fresh same-IP abuse answer, else call the API, compute, update the proxy, write a `ProxyScore` row, trim history) and `runDue(now)` (select due proxies, re-test with a retry, score; one at a time with a short pause; one claim per proxy with a conditional `updateMany` on `scoredAt` so overlapping runs never double-score; stop on 429 or when `X-RateLimit-Remaining` is 0; cap a run at 200 proxies). `ProxyServerService.create/update/test` call `scoreProxy` after saving, not awaited, errors only logged.
- [x] 6. `ProxyServerService.pickForAccount` and `listUsableForAccount`: order by `score` desc (nulls last), then the existing order; `isPrimary` wins when its score is within 5 points of the best (Q3); below 90 the best is still used and the task result or proxy row carries a "no good proxy" warning (Q1). Update their tests first. This changes the proxy used for every task, and it must be called out in `MEMORY.md`.
- [x] 7. Test first, then the scheduler (`ProxyScoringScheduler`): hourly `setInterval`, first run 60 s after boot, `unref()`, no overlap, stopped in the SIGINT/SIGTERM handler of `server.ts`. Logs one line only when something was scored or failed: the smart-shutdown checker counts non-noise brain log lines as activity, so an hourly "nothing to do" line would keep staging awake forever.
- [x] 8. tRPC: add the score fields and a derived `scoreLabel` (`GOOD` at 90+, `FAIR` 70 to 89, `POOR` below 70, `NOT_SCORED`) to `metadataSelect` and the list; `proxyServer.history` also returns the score history (summaries only, no secrets).
- [x] 9. Body (`apps/body/src/components/proxies`): `score-badge.tsx` and a Score column in `proxies-table.tsx` (number, colour, tooltip with abuse score, reports, last reported, usage type, ISP, Tor, latency, scored at, "reputation not checked" and the account's "best proxy" marker); the existing test-history drawer gets a score history tab. Unit tests for the label and format helpers.
- [x] 10. `MEMORY.md`: decision, env var, formula, scheduler and the log-noise caveat, what is not verified; tick this plan, set `done`, fill "Outcome".

## Edge cases and risks

- Latency is one sample from one request. A single slow reading lowers the score for the day (the weight 0.3 limits the harm). Averaging the last 7 test latencies is a possible follow-up.
- Rotating or residential proxies change IP; the daily re-test (C7) records the current IP, and the abuse check uses it. A new IP forces an API call even inside the 24 hour reuse window.
- Same IP on several proxies (rare, proxies are per account): one API call, the result written to all.
- No public IP (`isPublic` false), no detected IP, or `UNREACHABLE`: no API call; the proxy has no score and shows "Not scored". It is also not usable (status), so nothing changes for picking.
- Quota: one call per distinct IP per day plus new IPs after create or edit. 1,000 a day is far above the need; a 429 ends the run, the next hourly wake-up resumes after `Retry-After`, never a loop. If the plan lapses (402/429) proxies keep their last score, tagged "reputation unavailable", and the score is capped at 89 as in P7.
- Bad or missing key: 401/403 is recorded once as `abuseError = 'API key rejected'`, retried at most once an hour, key never logged. Empty key: reputation half off (P7).
- Choosing the proxy changes behaviour for every existing account: from "primary, then lowest last latency" to "highest score". Proxies with no score sort last, so before the first daily run nothing changes for existing accounts.
- Hysteresis: a proxy at 90/89 can flip each day and the account then switches IP every day, which looks odd to LinkedIn. Mitigation (Q3): `isPrimary` keeps winning while within 5 points of the best. Different non-primary proxies close in score can still swap; accepted.
- A failed daily re-test turns a good proxy `UNREACHABLE` for up to a day (P5, Q4). The retry once limits it; "Test now" or an edit fixes it at any time.
- Concurrency and idempotency: conditional claim per proxy; results are overwrites; a duplicate run costs at most one wasted API call. Brain runs 1 replica with `Recreate`, so overlap only happens around a restart.
- Staging shutdown and Spot replacement: catch-up rule makes the missed day run at the first wake-up; the 60 s start delay keeps it away from boot-time migrations and broker connection.
- Privacy and compliance: AbuseIPDB receives only the exit IPs of the user's own proxies; no account, email or LinkedIn data, and nothing is reported. The AbuseIPDB terms for this use were not read (the API docs do not cover them); read them before production. The score is a third-party reputation signal, not proof of what LinkedIn does.
- Secrets: the key is only in the brain environment, sent only as a header, absent from logs, errors and API output. Proxy credentials are never sent to AbuseIPDB.
- Migration: additive nullable columns and one new table, no reset. Rollback: unset the key (reputation off, latency-only scores capped at 89) or revert the code; the columns can stay.
- Docker and CI: no new dependency (native `fetch`). Tests mock `fetch` and Prisma, so CI needs no key or network. No new brain top-level folder planned (code in `core` and `database`).
- `apps/body` compiles brain source with `erasableSyntaxOnly` (no constructor parameter properties in code the router reaches), and Prisma `Json` output types trip TS2589; this plan uses scalar columns only.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Unit tests: client (success, IPv6 encoding, 401, 402, 429 with `Retry-After`, timeout, bad JSON, key never in errors); `scoreProxy` table (boundaries 500/3000 ms, abuse 0/14/15/100, no latency, no reputation capped at 89); `runDue` (due rule, retest retry, same-IP reuse, claim, stop on 429, skips `DISABLED`, no key means no call, keeps the last good result on failure); `pickForAccount` ordering; scheduler (no overlap, unref, stop); body label and format helpers.
- Brain integration test (Postgres) for `runDue` and `pickForAccount` with the client mocked.
- Manual once with a real key: add a proxy, see the score appear on `/proxies`, then see the history entry.

## Outcome

Shipped on 2026-10-14: `ABUSEIPDB_API_KEY` (optional), migration `add_proxy_score` (score and abuse columns on `ProxyServer`, `ProxyScore` history kept 30 days), `AbuseIpDbService` (`core`), the pure score and pick rules (`database/proxyScore.ts`), `ProxyScoringService` and `ProxyScoringJob` (hourly wake-up, 60 s after boot, started in `server.ts`), `ProxyServerService.retest/scoreHistory`, `pickForAccount` by score, `proxyServer.scoreHistory`, a Score column and a score history in the test-history drawer on `/proxies`. Lint, type check, unit tests (brain 595, body 153, spider 418, contracts 79) and build pass.

Deviations:

- A score without a reputation is the speed alone, capped at 89 (the plan said the same; the formula for that case is `speed`).
- The daily re-test saves its first failure as `UNREACHABLE` for the minute before the retry, rather than holding the result back until the retry ends.
- Healthy (`ACTIVE`) proxies still rank before a `GEO_MISMATCH` one whatever the scores.
- Lookups that failed are retried at most hourly for the rest of the day, without re-testing the proxy. A rate limit or key error stops the run and pauses it (`Retry-After`, else an hour).
- The body list polls every 3 s while a score is still arriving after a test.

Not verified: a real AbuseIPDB call, a daily run against real proxies, the page in a browser, the integration tests for the new queries. Follow-ups: average latency over several tests, read the AbuseIPDB terms before production.
