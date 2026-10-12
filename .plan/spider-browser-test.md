# Spider standard task: browser detection test (per proxy, automatic or on request)

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-12
- Locked by user: yes, 2026-10-12 (pages chosen by the user; the other answers are the recommended ones, accepted with "lock it")

## Goal

The spider gets a small catalogue of **standard tasks** (jobs that need no LinkedIn account sign-in). The first entry is
the **browser detection test**: open the spider's real browser through one of the user's proxies, visit public bot
detection pages, scroll them while recording, and report whether the browser was taken for a bot. It runs on its own when a
proxy is found active, and on request as a **Browser test** next to the existing proxy **Test**. The result, the video and
the screenshots show up at `/sessions`.

## What this reuses (checked in the code, 2026-10-12)

- Sessions feature (`.plan/spider-session-recording.md`): `SpiderSession` rows, the spider `Recorder` (video, per-step
  screenshots, `timeline.json`, `logs.json`, `network.json`) and the bucket layout `recordings/<kind>/<id>/<time>/`,
  signed links through `session.fileUrl`, the `/sessions` table and drawer.
- The queue pattern of account validation: brain publishes a command to a quorum queue, spider consumes it, answers on a
  results queue, brain consumes the answer and finishes the session (`accountValidationQueue.ts`, `processValidation.ts`).
- A proxy belongs to exactly one LinkedIn account (`ProxyServer.linkedInAccountId`), so a browser test session can use the
  proxy's account and owner and needs no new ownership rule.
- Proxy tests today run in brain (a request to ipinfo.io through the proxy). They end in `ACTIVE`, `GEO_MISMATCH` or
  `UNREACHABLE` in `ProxyServerService.create`, `update` and `test`. Those three are the places that "found active".
- Camoufox already runs in the worker with a generated fingerprint (`camoufoxDriver.ts`).

## Facts checked about the detection pages (2026-10-12)

- `https://deviceandbrowserinfo.com/are_you_a_bot` prints a verdict ("You are a bot!" or human) and a raw JSON block
  `{ "isBot": ..., "details": { 25+ named signals such as hasWebdriverTrue, isPlaywright, hasInconsistentWorkerValues } }`.
  It uses fingerprint signals and HTTP headers only: no IP reputation and no behaviour. It has no `robots.txt` (404).
  Its terms of service were not read.
- `https://pixelscan.net/bot-check` is a script-driven page: a **Start Check** button, "Running bot detection...", then a
  headline, either "You're Definitely a Human" or "Bot Behavior Detected", and a list of categories each marked Clear or
  Detected with a parameter count (Navigator, Webdriver, CDP, User Agent, ...). It says it looks at fingerprints, behaviour
  patterns and connection details, so the proxy can influence its answer. Its `robots.txt` disallows `/api/`, the blog and
  search paths, not `/bot-check`. Its terms were not read. Its page needs an interaction (the button) and a wait.
- Spike result: Pixelscan starts by itself (no click is needed) and its verdict is read from the `state` attribute of
  `.checker-header`, because its text holds both headlines.
- Neither page is LinkedIn. A pass says the browser looks human to those scripts; it does not promise LinkedIn will agree.
  The page says so in plain words.
- For scale: Electron on this Mac was called "a bot" by both pages (`hasInconsistentWorkerValues` on the first, "Bot
  Behavior Detected" with Webdriver flagged on the second), so a strict detector is a real possibility and the report must
  show the failing signals, not only a verdict.

## Requirements

Confirmed (from the request):

- R1 A spider standard task that runs a browser detection test.
- R2 It runs automatically for each proxy once the proxy is found active, and on request ("browser test", like the
  existing proxy test).
- R3 It records the full screen, scrolls down the page, takes screenshots, and uploads everything to the bucket.
- R4 The result is visible at `/sessions`, like the other sessions.

Confirmed by the user (2026-10-12):

- Q1 **Which pages**: `https://deviceandbrowserinfo.com/are_you_a_bot` and `https://pixelscan.net/bot-check`. The result
  is "Detected" when either page says bot, and "Not detected" only when both say human; a page that cannot be read gives
  "Could not tell" unless the other already says bot. More pages later are one small reader each.
- Q2 **"Found active"**: when a proxy test ends `ACTIVE` (not `GEO_MISMATCH`) after add, edit or the Test button, and no
  browser test of that proxy ran in the last 24 hours, or the proxy's host, port or credentials changed.
- Q3 **"Full screen"**: the video of the browser page at the size of the generated screen (at most 1280 by 720 to keep
  files small) and full-page screenshots; not a capture of the machine's desktop. Playwright can only record the page.
- Q7 **"Standard task list"**: a small code-level catalogue (a typed command with a `task` field and one handler per
  task); not a new screen with a list of tasks. Adding a task later is one schema entry and one handler.

Accepted as recommended ("lock it"):

- Q4 **Reading the result.** Wording on screen: "Not detected" (green, status Succeeded), "Detected as a bot"
  (red, status Failed) and "Could not tell" (grey, status Failed, for a page that changed or did not load).
- Q5 **The manual button.** A **Browser test** action in the proxies table row menu, refused with a sentence
  while one is running for that proxy or inside a 5 minute wait, and only for a usable proxy (`ACTIVE`, `GEO_MISMATCH`).
- Q6 **Recording.** Always recorded for this task, whatever `SPIDER_RECORDING` says (the recording is the
  point); `SPIDER_RECORD_VIDEO=false` still turns off the video.
- Q8 **Staging.** The results can only be opened on staging after two things only you can do: the Google Cloud steps in
  `deploy/gcp-setup.md` (service account that signs links, bucket CORS, lifecycle) and adding the two hosts to
  `SPIDER_ALLOWED_HOSTS` in the `STAGING_CONFIG_ENV` secret. The plan documents both; it applies neither.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: a `BROWSER_TEST` session kind and the queues for standard tasks (contracts); the spider handler, detection
  report and page readers; brain publishing, consuming and the automatic trigger; the proxies table action; the
  `/sessions` display (action name, verdict banner, a Detection tab); tests; docs for the infrastructure steps.
- Out of scope: any LinkedIn page or sign-in; mouse, typing or form tests (the behaviour test of the first site);
  IP reputation or "is this IP a datacenter" checks of our own; scheduled re-tests; a screen listing standard tasks; changing
  retry of sign-in sessions; applying anything on Google Cloud or staging.

## What the user sees

- **Proxies**: row menu gains **Browser test** (next to Test and Test history). After a click: "Browser test started. See it
  in Sessions" with a link. A proxy that just turned active starts one by itself and nothing else changes on the page.
- **Sessions**: a new action name "Browser test". The account column shows the proxy's account, the proxy column the
  proxy. The drawer for one of these has:
  - **Summary**: the banner ("Not detected: both detection pages took this browser for a person. This says nothing
    about LinkedIn's own checks."), what it was given (action, proxy address without credentials, trigger: automatic or
    requested by you, the browser identity the spider used: OS, Firefox version, screen), and what came back.
  - **Detection** (new tab, only for this action): one block per page with its verdict and the list of signals or tests
    that failed, each with a plain sentence.
  - **Video**, **Steps**, **Network**, **Logs**: as today (steps are "Opened page 1", "Scrolled down", "Took a screenshot",
    "Read the result").
  - "Try again" is hidden for these sessions; the proxies table is where a new one starts.

## Approach

### 1. Contracts (`packages/contracts`)

- New queue pair: `tasks.standard` (quorum, delivery limit as the others, dead-letter queue) and `tasks.standard.done` (TTL
  and length cap like `accounts.validated`), with keys, declared by both apps in the shared topology function.
- `standardTaskCommandSchema`: `strictObject`, a discriminated union on `task`. First member
  `{ task: 'browser_detection', task_id: uuid, proxy?: proxySchema, requested_at }`. No credentials of any account.
- `standardTaskResultSchema`: `{ task_id, task, outcome: 'NOT_DETECTED' | 'DETECTED' | 'COULD_NOT_TELL', message (a fixed
  sentence, max 200), recording_prefix?, finished_at }`. The details live in a file in the bucket, not on the wire.
- `RECORDING_PREFIX_PATTERN` gains `browser-test` (additive; old prefixes still match).

### 2. Spider (`apps/spider`)

- Worker: consume `tasks.standard` next to validations and scrape tasks; the existing one-browser-at-a-time mutex applies.
  A small `standardTasks` registry maps `task` to a handler (one entry now).
- `processBrowserDetection` (own module, tests with fakes): opens the driver through the proxy (a failing proxy fails the
  task, never falls back to a direct connection), starts a `Recorder` that is always on for this task, then for each page:
  open it (allowed host, robots checked, rate limit), wait for the page's result to appear, screenshot, scroll down in
  viewport steps with short pauses and a screenshot per step, a final full-page screenshot, read the result. Closes the
  browser, finishes the recording, uploads `detection.json`, publishes the result.
- Driver additions (small, behind a narrow interface that `RecordedSession` passes through): `scrollBy`, a full-page
  `screenshot({ fullPage })`, and reading page text. `CamoufoxDriver` implements them; the video size is set when
  recording a browser test.
- One reader per page (`deviceAndBrowserInfo.ts`, `pixelscan.ts`): pure functions from the page's text or HTML to
  `{ verdict, signals[] }`, built from saved fixtures of the real pages. A page whose markup is no longer understood gives
  `COULD_NOT_TELL`, never "not detected".
- `detection.json`: per page the verdict and signals, the browser identity (OS, Firefox version, screen, a note that it is
  the generated fingerprint), the exit IP seen by the page when it shows one. No secret is in it.
- Env: the two hosts in `SPIDER_ALLOWED_HOSTS` (dev default adds them; production lists them on purpose). No new setting
  unless the plan needs one for the video size.

### 3. Brain (`apps/brain`)

- Migration (additive): `SpiderSessionKind` gains `BROWSER_TEST`. No new column: `outcome` holds the verdict and
  `detection.json` is read from the bucket.
- `BrowserTestService.request(proxyId, trigger)`: checks the proxy is usable, the 5 minute wait and no run in progress for
  the proxy, creates the `SpiderSession` (`IN_PROGRESS`, proxy snapshot, params `{ action, trigger }`), publishes, and ends
  the session as failed ("Could not be queued") if the publish fails.
- `StandardTaskQueue` (publish and consume, same shape as `AccountValidationQueue`); `applyResult` finishes the session and
  keeps the verdict. A result for an unknown or finished session is ignored.
- Automatic trigger: after `ProxyServerService.create`, `update` and `test` save an `ACTIVE` outcome, call
  `BrowserTestService.request(proxyId, 'automatic')` without awaiting its failure; a failure here never fails the proxy
  save (same rule as the test history).
- `proxyServer.browserTest({ id })` (owner scoped, `NOT_FOUND` for another user's proxy) returns the new session id or a
  refusal sentence.
- `session.fileUrl` whitelist gains `detection.json`; `session.get` exposes the action and trigger for the new kind and
  hides retry.

### 4. Body (`apps/body`)

- Proxies table: the **Browser test** menu item and a toast with a link to `/sessions?session=<id>`.
- Sessions: action label, verdict banner and the Detection tab (`describe.ts` holds all wording), reading `detection.json`
  through the existing file hook. Page-derived text is rendered as text only.

### Steps (each with its test first)

- [x] S1 Spike on the real pages through the worker image: video size, full-page screenshot and scrolling in Camoufox,
  and saved fixtures of both pages (and what they show for the current fingerprint).
- [x] S2 Contracts: topology, schemas, prefix pattern, with schema tests.
- [x] S3 Spider: page readers from fixtures, `processBrowserDetection`, driver additions, worker wiring.
- [x] S4 Brain: migration, `BrowserTestService`, queue, `applyResult`, automatic trigger, resolver, whitelist.
- [x] S5 Body: proxies action, sessions display, Detection tab.
- [x] S6 Env, compose and `.env.example`, `deploy/gcp-setup.md` notes; definition of done; `MEMORY.md`.

## Edge cases and risks

- **Third parties see the test.** Each page learns the proxy's exit IP and the browser's fingerprint, nothing about the
  account. It is also a request to sites the user does not own; both robots files were read (the first site has none, the
  second disallows only `/api/`, its blog and search paths), the terms of neither were. Hosts are on the allowlist on
  purpose, and the rate limit applies. The second page's own script calls its `/api/`; that is the page working in a
  browser, not the spider crawling, and the spider never navigates there itself.
- **The second page needs a click and a wait.** Pixelscan starts only after **Start Check**, and its result can take several
  seconds; the reader waits for the headline with a time limit and answers `COULD_NOT_TELL` when it never comes. It may
  also react to the proxy's IP, so a different proxy can change its answer.
- **Pages change.** A reader that no longer understands a page returns `COULD_NOT_TELL`. Fixtures make the break visible in
  tests; the live pages are not part of CI.
- **A pass is not proof.** The banner and the docs say the pages check fingerprint signals only. The random fingerprint
  also changes on every launch, so two tests of one proxy can differ; each report records the identity used.
- **Load.** Many proxies added at once queue many browser tests; one browser at a time per worker keeps CPU bounded
  (`400m` request on staging). The 24 hour rule and the 5 minute wait stop repeats; a quorum queue with a delivery limit
  stops a poison message.
- **Failure isolation.** Queueing, the worker or the recording failing never changes the proxy's status or a proxy save.
- **Ownership.** The command carries only the proxy and a task id; the proxy's account and owner come from brain's own row
  when the result arrives. Another user's proxy id answers `NOT_FOUND`.
- **Secrets.** The proxy credentials are in the command (as for validation) and masked in every recording and log by the
  existing masking. `detection.json` holds the signals and identity only.
- **Staging.** The worker runs headless on staging by choice (`SPIDER_HEADLESS=true`), which some detectors treat
  differently from a real display; the report records the mode. Opening results needs the two manual steps in Q8.
- **Migration and rollback.** The migration only adds an enum value. Rollback: stop the automatic trigger by removing the
  call, ignore the queue; recordings expire after 7 days and rows after 30.
- **Compliance.** The task touches no LinkedIn page and no account. It acts only on proxies the signed-in user owns.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root.
- Brain integration tests (PostgreSQL) for the new session kind, the wait and the in-progress rule.
- A real-Camoufox test against local stand-in pages for scrolling, screenshots and the video; readers tested against saved
  fixtures of the real pages.
- Worker image: run one browser test through a proxy against the real pages and open the files.
- Not verifiable here: signed links against the real bucket (needs the Q8 steps) and a run through a real proxy.

## Outcome

Shipped on branch `feat/spider-browser-test`:

- Contracts: `standardTaskCommandSchema` (union on `task`), result schema, `tasks.standard*` queues, `browser-test` recording
  prefix.
- Spider: `detection/` (readers from fixtures, `processBrowserDetection`, `standardTasks` registry), driver additions (wheel
  scroll, page text, full-page screenshot, identity, video size 1280x720), worker consumer on `tasks.standard`.
- Brain: migration `add_browser_test_session_kind`, `BrowserTestService` (`requestForUser`, `requestAutomatic`),
  `StandardTaskQueue`, shared `consumeResults` helper (the validation queue now uses it), `SpiderSessionService.startBrowserTest`
  and `finishStandard`, `proxyServer.browserTest`, automatic trigger after create, update and test ending `ACTIVE`,
  `detection.json` in the file whitelist.
- Body: **Browser test** in the proxies row menu with an inline link to the session, session label, verdict wording, grey
  "Could not tell" tone, **Detection** tab, scroll step wording, no "Try again" for browser tests.
- Verified: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests, and one real run in the
  worker image against both real pages (no proxy): `NOT_DETECTED`, `detection.json`, two full-page screenshots, a 1280x720 video.

Deviations from the plan:

- The session's `requestParams.action` is `BROWSER_TEST` (upper case, like `VALIDATE_ACCOUNT`).
- The automatic trigger runs for `ACTIVE` only (not `GEO_MISMATCH`); "connection changed" is any edit that sets protocol, host,
  port, username or password, which skips the 24 hour rule but not the 5 minute wait.
- The proxies page shows an inline "Follow it in Sessions" line instead of a toast: the app mounts no toaster.
- A queue that could not publish ends the session as `FAILED` with outcome `ERROR` ("could not be queued"); the badge says
  "Failed" for it.
- The report does not record the headless mode.

Follow-ups: the staging steps in `deploy/gcp-setup.md` (signing service account, CORS, lifecycle, the two hosts in
`STAGING_CONFIG_ENV`), a run through a real proxy, the page in a browser, and the terms of both detection sites were not read.
