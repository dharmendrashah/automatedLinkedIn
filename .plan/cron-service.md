# Cron service: a second container for scheduled jobs, with every run recorded

- Status: draft, on hold (2026-10-14: waiting for the owner, who is rethinking the scale and scope) <!-- draft | locked | in progress | done -->
- Created: 2026-10-14
- Locked by user: no <!-- change to "yes, <date>" only after the user confirms -->

## Goal

Move scheduled work out of the API process into its own container of the brain service, and record every run of every job for 30 days: when it was due, when it ran, why it exists, what it asked and what came back, how it ended. The point is that when something stops working, a person can open one page and see which job, since when, what failed and what to do, instead of reading container logs.

## What exists today (checked in code, 2026-10-14)

- One scheduled thing lives inside the API process: `ProxyScoringJob` (`apps/brain/src/database/proxyScoringJob.ts`), started from `server.ts`. It wakes after 60 s and then every hour, scores what is due, and writes a log line only when it did something. It has no record of its runs, so a missed or failing day is invisible, and it dies with every API restart or deploy.
- Other time-based behaviour is not scheduled at all: row cleanups run on write (`ProxyTest` 7 days, `ProxyScore` 30 days, `SpiderSession` 30 days), the daily browser check is triggered by a proxy test event with a 24 hour cooldown, account verification has a 5 minute cooldown.
- Kubernetes already has two infrastructure CronJobs (staging DNS updater, idle shutdown). They are platform plumbing and stay as they are.
- Brain runs as one container: Compose service `brain`, Kubernetes `deploy/brain` (1 replica, `Recreate`, a `migrate` init container, secrets and config from `app-secrets` and `app-config`). The image is built once (`apps/brain/Dockerfile`, `CMD node dist/src/server.js`) and `staging.yml` pins it by commit.
- The Service status page (`serviceStatus/`) checks ten explicit modules and lists every Deployment of the namespace through annotations (`status.automatedlinkedin/title|group|description`), so a new Deployment shows up by itself.
- The staging idle-shutdown checker reads the logs of `brain`, `spider-api` and `spider-worker` and counts non-noise lines as activity; `staging-power.sh` scales a fixed list of workloads.
- `User.role` already has `USER` and `ADMIN` (everyone is `USER` today; nothing sets `ADMIN`).

## Requirements

Confirmed by the user (request of 2026-10-14):

- C1 A separate service for cron jobs, because the app will depend on them heavily.
- C2 It is part of the brain service but runs as two containers: one for the brain API, one for cron.
- C3 Every cron job is saved for up to 30 days in the database: every request and result, the scheduled time, why it runs and what it is for, "and everything".
- C4 The design must make system failure easy to detect and understand.

Proposed (to confirm, see Questions):

- P1 One image, two commands: the same `automatedlinkedin-brain` image, `node dist/src/server.js` for the API and `node dist/src/cron.js` for the cron service. No new image, always the same code and schema in both.
- P2 The API and the cron service talk only through the database (plus RabbitMQ where jobs already use it). No HTTP between them. A manual "run now" is a row the API inserts and the cron service picks up.
- P3 Scheduling is exactly once per slot even if two cron containers overlap (a rolling deploy): each scheduled slot is one row with a unique `(job, scheduledFor)`, and only the container that inserts or claims it runs it.
- P4 `ProxyScoringJob` moves into the cron service as the first job (`proxy-scoring`); the API no longer schedules anything.
- P5 Failure is made visible in four layers: a status per run with a plain-language summary and a classified cause with a hint, an "overdue" state computed from the schedule, a heartbeat for the cron service itself, and a place to see it (a Background jobs page, the Service status page, Kubernetes probes), all for the admin only.

## Design

### Shape

```
            +--------------+     writes CronRun(QUEUED, MANUAL)      +----------------+
 browser -> | brain (API)  | --------------------------------------> |  Postgres       |
            | tRPC, status |  reads jobs, runs, steps, heartbeat     |  CronJob        |
            +--------------+ <-------------------------------------- |  CronRun        |
                                                                      |  CronRunStep    |
            +--------------+  claims slots, runs jobs, writes steps   |  CronInstance   |
            | brain-cron   | <--------------------------------------> |                 |
            | scheduler    |                                          +----------------+
            | + /health    |  RabbitMQ (as today) for spider tasks
            +--------------+
```

### Code layout (one package, `apps/brain`)

- `src/cron.ts`: the entry (`dotenv/config`, `./aliases`, then everything else, like `server.ts`).
- `src/cron/` (new top-level folder, so it must be added to `importOrder` in `.prettierrc` after `^(.*)aliases$`): `scheduler.ts` (the loop), `runner.ts` (claim, run, time out, record), `registry.ts` (one line per job), `jobs/<name>.ts` (one folder or file per job), `context.ts` (what a job can call: `step`, `record`, signal), `health.ts` (the small HTTP health server), `errors.ts` (`JobError` with a kind and a hint).
- `src/database/cron*.service.ts`: the data access both containers use (`CronRunService`, `CronJobService`), and the API-side read and control services. `apps/body` never imports `cron/`, only the tRPC router chain through `database/`, so no new path mapping is needed there.
- One new dependency: `croner` (cron expressions, UTC and time zones, next-run maths, no dependencies) so schedules like "every day at 02:00 UTC" are written as a string and the next time is computed, not hand-rolled.

### A job is a definition, not just a function

```ts
defineJob({
   name: 'proxy-scoring',
   title: 'Score every proxy',
   purpose: 'Checks each proxy once a day (speed and AbuseIPDB reputation) so the best one is used for each account.',
   why: 'A proxy that was fine yesterday can be blacklisted today; waking hourly makes a missed day get made up.',
   schedule: '0 * * * *',           // UTC
   timeoutMs: 15 * 60_000,
   catchUp: 'latest',                // after downtime run once, record the others as missed
   overlap: 'skip',                  // a slot while the previous run is still going is recorded as skipped
   run: async ctx => { ... return { summary: 'Scored 5 proxies, 0 failed', result: { scored: 5, failed: 0 } } },
})
```

`purpose` and `why` are plain sentences written for a person; they are stored with the job and shown next to it, so "what is this and why is it running" is always answered by the system itself.

### What is stored (all kept 30 days, except `CronJob` and `CronInstance` which are small and current)

- `CronJob` (one row per job, written from the code at every boot): `name` (unique), `title`, `purpose`, `why`, `schedule`, `timeoutMs`, `catchUp`, `overlap`, `enabled` (an operator can pause), `pausedByUserId`, `pausedAt`, `pauseReason` (optional), `definedAtVersion` (git SHA), `updatedAt`.
- `CronRun` (one row per scheduled slot or manual request): `id`, `jobName`, `scheduledFor` (unique with `jobName`), `trigger` (`SCHEDULE`, `CATCH_UP`, `MANUAL`, `MESSAGE`), `status`, `queuedAt`, `startedAt`, `finishedAt`, `durationMs`, `summary` (one sentence), `result` (small JSON of counts), `failureKind` and `failureMessage` and `hint` when it failed, `instanceId`, `gitSha`, `heartbeatAt` (a running job proves it is alive), `skippedReason`, `requestedByUserId` for a manual run, `subjectUserId` when the run is about one user's data.
  - Status values: `QUEUED`, `RUNNING`, `SUCCEEDED`, `NOTHING_TO_DO` (ran, found no work: kept so an idle hour is distinguishable from a missing hour), `FAILED`, `TIMED_OUT`, `ABANDONED` (the container stopped while it ran), `SKIPPED` (previous run still going, or the job is paused), `MISSED` (the service was not running at that time; written when it comes back).
- `CronRunStep` (every request and result inside a run): `runId`, `seq`, `at`, `kind` (`LOG`, `REQUEST`, `DATABASE`, `QUEUE`), `name` (for example `AbuseIPDB check`), `level`, `message`, `request` (JSON, secrets masked by name as in `IpInfoService`), `response` (JSON, cut at 64 KB), `durationMs`, `ok`. A job records a step through `ctx.step(...)`; the clients it already uses (`IpInfoService`, `AbuseIpDbService`) report their request and response through the context, so a run shows each proxy test and each reputation lookup it made, with timings. A cap (for example 500 steps per run, then a single "N more steps not kept") keeps one bad run from filling the table.
- `CronInstance` (one row per container start): `id` (pod or host name plus start time), `startedAt`, `lastBeatAt` (every 15 s), `stoppedAt`, `stopReason` (`SIGTERM`, or `NOT_CLEAN` written by the next instance that finds it stale), `gitSha`. This is how "is the cron service alive, since when, and did the last one die badly" is answered.
- Traceability: nullable `cronRunId` on `ProxyTest` and `ProxyScore`, so a test or a score in the existing history says which run produced it.
- Retention: a built-in job `cron-retention` (daily, UTC) deletes runs and steps older than 30 days (`CRON_RETENTION_DAYS`, default 30) and finished instances older than that. It is itself recorded like any other job.
- No secrets are stored: request headers are masked by name, proxy credentials are never part of a request record, report comments are not kept (as decided in `.plan/proxy-reputation-details.md`).

### How a run goes (the cron container)

1. At boot: wait until the schema exists (it retries with a back-off, because the API's init container applies migrations), upsert `CronJob` rows from the registry, register a `CronInstance`, mark any instance whose heartbeat is stale as `NOT_CLEAN`, mark `RUNNING` runs of dead instances `ABANDONED`.
2. Every few seconds the scheduler looks at the enabled jobs, computes the due slots, and inserts `CronRun(QUEUED)` rows (`ON CONFLICT DO NOTHING` on `(jobName, scheduledFor)`). Slots missed while it was down become `MISSED` rows with the reason ("cron service was not running from 02:10 to 04:40"), and one `CATCH_UP` run is queued when the job's policy asks for it.
3. It claims one `QUEUED` run at a time with a conditional update (`status = QUEUED`) to `RUNNING`, sets `startedAt` and `instanceId`, and runs the job with an abort signal and a timeout. The run heartbeat is written while it runs.
4. On the end it writes status, summary, result, duration, and for a failure the classified cause (`failureKind`: `DEPENDENCY_DOWN`, `RATE_LIMITED`, `TIMEOUT`, `CONFIG`, `BUG`, `CRASHED`) with a short `hint`. Unknown errors become `BUG` with a trimmed message (no stack with paths to secrets; the stack stays in the container log, correlated by the run id).
5. A manual run is a `QUEUED` row with `trigger = MANUAL` that the API inserts; the same loop picks it up.
6. On SIGTERM it stops claiming, lets a running job finish within the grace period, and writes `stoppedAt`.

### How a failure is found and understood

| What goes wrong | How the system notices | What a person sees | What to do (the hint) |
| --- | --- | --- | --- |
| A job throws | `FAILED` run with `failureKind` | Red run, summary "Could not reach AbuseIPDB", failing since the last good run, N in a row | The hint of that kind ("AbuseIPDB did not answer; it retries next hour") |
| A job hangs | timeout, `TIMED_OUT` | Run ended after 15 min, last step shown | Open the run; the last step is where it stopped |
| A dependency is down (database, RabbitMQ, an API) | step marked failed, kind `DEPENDENCY_DOWN` | The failing step with its request and answer | Fix the dependency; next slot retries |
| Rate limit or key problem | kind `RATE_LIMITED` or `CONFIG` | "AbuseIPDB key rejected", with when it resumes | Check the key or wait |
| The cron container is down or crash looping | heartbeat stale; Kubernetes probe fails | Banner "Cron service not responding since 14:02", every job Late | Check the deployment; status page shows the workload |
| The container died mid run | next instance marks `ABANDONED`, previous instance `NOT_CLEAN` | Run "abandoned: the service stopped while it ran" | Usually a deploy or a node replacement; look at instance history |
| A slot never ran | `MISSED` rows, and "overdue" computed from the schedule while it is happening | Job is Late (expected 14:00, now 15:30), history has a gap with the reason | See the service banner |
| The job is paused | `enabled = false` | Paused badge with who and when | Resume |
| Overlap | `SKIPPED` with the reason | Grey run "previous run still going" | A job that runs longer than its schedule needs a look |
| Nothing was due | `NOTHING_TO_DO` | Green-grey, not a gap | Nothing |
| The API cannot reach the database | the existing `/health` and status page | unchanged | unchanged |

Each job gets one overall health computed the same way everywhere (one pure function, tested): `HEALTHY` (last run good, not late), `RUNNING`, `LATE`, `FAILING` (the last run failed, with a streak count), `PAUSED`, `UNKNOWN` (never ran).

### Where it is shown

- **Background jobs page `/jobs`** (full width like every page): a banner for the cron service (Running since, last heartbeat, version; or Not responding since), then one card per job with the plain `purpose` and `why`, the schedule in words ("every hour, on the hour, UTC"), the next run, the health badge, the last result sentence, and a 30 day strip of one dot per run (green, grey for nothing to do, red failed, amber late or skipped). A drawer per run shows: scheduled, started, finished, how long, trigger, which instance and version, the summary, the result, the failure with its hint, and the step timeline with each request and answer. Actions, suggested not forced: Run now (disabled while one is running or queued), Pause or Resume.
- **Service status page**: one new explicit module "Background jobs" (Live when the heartbeat is fresh and no job is late, Dead when the service has not answered, Unknown otherwise), and the new Deployment appears in the Kubernetes discovery by its annotations.
- **Logs**: one structured line when a run starts and when it ends, with the run id, job and status (`cron run=<id> job=proxy-scoring status=FAILED kind=RATE_LIMITED`), nothing when idle, so `kubectl logs` and the page tell the same story.
- **Kubernetes**: liveness and readiness on the cron container's own tiny health port (the scheduler tick is fresh and the database answers), so a stuck loop is restarted and a crash loop is visible.

### Listeners (the RabbitMQ consumers that move in)

`TaskQueue.consumeResults` and `consumeCatalog` (today started from `server.ts`) start from `cron.ts`. They are not scheduled, so they are registered as listeners next to the jobs and shown on the same page:

- Each has a name, `purpose` and `why` like a job ("Applies the spider's answers to accounts, proxies and sessions: without it an account check stays Pending").
- Health: connected to the broker, last message handled at, queue depth (messages waiting, from the broker), failures in a row. A growing queue with no recent handling is the clearest sign that the background service is stuck.
- Each handled message is recorded as a lightweight `CronRun` (`trigger = MESSAGE`, `scheduledFor` = the time it arrived) with a one-sentence summary ("Login check for an account: VALID"), the outcome and a step for the database writes, tagged with `subjectUserId`, so a failure to apply a result is as findable as a failed job. A message that fails is handled as today (bounded retries, then dead letter); the run row says which.
- Because the API no longer consumes results, results wait in the queue while the cron container is down (an account check stays Pending, a task stays In progress). That is exactly what the banner says in that case; the queues are durable, nothing is lost.
- The API keeps publishing tasks (`TaskQueue` publish side) and everything request driven; only the consumption moves.

### Who can see it (as decided)

Only the admin (D3, D5, D7, D8, D9). Everyone else gets nothing about the cron jobs, on any screen or call. The admin sees the page, the status module and the discovered workload; `ADMIN_EMAIL` is therefore needed for the feature to be visible at all.

### Packaging and deployment

- Dockerfile: unchanged; the second container only overrides the command.
- `docker-compose.yml`: a `brain-cron` service from the same build, `command: ["node", "dist/src/cron.js"]`, depends on healthy `postgres` and `rabbitmq`, same environment as `brain` (it needs the database, RabbitMQ, the credential encryption key to open proxy passwords, the ipinfo token and the AbuseIPDB key).
- `deploy/base/brain-cron.deployment.yaml` (+ a ClusterIP Service on the health port for the status check), 1 replica, `Recreate`, `terminationGracePeriodSeconds` 60, requests small (about 50m CPU and 192Mi), same `app-config` and `app-secrets`, the discovery annotations (title "Background jobs", group, description, and `status.automatedlinkedin/audience: admin` so only the admin gets the card). No `migrate` init container: the API keeps that job, and the cron container waits for the schema.
- `staging.yml`: the existing image pin already covers an image named `automatedlinkedin-brain`; add `deploy/brain-cron` to the rollout waits. `staging-power.sh`: add `deploy/brain-cron` to the scale list. The idle-shutdown checker watches `brain`; the proxy scoring lines leave `brain` with this change, so it no longer counts hourly scoring as activity; `brain-cron` is deliberately not an activity source.
- Env: `CRON_HEALTH_PORT` (3004), `CRON_RETENTION_DAYS` (30), `STATUS_URL_CRON` (default `http://brain-cron:3004/health`, empty leaves the module out), `ADMIN_EMAIL` (one verified address; it is a plain, non-secret value, so it goes in the staging config, not the secrets; without it nobody can see the cron jobs, and nothing else breaks). None is required to boot, so nothing has to be set before merging.

## Decisions (owner's answers, 2026-10-14)

- D1 One image, two commands (P1).
- D2 The RabbitMQ consumers that apply spider results move into the cron container too, so it is the brain's background service: scheduled jobs and listeners. See "Listeners" below.
- D3 Only the admin can open the Background jobs page and see the runs (changed from "every signed-in user" on 2026-10-14). Nobody else sees anything related to the cron jobs.
- D4 The on-write cleanups move into a scheduled `data-retention` job now, together with the cron service's own 30 day cleanup.
- D5 Only the admin can Run now, Pause and Resume a job.
- D6 Schedules use the `croner` library.
- Alerts stay out of scope (the failure streak and late state are stored for them).
- D10 When the background service is down, an ordinary user's account checks and task results stay Pending or In progress exactly as they do today. No new message, no new wording, nothing for users about it (decided 2026-10-14; this closes the former Q13).
- D11 The cron service is for application-specific work only (the brain's own jobs and the listeners that apply its results). Platform and DevOps services stay outside it: the DNS updater keeps running exactly as it runs now (a Kubernetes CronJob, untouched), and no infrastructure task is added to the cron container.

## Visibility and controls (owner's final answer, 2026-10-14)

All of it is for the single admin and nobody else. "Nothing related to the cron jobs" means every screen and every API call, not only the page:

- D7 The admin sees everything in the run details, including steps about any user's proxies and accounts (requests, answers, addresses, countries). Secrets stay out: request headers are masked by name, proxy credentials and report comments are never recorded, and the credential encryption key never enters a step.
- D8 The admin can Run now, Pause and Resume jobs. The run records who ran or paused it and when (optional free-text reason), because "who stopped this and when" is the first question when jobs are not running.
- D9 No other user sees anything related to the cron jobs:
  - the `cron` API router is behind `adminProcedure`: a non-admin gets `FORBIDDEN`, and no list ever contains a cron item for them;
  - no sidebar entry and no `/jobs` route for a non-admin (the route answers like a page that does not exist);
  - the Service status page does not show the "Background jobs" module to a non-admin, and the discovered `brain-cron` workload carries `status.automatedlinkedin/audience: admin`, which the status service uses to leave it out of what a non-admin receives (a small filter in `serviceStatus/`, tested both ways);
  - the data is not exposed through any other route (sessions, tasks, proxies keep returning only what they return today; `cronRunId` on a proxy test or score is an opaque id that links nowhere for a non-admin).

The listeners (result and catalog consumers) are not scheduled jobs and are not offered a Pause, even to the admin: pausing them would stop every account check, and there is nothing to "run now". A job that is paused and was due shows as `SKIPPED (paused by <name> at <time>)` and the card says so, so it can never be mistaken for a failure of the service.

With one admin looking, the earlier idea of a setting that hides other users' steps is not needed and is dropped (`CRON_STEP_VISIBILITY` and the privacy worry go away); `subjectUserId` stays on runs and steps only so the admin can filter by user.

Risks of these choices, written down on purpose: nobody but the admin knows when the background service is down, yet the users' account checks and tasks depend on it (the listeners), so they would see a check that stays Pending with no explanation. This is accepted (D10): users see what they see today.

## DNS updater: untouched and not part of the platform (decided 2026-10-14)

### What the owner decided

- E1 The DNS updater stays a separate service exactly as it is now. No change to it at all.
- E2 It is a fundamental DevOps service with no relation to the application or the backend, so nothing about it is shown anywhere in the platform: not to users, not to the admin.
- E3 There is exactly one admin user.

This replaces the first wording ("shown only to the admin"): the owner's final answer is that the admin does not see it either.

### What the DNS updater is today (checked in `deploy/overlays/staging/dns/`)

A Python script (`update_dns.py`, with tests) run by a Kubernetes CronJob `staging-dns-updater` every 5 minutes on staging only. It reads its own node's external IP from the Kubernetes API (ServiceAccount `dns-updater`, read-only on `nodes`), and makes the Cloudflare A record match it (secret `cloudflare-dns`). `staging-power.sh wake` starts one run by hand (`create job --from=cronjob/...`). It has no record of its runs: its only history is Kubernetes keeping 1 good and 3 failed Jobs.

Why it must stay separate from the cron container (not just a preference): it holds the Cloudflare token and a node-read permission; the cron container holds the database, the credential encryption key and the proxy secrets. Keeping them in different pods means a bug or leak in one does not reach the other's secrets. It also has to keep working when the cron container, the API or the database are down, because it is what makes the site reachable after a node is replaced.

### What this means for the plan

- The DNS updater is not a job of the cron container, is not registered in the job registry, is not recorded in `CronRun`, and gets no report endpoint, token, audience flag, status card, RBAC change or annotation. Its manifests, script, tests, secret, ServiceAccount and the `staging-power.sh wake` call stay byte for byte as they are.
- It does not appear on the Background jobs page or the Service status page today and will not: the status page's Kubernetes discovery lists only Deployments and StatefulSets, so a CronJob is never shown; this plan does not add CronJobs to it, and a test pins that.
- The new `brain-cron` Deployment is a brain workload and shows up like the others; nothing in the cron work reads from or writes to `deploy/overlays/staging/dns/`.
- Its own failures stay where they are handled today (Kubernetes Job history, the wake script's retries). That is the owner's choice for a core platform service that must not depend on the application.

### The single admin

`User.role` already has `USER` and `ADMIN`; nothing sets it. Decided: a new optional env `ADMIN_EMAIL` (one address). When a user is provisioned or signs in with a verified email (`email_verified` true) equal to it (case-insensitive), that user becomes `ADMIN`; everyone else stays `USER`. Exactly one admin is enforced twice: in code (making a new admin first demotes the old one, in one transaction) and in the database (a partial unique index on `role` where `role = 'ADMIN'`, added by an additive migration, so a second admin cannot exist even by mistake). An unverified address never becomes admin (sign-up squatting). Changing `ADMIN_EMAIL` moves the role at the next sign-in of the new address. `me` returns `isAdmin`, and an `adminProcedure` exists for admin calls.

What the admin can do in this change: everything about the cron jobs (see, run, pause). The admin has no DNS view, by the owner's decision. Nobody else has any view of the cron jobs, so `ADMIN_EMAIL` is what turns the feature on.

## Scope and non-goals

- In scope: the cron entry and scheduler, job definitions, run recording with steps, instance heartbeat, health port, the listeners (result and catalog consumers) moved in and recorded, the `proxy-scoring` and `data-retention` jobs (the on-write cleanups of proxy tests, proxy scores and sessions, plus the cron history's own 30 days), the read and control API, the `/jobs` page, the status module, the single admin (`ADMIN_EMAIL`, one-admin rule, `isAdmin`), Compose and Kubernetes manifests, CI and power-script updates, env, tests, `MEMORY.md`.
- Out of scope: alerting, moving other behaviour into jobs (follow-ups per job), changing the two Kubernetes infrastructure CronJobs, multiple cron replicas (the claim logic makes it safe, but one replica is what runs), a job queue for arbitrary user requests.

## Approach (once locked)

- [ ] 1. Tests first for the pure parts: job health (`HEALTHY`, `RUNNING`, `LATE`, `FAILING`, `PAUSED`, `UNKNOWN`), due-slot and missed-slot computation, failure classification, schedule to words, secret masking and the step cap.
- [ ] 2. Migration `add_cron_service` (additive): `CronJob`, `CronRun`, `CronRunStep`, `CronInstance`, nullable `cronRunId` on `ProxyTest` and `ProxyScore`; indexes `(jobName, scheduledFor)` unique, `(jobName, startedAt)`, `(status)`, `(runId, seq)`.
- [ ] 3. `database/cron*.service.ts`: claim, record, finish, steps, heartbeat, retention; unit tests with mocked Prisma and an integration test against Postgres for the claim (two claimers, one wins) and the slot uniqueness.
- [ ] 4. `cron/`: `defineJob`, context, runner (timeout, abort, abandon), scheduler loop, health server, graceful stop; `cron.ts` entry; add `cron` to `.prettierrc` `importOrder`; `croner` dependency.
- [ ] 5. Move the proxy scoring into `jobs/proxyScoring.ts` (the due logic stays in `ProxyScoringService`), report its tests and retests as steps, tag `cronRunId` and `subjectUserId`; remove `ProxyScoringJob` and its start from `server.ts`. Add `jobs/dataRetention.ts` (one run, one step per table: proxy tests 7 days, proxy scores 30 days, sessions 30 days, cron history 30 days, each with the rows removed) and remove the deletes done on write in `saveTest`, `saveHistory` and the session service (reads already filter by date, so nothing depends on the job to be correct).
- [ ] 5b. Move `consumeResults` and `consumeCatalog` into `cron/listeners/`, start them from `cron.ts`, stop them first on SIGTERM, record each handled message as a run, expose their health (connected, last message, queue depth); remove them from `server.ts`.
- [ ] 6. API: `cron` tRPC router (`overview`, `runs`, `run` with its steps, `runNow`, `setEnabled`) behind `adminProcedure`; records who ran or paused and when; non-admin calls get `FORBIDDEN` and a test covers every procedure; no pause for listeners; tests.
- [ ] 7. Status: `Background jobs` module and `STATUS_URL_CRON` for the admin only; the `audience: admin` annotation filter in the status discovery (a non-admin never receives the module or the `brain-cron` workload); tests both ways.
- [ ] 8. Body `/jobs` page for the admin: banner, job cards, listeners, 30 day strip, run drawer with steps, Run now and Pause (optional reason, shows who paused and when); sidebar entry and route only when `isAdmin`, the route behaves like a missing page for everyone else; full width; theme tokens; tests for the helpers.
- [ ] 9. Deploy: Compose service, `brain-cron` Deployment and Service, kustomization, rollout wait in `staging.yml`, `staging-power.sh`, deploy docs; render with `kubectl kustomize` for local and staging.
- [ ] 9b. Single admin: `ADMIN_EMAIL`, the one-admin rule in code and the unique partial index (migration `add_single_admin_index`), `adminProcedure`, `isAdmin` in `me`, tests (verified email only, case-insensitive, demote-then-promote in one transaction, a second admin refused by the index). A test pins that the status discovery never lists CronJobs. No change to `deploy/overlays/staging/dns/`, `deploy/cluster/` or `staging-power.sh`'s DNS call.
- [ ] 10. Verify: lint, type check, unit and integration tests, build, `docker compose up` with both containers (kill the cron container and watch the banner and the late state; restart it and watch the missed rows), `MEMORY.md`, plan to done.

## Edge cases and risks

- Two cron containers at once (rolling update, or a restart before the old one exited): the unique `(jobName, scheduledFor)` and the conditional claim make a slot run once; a run owned by a dead instance is marked abandoned, not run twice. `Recreate` keeps it to one in practice.
- Clock differences: slots are computed and compared in UTC from the database clock where it matters (`now()` in the claim), not from container clocks alone.
- A job that takes longer than its schedule: `overlap: skip` records the skipped slot, so the problem is visible.
- Long downtime (staging is switched off by the smart shutdown, Spot node replacement): on return, `MISSED` rows are capped (for example 50 per job), and only the latest slot is caught up. Staging being off for hours therefore looks like a gap with a reason, not like failures. The status banner says the service was not running, not that jobs failed.
- The cron container cannot start before the schema exists: it waits and retries (readiness stays false), instead of crash looping.
- Data volume: about 24 runs a day per hourly job, a few hundred steps for a busy scoring run, 30 days: small. Steps and responses are capped; a job that records a huge body cannot fill the table.
- Secrets and personal data: masking by name, no proxy credentials, no report comments; only the admin sees the run details (any user's proxy addresses and countries), by the owner's decision.
- Moving the consumers makes the cron container part of the critical path of every account check and task result. A crash loop there blocks results (not requests); the banner, the queue depth and the Kubernetes probe make that visible, the queues are durable, and `Recreate` keeps the gap to seconds. If this proves too risky, the consumers can move back to the API with no data change.
- One admin, one point of failure for visibility: if the admin is not signed in (or `ADMIN_EMAIL` is wrong), nobody sees that jobs are failing. The container log lines, the Kubernetes probe and the pod status still exist; alerting is the planned follow-up, and it matters more now that only one person can see the page.
- Removing the deletes on write means old rows stay until the retention job runs (daily); reads already filter by date, so what a person sees does not change, and a failed retention run shows up like any other failure.
- Failure of the recorder itself (database down while a run ends): the run is left `RUNNING` with an old heartbeat and is marked `ABANDONED` by the next instance; the container log still has the line.
- Resource use on staging: one more small pod on a node that is already tight; requests are kept low, and it is one image already cached on the node.
- Admin edge cases: the admin never signs in or has no verified email (no admin exists, nobody sees the cron jobs, nothing breaks); `ADMIN_EMAIL` set to an address of an existing unlinked row (the same `CONFLICT` rules as sign-up apply, the role is only given to a user already linked by `authentikId`); two sign-ins racing to be promoted (the unique partial index decides, the loser stays `USER`).
- The DNS updater is not touched by this plan, so none of its risks change; the only shared surface is the staging node, whose capacity the new `brain-cron` pod uses a little of.
- Behaviour change: scoring no longer runs when only the API container is up (for example a local `pnpm dev` of brain alone). `pnpm dev` needs a second command (`pnpm --filter @automatedLinkedIn/brain dev:cron`) or `dev:all`; documented in `MEMORY.md` and the README.
- Existing `ProxyScoringService.runDue` keeps its own claim on `scoredAt`; the job wrapper does not replace it, it records around it.
- Migration is additive; rollback is deploying the previous image (the API would score again if the old `server.ts` is restored; the cron container is then removed from the manifests).

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, and brain integration tests for the claim logic.
- `kubectl kustomize --load-restrictor LoadRestrictionsNone deploy/overlays/staging` and `.../local` render the new Deployment, Service and annotations.
- Local Compose with both containers: a scheduled run appears with steps; "Run now" works; stopping `brain-cron` turns the banner and the status module red and the next start shows `MISSED` and `ABANDONED` rows with reasons; a second `brain-cron` started by hand never duplicates a slot.

## Outcome

Filled in when done.
