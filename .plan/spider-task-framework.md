# Spider task framework: one fixed contract, tasks defined in the spider folder

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-10-13
- Locked by user: yes, 2026-10-13 <!-- change to "yes, <date>" only after the user confirms -->

## Goal

Adding a task (browser detection, LinkedIn login, read a post, read a profile, ...) must mean adding one folder in
`apps/spider/src/tasks/` and nothing else: no new queue, no new contract schema, no database migration, no new brain
endpoint. Brain asks for a task by name, the spider runs it, uploads every file it produced to the bucket in one fixed
layout, and brain saves the file links from the result message so the Sessions page can show them.

This replaces the task-specific pieces added on `feat/spider-browser-test` (still unmerged, so cheap to replace now).

## What exists today (checked in the code, 2026-10-13)

Three separate task paths, each with its own contract, queue, result schema and brain code:

- scrape tasks: `tasks` / `results` queues, `scrapeTaskCommandSchema`, no brain producer yet.
- account validation: `accounts.validate` / `accounts.validated`, `validateAccountCommandSchema`, `LinkedInAccountValidationService`.
- browser test (this branch): `tasks.standard*`, `standardTask*` schemas, `BrowserTestService`, `BrowserTestRefusedError`,
  enum value `BROWSER_TEST`, a `detection.json` whitelist entry, a `DetectionTab` in body.

Every new task today costs: a contract schema, a queue pair or union member, an enum value (migration), a service and a
resolver in brain, a whitelist entry, and a body tab. That is what this plan removes.

## Requirements

Confirmed (from the request):

- Tasks live in `apps/spider/src/tasks/`, one folder each (examples given: LinkedIn login, browser detection, read a LinkedIn
  post, read a LinkedIn profile).
- Brain requests a task; the spider performs it; the spider uploads its files (logs, screen recordings, screenshots,
  requests, responses, warnings) to the bucket in a proper structure; brain reads the result from RabbitMQ, saves the file
  links; the body (web app) shows them.
- Scalable, reproducible and fixed: a standard contract used for every task from now on.
- Plan first, then execute.

Confirmed by the answers of 2026-10-13:

- Account validation moves onto the framework in this same change, as the `linkedin-login` task (not a later plan).
- The worker announces the task catalog at start; brain stores it. Brain and body never import spider code.
- Brain may have optional per-task result hooks, registered in one file, only where a task must change brain data.
- The body shows every task only through generic tabs; no custom view per task.
- A run also saves the browser session cache and the local storage values, as a per-run file the Sessions page can open
  (the owner's choice; safeguards in section 3).
- Request and response stay together in one `network.json`.
- Validations still waiting in the old `accounts.validate` queue at the deploy are not processed (no shim): the account stays
  `PENDING` and the owner presses verify.

Proposed, to be confirmed by locking: everything else in Approach below.

## Approach (proposal)

### 1. The standard contract (`packages/contracts`, written once)

One command, one result, three queues, versioned. Task-specific content travels only inside `input` and `report`, which
contracts treat as opaque JSON with a size limit.

```
TaskCommand  (queue tasks.run)
  contract: 1
  task_id: uuid                 // also the session id
  user_id: string               // brain's own User id; only used to build the bucket prefix, never trusted for access
  task: "browser-detection"     // name of a folder in apps/spider/src/tasks
  task_version: 1               // integer declared by the task; brain stores it
  requested_at
  trigger: "manual" | "automatic" | "retry"
  proxy?: { server, username?, password? }          // resolved by brain from the user's own proxy
  credentials?: Sealed                              // only when the task declares it needs an account
  account_id?: string
  input: object                 // validated by the task's own zod schema in the spider, never by brain

TaskResult  (queue tasks.done)
  contract: 1
  task_id, task, task_version
  status: "SUCCEEDED" | "FAILED"
  verdict: string               // task-defined code, e.g. NOT_DETECTED; brain never interprets it
  message: string (<= 200)      // one fixed sentence, no page content, no secret
  report?: { headline, sections: [{ title, items: [{ label, value, status? }] }] }   // generic, body renders it as text
  artifacts: Artifact[]         // <= 300; see below
  artifacts_truncated: boolean
  worker: { build }             // git sha of the worker image, for reproducing a run
  started_at, finished_at
  // no run_prefix: both sides derive it with runPrefix() (section 3), so a result cannot name a path of its own

Artifact { kind, name, path, content_type, bytes, step?, sensitive? }   // sensitive: only kind "session"
  kind: "log" | "network" | "video" | "screenshot" | "report" | "session" | "file"   // network.json holds requests and responses, logs.json holds warnings

TaskCatalogEntry  (queue tasks.catalog, last message wins)
  task, version, title, description
  input_schema: JSON Schema      // derived from the task's zod schema (z.toJSONSchema)
  needs: { proxy: "required" | "optional" | "none", account: boolean }
  verdicts: { [code]: { label, tone: "success" | "failure" | "neutral" } }
  policy: { cooldown_ms, one_at_a_time: "proxy" | "account" | "none", automatic?: [{ on: "proxy.active", every_ms }] }
  hosts: string[]                // the sites the task intends to visit
```

`runPrefix({ task, user_id, requested_at, task_id })` is one pure function in `packages/contracts`, with the path patterns
(`RUN_PREFIX_PATTERN`, `ARTIFACT_PATH_PATTERN`), used by the spider to write, by brain to check and sign.

Rules: additive changes only inside `contract: 1`; a breaking change is `contract: 2` on new queue names. Unknown major
versions are dead-lettered, never guessed.

### 2. Defining a task (`apps/spider/src/tasks/<name>/`)

```
tasks/
  defineTask.ts          // the one authoring API and its types
  registry.ts            // explicit list of tasks (one import line per task)
  runner.ts              // the only code that touches queues, recording, proxy, locks
  context.ts             // what a task is given
  browserDetection/      // index.ts (defineTask), readers, fixtures, tests   <- moved from src/detection
  linkedinLogin/         // later, separate plans
  linkedinReadPost/
  linkedinReadProfile/
```

```ts
export default defineTask({
   name: 'browser-detection',
   version: 1,
   title: 'Browser test',
   description: '...',
   input: z.strictObject({}),
   needs: { proxy: 'required', account: false },
   hosts: ['deviceandbrowserinfo.com', 'pixelscan.net'],
   verdicts: { NOT_DETECTED: { label: 'Not detected', tone: 'success' }, ... },
   policy: { cooldownMs: 5 * 60_000, oneAtATime: 'proxy', automatic: [{ on: 'proxy.active', everyMs: 24 * 3600_000 }] },
   limits: { timeoutMs: 180_000, attempts: 3 },
   run: async (ctx, input) => ({ status, verdict, message, report })
})
```

The context gives a task only safe things: `ctx.browser` (already recorded, already behind the proxy), `ctx.visit(url)`
(allowlist, robots.txt and rate limit are applied here, so a task cannot skip them), `ctx.log`, `ctx.warn`,
`ctx.screenshot(name, buffer)`, `ctx.attach(name, content, contentType)` for task files, `ctx.credentials` (opened by the
runner, masked in every recording), `ctx.step(name, fn)`. A task never publishes, uploads or touches the bucket itself.

The runner does everything else, identically for every task: parse the command, check `contract` and `task_version`, validate
`input`, check that the declared hosts are on the operator allowlist (`SPIDER_ALLOWED_HOSTS` stays the control), take the
account lease when the task needs an account, start the recording, run, close the browser, write the files, build and publish
the result, answer a fixed failure result when the task throws after the last attempt.

A test in `tasks/` enforces the conventions for every registered task (valid name, input schema present, verdict codes
labelled, folder registered), so a new task cannot drift from the standard.

### 3. One bucket layout for every task

```
runs/<task>/<brain_user_id>/<yyyy>/<mm>/<dd>/<task_id>/
   manifest.json         // the artifact list, same as the message, so a run can be rebuilt from the bucket alone (written last)
   result.json           // the TaskResult as published
   logs.json             // log + warning lines, redacted
   network.json          // request and response entries, redacted, bodies capped
   video.webm
   screenshots/NN-<name>.png
   files/<name>          // anything the task attached
   session.json          // only for a task that needs an account (see below)
```

Example: `runs/browser-detection/0198f2a4-7c1e-7d3a-9b1e-5c2d8f0a1b34/2026/10/13/0d9f5b6e-0c58-4b4e-9d4b-9b8f5b0f6a11/video.webm`.

**Why this order (decided after looking at the alternatives).**

- `<task>` first: retention, size and cost are per task. `matchesPrefix: runs/<task>/` gives a task its own lifecycle rule later
  (for example a shorter one for `linkedin-login`) without moving a file, and `ls runs/<task>/` answers "what did this task
  produce". Task names are permanent identifiers (a rename is a new task; the registry test pins them).
- `<brain_user_id>` second: a run belongs to one user, so a user's files sit together. It is brain's own `User.id`, not the
  authentik subject or the email, so no personal data is in an object name. Brain authorises by a prefix test (see below) and a
  future per-user purge or export is one prefix per task.
- `<yyyy>/<mm>/<dd>` third, in UTC, taken from the command's `requested_at` and not from the worker's clock. The date is
  therefore the same on every redelivery (even after midnight) and brain can compute it without waiting for the result. Dates
  keep any one listing small and are easy to browse. They do not control retention: the lifecycle rule is by object age.
- `<task_id>` last, a UUID, unique per request and the same id as the session, so the path is derivable from the session row.

Rejected: `runs/<user>/<task>/...` (a per-task lifecycle rule becomes impossible), date first (loses per-task and per-user
scoping and gains nothing, since retention is by age), keeping a timestamp folder under `<task_id>` (two folders per request on
redelivery, and brain could not derive the path before the result).

**Properties this gives.**

- Deterministic: the prefix is a pure function of the request (`runPrefix`), shared in contracts. The spider writes under it;
  brain never trusts a path from a result. It accepts an artifact only if its path is under the prefix it computes from its own
  session row (task, user, requested date, task id) and matches `ARTIFACT_PATH_PATTERN` (letters, digits, `.`, `_`, `-`; only
  the `screenshots/` and `files/` sub folders; no `..`). A buggy or compromised worker cannot point a session at another
  user's files.
- Idempotent: a redelivered command writes the same prefix again, so files are overwritten, not duplicated. `manifest.json`
  is the truth for what the last attempt produced; a file left by an earlier attempt is never linked and expires with the rest.
- Signing: `session.fileUrl` signs only a path stored in an artifact row of a session the caller owns.
- Hot spots: none to worry about at this volume (task, user and date spread the keys).
- Cost of the order: "everything of one user" is one listing per task, not one prefix. Acceptable: there is no per-user purge
  feature today, files expire in 7 days, and the task list comes from the catalog.

One lifecycle rule on `runs/` (7 days, by age) replaces the one on `recordings/`; the old rule stays until the old objects
are gone. Secrets are masked by the existing masking, now applied to every file by the runner, not by each task.

**Session cache and local storage.** The runner (not the task) captures the browser's `storageState` (cookies and the local
storage values of each origin) at the end of a run and saves it twice:

- `session.json` in the run prefix, artifact kind `session` (what the Sessions page opens, by the owner's choice).
- `sessions/<account_id>/state.json`, the account's private state that the next task for that account loads through
  `ctx.session` (replaces today's cookies-only file; same lease, same write, and only a run that passed its own check, through
  `ctx.session.commit()`, replaces it, so a failed or logged-out run never overwrites a good one).

Because `session.json` holds login tokens such as `li_at`, it is the one sensitive file, and the plan treats it as such: it is
saved only for a task that declares `needs.account` (never for browser detection), only when the account's own credentials were
used, and never listed in the message's `report`; brain marks the artifact `sensitive`, the web app shows it behind an explicit
"Show sensitive files" action, only to the signed-in owner of the session, through a 10 minute signed link; it lives under
`runs/` so the 7 day lifecycle deletes it, it is never copied into `network.json` or the logs (masking covers the cookie and
local storage values as for any secret), and the proxy credentials are never in it. `linkedInAccount.reveal` already returns
the same kind of secret to the owner by product choice, so this adds no new audience, only a new place.

### 4. Brain (`apps/brain`): generic, no per-task code

- `TaskQueue` (in `core`, replaces `StandardTaskQueue`): publish `tasks.run`, consume `tasks.done` and `tasks.catalog`
  through the shared `consumeResults` helper.
- `TaskService` (in `database`, replaces `BrowserTestService`): `request({ userId, task, proxyId?, accountId?, input, trigger })`.
  It reads the catalog entry, checks ownership of the proxy and account, `needs`, the cooldown and `one_at_a_time` policy, and
  that `input` is a JSON object under the size limit; it creates the session, resolves proxy and sealed credentials, publishes,
  and ends the session as failed if the publish fails. It never reads or interprets `input` or `verdict`.
- Applying a result: one idempotent update keyed on `task_id` (only `IN_PROGRESS` can finish), saves status, verdict, message,
  report, worker build and the artifact rows. A result for an unknown session is ignored. Artifacts whose path is not under
  the prefix brain computes for that session are dropped and logged, never stored.
- Automatic triggers: the catalog's `policy.automatic` plus one event function (`emit('proxy.active', { proxyId })`) called where
  a proxy tests ok. Adding an automatic task is a manifest line, not brain code.
- Optional domain hook per task (`onResult`), only for a task that must change brain's own data (LinkedIn login updates an
  account's status). Registered by task name in one file; most tasks have none. Hooks also carry the two pieces of domain
  logic that cannot be a manifest line: `onRequest` (before publishing, for example mark the account `PENDING`) and
  `onEvent` (an automatic trigger that depends on brain data, for example "validate the account only if it was waiting for a
  proxy").
- `linkedin-login` on this framework: the hook keeps today's behaviour exactly. `LinkedInAccount.validationId` and
  `validationRequestedAt` stay and are set by `onRequest`; `onResult` does the conditional update (account must still be waiting
  for this very task, never a paused account) and maps the verdict to `ACTIVE`, `NEEDS_REAUTH` or `ERROR`; the 5 minute cooldown,
  the paused-account refusal, "add a proxy" message, `requestIfWaiting`, `verify` and retry-through-another-proxy keep their
  rules, now expressed as manifest policy plus this hook. `retryRefusal` becomes a manifest `retry` field listing the
  verdicts a different proxy can fix.
- API: `task.catalog`, `task.run({ task, proxyId?, accountId?, input })`, `session.list/get` unchanged in shape,
  `session.fileUrl({ id, artifactId })` signs the stored path (a path that passed the prefix check when it was saved). `proxyServer.browserTest` is removed.

### 5. Database (one migration, the last one a new task will ever need)

Additive only, no reset:

- `SpiderSessionKind` gains `TASK` (the existing `BROWSER_TEST` value stays: its migration is already applied to a dev
  database and removing it would be drift).
- `SpiderSession` gains `task String?`, `taskVersion Int?`, `trigger String?`, `verdict String?`, `report Json?`,
  `workerBuild String?`; `requestParams` keeps the non-secret envelope (task, version, input, proxy summary, trigger).
- New table `SpiderSessionArtifact { id, sessionId, kind, name, path, contentType, bytes, step?, sensitive, createdAt }`, unique on
  `(sessionId, path)` so a repeated result cannot duplicate rows.
- New table `TaskDefinition { task, version, manifest Json, seenAt }`, upserted from `tasks.catalog`.

Old rows (`VALIDATE_ACCOUNT`) are not touched and keep their own display until account validation is moved (below).

### 6. Body (`apps/body`): generic, no per-task code

- Sessions: the label and result wording come from the catalog (`title`, `verdicts`), not from a table in `describe.ts`.
- Drawer tabs are built from the artifacts: **Result** (the generic `report`), **Video**, **Screenshots** (gallery),
  **Network** (requests and responses), **Logs** (logs and warnings), **Files**. A tab shows only when the run has that kind.
- "Try again" becomes generic: run the same task and input again, optionally through another proxy.
- Proxies row menu: **Browser test** calls `task.run`. The proxy test history and the rest stay.
- Removed: `DetectionTab`, the `BROWSER_TEST` branches, the `detection.json` whitelist entry.

### 7. Steps (each with its test first)

- [x] T1 Contracts: `TaskCommand`, `TaskResult`, `Artifact`, `TaskCatalogEntry`, topology, schema tests; remove `standardTask*`
  and, with T6, the `validateAccount*` schemas and queues.
- [ ] T2 Spider framework: `defineTask`, `registry`, `context`, `runner` (proxy, recording, secrets, account lease, session
  state), generalized `Recorder` (the `runPrefix` layout, manifest, artifact list, all files through one writer), contract test for registered
  tasks.
- [ ] T3 Move browser detection to `tasks/browserDetection` on the framework; delete `src/detection` wiring and the
  `standardTasks` registry; worker consumes `tasks.run` and publishes the catalog at start.
- [ ] T4 Brain: migration, `TaskQueue`, `TaskService`, catalog consumer, result consumer, artifacts, triggers, hooks, `task`
  router, generic `fileUrl`; remove `BrowserTestService`.
- [ ] T5 Body: catalog-driven labels, artifact tabs, generic retry, proxies action; remove the browser-test specific code.
- [ ] T6 Account validation: move `validation/` to `tasks/linkedinLogin` (verdict codes `VALID`, `INVALID_CREDENTIALS`,
  `SECURITY_CHECK`, `NEEDS_REAUTH`, `ERROR`), the `linkedin-login` hooks in brain, replace the `/accounts` verify, add-account
  and retry flows' calls, remove `AccountValidationQueue`, the old contract, and the legacy-only code paths.
- [ ] T7 Env and docs (`deploy/gcp-setup.md` lifecycle prefix `runs/`), definition of done, real runs in the worker image
  (browser detection against the real pages; linkedin-login against the local stand-in site, as the existing e2e does),
  `MEMORY.md`, outcome.

Later, each its own plan and only a folder plus its tests: `linkedinReadPost`, `linkedinReadProfile`, and the scrape pipeline
as a task.

## Open questions (must be empty before locking)

- None. Locked by the user on 2026-10-13.

## Edge cases and risks

- **Unfinished contract.** A contract that must stay fixed is expensive to get wrong; `input` and `report` are opaque JSON so
  tasks can evolve inside it, and the version field exists from the first message.
- **Brain and worker versions differ during a deploy.** A command for a task the worker does not know, or a newer
  `task_version`, gets a FAILED result with a fixed sentence (never a silent drop); a result for a task missing in the catalog
  still finishes the session using the stored `verdict` code as its label.
- **Catalog freshness.** `tasks.catalog` keeps only the latest message and brain upserts it; if the worker is not up brain
  uses the stored rows. A task absent from the catalog is refused with "This task is not available".
- **Untrusted input.** `input` comes from a user-facing API: size cap (for example 8 KB), JSON object only, no secrets (the
  runner masks anything the task declares as secret), validated again in the spider by the task's own schema, never executed
  or used as a path or selector without that validation.
- **Compliance.** Visiting is only through `ctx.visit`, so allowlist, robots and rate limit cannot be skipped by a task; the
  declared hosts must be on the operator allowlist. Tasks act on the signed-in user's own account and proxies, as before.
  A task that needs another person's data (read a profile, read a post) is a compliance review of its own before it is added.
- **Idempotency and redelivery.** Result handling keyed on `task_id`; artifact rows unique on `(session, path)`; a redelivered
  command writes the same prefix again (overwrite, manifest is the truth) and a result for an already finished session is
  ignored.
- **Message size.** At most 300 artifacts in a result; anything beyond is dropped from the message (`artifacts_truncated`) but
  stays listed in `manifest.json` in the bucket.
- **Secrets.** Credentials travel sealed, are opened only by the runner, and are masked in every file, not per task.
- **Migration and rollback.** The migration is additive; the old enum value and old rows stay. Rollback: stop publishing to
  `tasks.run`, ignore the queues; recordings expire in 7 days and rows in 30. Existing validation and scrape paths keep
  working untouched until their own plans.
- **Lifecycle rule.** `runs/` needs its own 7 day rule; the staging bucket rules are not applied yet, so nothing to undo there.
  A per-task rule can be added later on `runs/<task>/` with no data move.
- **Bucket path hygiene.** Every segment is validated by pattern before use (task name, user id, UUID, digits, artifact name),
  in the contract, in the spider before writing and in brain before storing. The date uses the request time in UTC, so a run
  that crosses midnight stays in one folder.
- **Existing recordings.** Old sessions keep their `recordings/<kind>/<id>/<time>` objects and their legacy display until they
  expire; nothing is moved.
- **Overbuilding.** Only two tasks (browser detection, LinkedIn login) prove the framework; the read-a-post and
  read-a-profile examples are listed, not stubbed. The framework is kept to what those two need.
- **Account validation is live behaviour.** It is the riskiest move: the account status flow, the cooldown, the lease and the
  TOTP login must behave exactly as now. The existing unit, integration and real-browser (stand-in site) tests move with it
  and must pass unchanged in meaning before anything is removed; live LinkedIn is still unverified, as before.
- **Session state.** Moving to `storageState` (cookies and local storage) changes the saved file's shape: a reader accepts the
  old cookies-only file and the new one, and the first valid login rewrites it. A bad or logged-out run never overwrites a
  good state (same rule as today).
- **Local dev database.** Migration `20261013090000_add_browser_test_session_kind` is already applied locally and stays in the
  history.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- `runPrefix` tests: exact output for a known request, UTC date, redelivery gives the same prefix, rejects a task name, user id
  or task id that is not a plain segment; brain drops an artifact outside the computed prefix.
- Contract tests for every schema, a registry test that every folder in `tasks/` is registered and follows the conventions.
- Runner tests with a fake driver and store: input validation, host check, failure result after the last attempt, secrets
  masked in every file, manifest equals the published artifact list.
- Brain integration tests (PostgreSQL): request, policy refusals, idempotent result, artifact rows, catalog upsert.
- A real run of the browser detection task in the worker image against the real pages, then reading the bucket layout and checking it equals `runPrefix`.
- Not verifiable here: signed links against the real bucket and a run through a real proxy.

## Outcome

Filled in when done.
