# Sessions: record spider runs and review them at /sessions

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-12
- Locked by user: yes, 2026-10-12 ("lock": every recommendation accepted)

## Goal

Every time the spider does something on one of your LinkedIn accounts, that run becomes a **session** you can open at `/sessions`: what it was doing, what it was given, what came back, whether it succeeded or failed, a video of the browser, every step, every request, and the error logs. If a session failed you can try it again through a different proxy of the same account. The point is to see where the spider falls short on live LinkedIn and fix the code.

Plain words used on screen, so anyone can follow:

| Word | Meaning |
| --- | --- |
| Session | One run of the spider for one of your accounts. |
| Action | What the run was for. Today: "Check account sign-in". |
| Result | Success, Failed, or In progress, with one sentence saying why. |
| Steps | What the spider did in the browser, in order ("Opened the login page", "Typed the email"). |
| Network | The requests the browser made and what came back. |
| Logs | Errors and messages from three places: the browser page, the spider program, the browser engine. |

## Requirements

Confirmed (from the requests):

- A frontend module named `/sessions` that shows the performed tasks, only for the signed-in user.
- Each session gives enough context: the action it was performing, the request parameters, the response, and a verdict (failed or success).
- The user can retry the same action with changed request parameters. For now the only parameter that can change is the proxy, chosen from the same account's own proxies.
- Recording and session files are saved in the GCS bucket and served directly to the browser: video, session files and error logs from the browser, the Node.js spider and the browser engine.
- It must look good, stay simple, and be easy to work on. Anyone should be able to understand and use it.

Locked decisions (answers to the earlier questions, all the recommended option):

- Q1. First release covers account sign-in checks only; scrape tasks join when brain starts creating them.
- Q2. Recording mode `always` wherever recording is turned on (local now, staging later); the code default stays `off`.
- Q3. Recordings live 7 days, session rows 30 days; an older row says "Recording expired".
- Q4. "Try again" is offered for failures that are not a rejected password or code (errors and security checks). Never while a session is in progress; the 5 minute wait between checks stays.
- Q5. Accepted: videos and screenshots show the account's email, the two-step code field while typed and the signed-in pages. Mitigation: private bucket, 10 minute signed links, the retention above.
- Q6. Included: the worker image change (Playwright's `ffmpeg`) and the Google Cloud steps (service account for signing, bucket CORS, lifecycle rule), written down and applied only when the user says so.
- Q7. Staging: ship the code only; recording is not turned on there until the user asks.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: the recorder in `apps/spider`; a `SpiderSession` table and a `session` API in `apps/brain`; the `/sessions` page, drawer and retry dialog in `apps/body`; signed links to files in the bucket; tests; the Dockerfile addition; documented infrastructure steps.
- Out of scope: changing what the spider does on LinkedIn; editing anything but the proxy on a retry; scrape sessions until brain creates scrape tasks (the data model and screens already allow them); sharing a session with another user; deleting or exporting a session; live view of a running browser.

## What the user sees

Sidebar: a new entry **Sessions** (below Proxies). Same look as Accounts and Proxies: shadcn `Table`, `Badge`, `Select`, the right-hand `Drawer` already used for Test history.

```text
Sessions
Every check the spider ran for your accounts. Open one to see what happened.

[ All accounts v ]  [ All results v ]                                   

 Result        Action                  Account            Proxy              Started        Took
 Success       Check account sign-in   anna@example.com   de - 203.0.113.4   2 min ago      14 s
 Failed        Check account sign-in   anna@example.com   de - 203.0.113.4   1 hour ago     31 s
 In progress   Check account sign-in   joe@example.com    us - 198.51.100.9  just now       -
```

Clicking a row opens the drawer (the address becomes `/sessions?session=<id>`, so a link opens it):

```text
Check account sign-in                                  [ Try again ]
anna@example.com  -  FAILED  -  1 hour ago  -  31 s

[ Summary ] [ Video ] [ Steps ] [ Network ] [ Logs ]
```

- **Summary**: a result banner in a sentence ("LinkedIn asked for a security check that you have to complete yourself."). For a failure, "Where it went wrong": the step that failed, its screenshot, and a one-line hint (for example, "The page was not one the check understands: the spider's selectors may be out of date"). Then **What it was given** (a short list: action, account, proxy as `protocol://host:port` without credentials, when requested; "Credentials: sent sealed, never shown") and **What came back** (result, message, finished time, "browser session saved": yes or no). A "Tried again from" or "Tried again as" link joins a session to its retry.
- **Video**: a plain video player for the whole run.
- **Steps**: a vertical list, each with a plain sentence, how long it took, its screenshot, and the technical detail (selector, URLs) folded away. The failed step is marked.
- **Network**: a table (method, address, status, time). A row opens its headers and the response text. Request bodies are never kept, header and cookie values are masked.
- **Logs**: one list from three sources with a filter (All, Browser page, Spider, Browser engine) and a level filter (Errors, All). It says which tool each line came from.
- **Try again**: opens a small dialog, "Try again with another proxy": a list of this account's usable proxies (country, address, latency, status) with the current one marked, a short note ("Same account, same action. Only the proxy changes. Your current saved credentials are used."), and **Start**. After starting, the new session appears at the top with "In progress".
- Empty and error states are sentences with a next step ("No sessions yet. Add an account and a proxy, and its check shows up here.", "This recording expired after 7 days."). A session with recording off still shows Summary and says why the other tabs are empty.

About the word "Puppeteer": this project's browser is Camoufox driven through Playwright, not Puppeteer. The Logs source is called "Browser engine" on screen and covers what Puppeteer errors would be: launch failures, timeouts, failed requests, crashes.

## Approach

### 1. Data (brain, additive migration)

New model `SpiderSession` (migration `add_spider_session`, applied to both local databases, then `db:generate`):

- `id` is the id of the command the spider receives (today the `validation_id`), so a session and the validation it stands for share one id.
- `userId` (owner, cascade), `linkedInAccountId` (cascade), `kind` (`VALIDATE_ACCOUNT`; `SCRAPE` reserved), `status` (`IN_PROGRESS`, `SUCCEEDED`, `FAILED`), `outcome` (the spider's `VALID`, `INVALID_CREDENTIALS`, `NEEDS_REAUTH`, `ERROR`, or null), `message`.
- Proxy snapshot: `proxyServerId` (set null on delete), `proxyProtocol`, `proxyHost`, `proxyPort`, `proxyCountry`, because proxies can be edited or removed later. Never credentials.
- `requestParams` (a small, fixed, non-secret object: action, email, proxy address, requested time) shown as "What it was given".
- `startedAt`, `finishedAt`, `durationMs`, `recordingPrefix` (null when nothing was recorded), `retryOfId` (self reference).
- Indexes: `(userId, startedAt)` and `(linkedInAccountId, startedAt)`.

Created in `LinkedInAccountValidationService.request` when a check is queued (status `IN_PROGRESS`); a failed publish ends it as `FAILED` ("Could not be queued"). No row when nothing runs (no proxy yet). `applyResult` always records the session's own verdict (once, only while `IN_PROGRESS`), separately from the existing rule that decides whether the account's status changes (still the account's latest `validationId` only). A session still in progress after 30 minutes (the account lease time) is shown as "No answer" and never edited by the page. Rows older than 30 days are deleted on write, like the proxy test history.

### 2. Contracts

`ValidateAccountResult` gets one optional field, `recording_prefix` (a bucket path). It is additive, so old and new workers and brain interoperate. Nothing else on the wire changes.

### 3. Spider: the recorder

What a run writes under `recordings/<kind>/<id>/<startedAt>/` (the time keeps a rerun after a broker retry from overwriting the first attempt):

| File | What it holds |
| --- | --- |
| `timeline.json` | Each step in order: what the spider did in plain words, the call (`goto`, `click`, `fill`, `exists`, `extract`), selector, page address before and after, duration, result or error, and the final verdict. A `fill` records the field and the length, never the value. Lists the screenshot names. |
| `network.json` | Each request and response: method, address, status, timing, headers (cookie, set-cookie, authorization, csrf values masked), and the response text for the main page and fetch/XHR, cut at 64 KB. No request bodies, no images, fonts, scripts or styles. Address values for names like `token`, `secret`, `password`, `code`, `pin`, `csrf`, `session`, `key` are masked. |
| `logs.json` | One list of `{ time, source, level, message }`. `source` is `browser` (page console and page errors), `spider` (this run's own events: step started and finished, errors, retries; not the whole process log) or `engine` (launch errors, navigation timeouts, failed requests, crashes). Messages are cut at 2,000 characters and passed through the same masking, including `user:password@` in any address. |
| `screenshots/NN-<step>.png` | One after each step, plus one when a step fails. |
| `failure.html` | The page's HTML when a step failed. Stored with type `text/plain` and only ever shown as text. |
| `video.webm` | Playwright's video of the page for the whole run. |

- `Recorder` and `RecordedSession` (a decorator over `LoginSession`, so it works with any driver and is unit-testable with fakes) in `apps/spider/src/recording/`. A recording error is caught and logged and can never change a run's result, retries or status.
- `CamoufoxDriver` attaches what needs the real page: `recordVideo`, request/response and console listeners, screenshots, page HTML.
- `ObjectStore.upload(key, localPath, contentType)` streams a file so the video is never held in memory. A video over 50 MB is skipped and noted in the timeline.
- `processValidation` order: close the browser (the video is complete only then), upload the recording, then publish the result carrying `recording_prefix`. The browser never shows a prefix whose files are not there.
- A failed run is: any step that threw, or a verdict other than `VALID` and `INVALID_CREDENTIALS`. Mode `failures` keeps a recording only then.
- Env: `SPIDER_RECORDING` (`off` | `failures` | `always`, default `off`, `devDefault` `always`) and `SPIDER_RECORD_VIDEO` (default `true`).

### 4. Brain: the `session` API (`ownerProcedure`, every query scoped to `ctx.user.id`, another user's id answers NOT_FOUND)

- `session.list({ accountId?, status?, cursor? })`: newest first, 20 per page, light fields only.
- `session.get({ id })`: the full session, plus `canRetry` with a reason when false, the account's usable proxies for the retry dialog, and the retry links. Output types are plain objects, not Prisma `Json` (it breaks the web app's `tsc` with TS2589).
- `session.fileUrl({ id, file })`: a signed link to one file of that session. `file` must match a fixed list (`video.webm`, `timeline.json`, `network.json`, `logs.json`, `failure.html`, `screenshots/NN-name.png`); the bucket path always comes from the database, never from the client. The link is read-only, expires in 10 minutes and carries a fixed content type and `Cache-Control: private`. The browser then loads the video, images and JSON straight from the bucket.
- `session.retry({ id, proxyId })`: see "Try again" below.
- Env (brain): `SPIDER_GCS_BUCKET` (optional; without it the page works but the Video, Steps, Network and Logs tabs say "Recordings are not set up here") and `SESSION_RECORDING_RETENTION_DAYS` (default 7, used to say "Recording expired").
- Signing needs a Google identity in brain. On staging that is Workload Identity (a service account with read access to `recordings/` only, allowed to sign for itself), written down in `deploy/gcp-setup.md` and not applied until you say so. Locally it works with service account impersonation (documented). The bucket also needs CORS for the app's address so the browser may fetch the JSON files (documented, not applied).

### 5. Try again

`session.retry({ id, proxyId })` starts a new session for the same account and action:

- Only `proxyId` can change. It must be a proxy of this same account that is usable (ACTIVE or GEO_MISMATCH). It may be the same proxy. A proxy of another account, or one that does not exist, is refused.
- The credentials are the account's current saved ones, read the way a normal check reads them; nothing from the old session is reused except the action and account.
- Refused while the account is paused, while a session of it is in progress, inside the 5 minute wait, or when the old result is one Q4 excludes. Each refusal is a sentence the page shows.
- The new session records `retryOfId`. `LinkedInAccountValidationService.request(accountId, { proxyId? })` gains the optional proxy and otherwise behaves as before.

### 6. Body (`apps/body`)

- Route `/sessions`, sidebar entry, `pages/Sessions.tsx`, components in `src/components/sessions/`: `sessions-table`, `session-status-badge`, `session-drawer` with one small component per tab, `retry-dialog`, and one `describe.ts` that turns outcomes and spider calls into plain sentences (the only place wording lives).
- One small hook loads a file through `session.fileUrl`, caches it for the link's life and asks again if the link has expired.
- Everything page-derived (log lines, response text, HTML, titles) is rendered as text, never as HTML. Loading is a skeleton, errors are inline sentences, like the Proxies page.

### Steps (each with its test first)

- [x] S1 Spike (done first): (a) Camoufox 0.5.8 with `playwright-core` 1.62 records a playable VP8 webm headless once Playwright's ffmpeg is installed (800x600, about 31 kb/s, 19 KB for a 5 second page); CPU cost was not measured beyond that and whether a page can detect the screencast was not checked. (b) A signed link cannot be made with user credentials (`Cannot sign data without client_email`), as expected: brain needs a service account (Workload Identity on GKE, impersonation locally). Not verified against the real bucket, so the streaming fallback was not needed yet and signed links stay the design.
- [x] S2 `contracts`: `recording_prefix` (and the shared `SECURITY_CHECK_MESSAGE`), with schema tests.
- [x] S3 Spider masking, `Recorder`, `RecordedSession`, `attachRecorder`, logs, `ObjectStore.upload`, driver wiring, `processValidation` wiring; the real-browser test against the stand-in site checks the files and that no password or cookie value is in any text.
- [x] S4 Brain migration `add_spider_session` and `SpiderSessionService`; sessions are created and finished in `request` and `applyResult`; integration tests with PostgreSQL.
- [x] S5 `session` router (`list`, `get`, `fileUrl`, `retry`) with unit tests for owner scoping, the file whitelist, retry rules and expiry.
- [x] S6 Body page, table, drawer, tabs, retry dialog, `describe.ts` and `recording.ts` with tests for the wording and for reading the recording files. The file hook and the components have no tests (the app has no DOM test setup).
- [x] S7 Env keys (`env.ts`, `.env.example`, compose); Dockerfile `ffmpeg`; documented Google Cloud steps (service account, CORS, lifecycle) in `deploy/gcp-setup.md`, not applied. `deploy/components/spider` needed no change: recording defaults to off there.
- [x] S8 Full definition of done and `MEMORY.md`. The local end-to-end run through the page was not done (it needs a signed-in session and a bucket reachable with service account credentials).

## Edge cases and risks

- Secrets: the password is posted in the login request and the session cookie is in headers. No request bodies are stored, header and address values are masked, the `fill` value is never logged, and proxy credentials are masked in every log line. A test searches every artifact for the test password, token, cookies and proxy password. Playwright's own trace is not used on purpose: it records typed text in plain form. Rows hold no secret.
- Privacy: videos and screenshots cannot be masked (Q5). Files are private in the bucket and reachable only through a 10 minute link that brain gives its owner.
- Ownership: every read and the retry check `userId`; `proxyId` is checked against the session's account; file names are whitelisted and the path comes from the database. This blocks reading another user's session or file, or retrying through another account's proxy.
- Untrusted content: log text, titles, response bodies and HTML come from LinkedIn or a proxy. They are shown as text only. `failure.html` is stored as `text/plain`.
- Account safety on retry: the 5 minute wait stays, a rejected password or code cannot be retried, one session at a time per account (the existing account lease still applies), and a paused account cannot be retried.
- Stale or odd rows: a run that never answers shows "No answer" after 30 minutes; a result for an unknown or already finished session is ignored; a session of a deleted account is deleted with it; a deleted proxy keeps its snapshot and drops out of the retry list. A newer check may update the account's status while an older session keeps its own verdict.
- Failure isolation: recording, uploading or signing can fail without changing a check's result or the account's status. A run with recording off behaves as today; the session still exists with its verdict.
- Cost: video encoding runs next to the browser. The staging worker has a `400m` CPU request on a shared Spot node and 2Gi memory; S1 measures it. `SPIDER_RECORD_VIDEO=false` keeps everything except the video. Temp files are removed in a `finally`; the one-browser-at-a-time lock keeps it to one run.
- Dev and production: spider recording defaults to `off`, so a deploy without the new variables records nothing. Brain without a bucket still lists sessions. Staging has no worker today, so sessions there stay In progress until one runs; that is the existing behaviour for checks.
- Migration: additive only, no reset. Docker and CI: the worker image gains Playwright's ffmpeg; the integration job gains the new table tests only.
- Compliance: this shows a signed-in user their own account's runs, inside LinkedIn's authorization recorded in `.plan/linkedin-account-linking.md`. It adds no scraping, bypasses nothing and sends data nowhere new. Retrying changes only the proxy and keeps the checks' rate limits.
- Rollback: set `SPIDER_RECORDING=off` and hide the sidebar entry; the table and the contract field are additive. Delete `recordings/` to remove files.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root.
- Brain integration tests (PostgreSQL) for session creation, finishing, listing and owner scoping.
- The real-browser test (`camoufoxDriver.e2e.test.ts` style) against the stand-in site: the files exist, the video is a non-empty webm, a missing selector produces `failure.html` and a failed step, and no secret value appears anywhere.
- Local end-to-end: run the stack, check an account, open `/sessions`, play the video, read the steps, network and logs, then try again with another proxy.
- Not verifiable here: a live LinkedIn run (needs a real account and proxy), and Workload Identity signing on staging (needs the Google Cloud setup).

## Outcome

Shipped as locked, with these deviations:

- The Summary tab does not show "browser session saved: yes or no": brain does not store the session path, so there is nothing to show.
- `retryRefusal` lives in its own module (`sessionRetry.ts`), because the validation service's tests mock the session service, and the rule must stay real in them. The rule matches the security check by a sentence now shared through `@automatedLinkedIn/contracts` (`SECURITY_CHECK_MESSAGE`), not by loose text.
- `ProxyServerService.pickForAccount` now returns `{ config, summary }` (credentials for the worker, a credential-free summary for the session), and `request` takes `{ proxyId, retryOfId, validationId }`; a new `listUsableForAccount` feeds the retry dialog.
- The proxy test history drawer shares `floating-drawer`, `radio-mark` and `text-block` with the new drawer instead of keeping copies.
- Mode `failures` counts a run as failed for an `ERROR` or a security check (`NEEDS_REAUTH`), or when the check or the browser crashed (verdict `CRASHED`); a rejected password is not a spider failure.

Verified: `pnpm lint`, `ts:check`, `test:unit:run` (brain 386, spider 330, body 102, contracts 55) and `build`; brain integration tests for sessions (6) and the existing validation ones (5); a real-Camoufox test that records a sign-in against a stand-in site (files, a playable video, a failing step with its screenshot and page, and no password or cookie value in any text).

Not verified: the `/sessions` page in a browser, signed links and the CORS rule against the real bucket (no service account yet), the worker image build, a live LinkedIn run, and CPU cost of the video on the staging node.

Follow-ups (also in `MEMORY.md`): apply the Google Cloud steps in `deploy/gcp-setup.md` before turning recording on in staging; scrape sessions when brain creates scrape tasks; component tests for the page once the app has a DOM test setup.
