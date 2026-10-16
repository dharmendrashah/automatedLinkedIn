# Brain worker: one framework for everything brain does in the background

- Status: done
- Created: 2026-10-16
- Locked by user: yes, 2026-10-16

Relation to older plans: `.plan/cron-service.md` and `.plan/scheduler-architecture.md` are on hold. This plan builds the part of them that is needed now (a second brain container, listeners, simple jobs) and leaves their run-history table, admin page and user-owned schedules out. It does not edit them.

## Goal

Brain puts tasks on RabbitMQ, the spider worker runs them, and a separate **brain worker** process applies the answers and does the other background work, so the API process only serves requests. The worker is a small framework: a new kind of task, queue or scheduled job is added by writing one definition and one registry line, never by editing the framework.

## What exists today (checked in code, 2026-10-16)

Background work sits inside the API process, wired by hand in `apps/brain/src/server.ts`:

- `TaskQueue.consumeResults` and `consumeCatalog` (`core/taskQueue.ts`) on top of `consumeResults` (`core/resultConsumer.ts`).
- `TaskService.applyResult` and `applyCatalog` (`database/task.service.ts`), and the per-task `TASK_HOOKS` (`database/taskHooks.ts`, one task so far: `linkedin-login`).
- `ProxyScoringJob` (`database/proxyScoringJob.ts`), started with `setTimeout` and `setInterval`.
- `TakeoverRelay.consume()` (`core/takeoverRelay.ts`), a consumer that holds pictures in the API's memory for the tRPC calls.
- The task request side (`TaskService.request`, `emit`, `TaskQueue.publish`) runs inside tRPC calls.

Weaknesses found while reading the code, which the framework must fix and not carry over:

1. **A result can be lost half applied.** `applyResult` first finishes the session in one transaction, then runs `onResult`. If the hook throws, the message is requeued once, and on the second delivery `finishTask` finds the session already finished and returns null, so the hook never runs again. The account stays `PENDING` with a `validationId` that nothing clears.
2. **A failed message is lost.** `tasks.done` has no dead-letter queue. After one requeue the message is dropped with a log line. A contract mismatch during a mixed-version rollout is dropped the same way.
3. **The retry is the one the notes warn about.** `nack(requeue=true)` on RabbitMQ 4 quorum queues redelivers at once (see `MEMORY.md`). Spider already retries with a copy, an `x-retries` header and a back-off (`apps/spider/src/messaging/consumer.ts`); brain does not.
4. **Every new consumer or job is wired by hand** in `server.ts` and its shutdown block, and none reports its health.
5. **`TakeoverRelay.held` is never pruned**: entries leave only through `release`, which `server.ts` calls on a result. Once the result handler leaves the API, entries would pile up.

## Requirements

Confirmed (request of 2026-10-16):

- R1 Brain puts tasks on RabbitMQ; the spider worker works on them; when they are done a brain worker processes the data on behalf of brain.
- R2 All worker-related functionality moves into this worker service.
- R3 The architecture must be scalable and configured with SOLID principles.
- R4 A new task to process must not need major code changes.
- R5 Plan first.

Confirmed (answers of 2026-10-16):

- P1 The brain worker is a second entry point of `apps/brain`, built into the same image and run as its own container (`node dist/src/worker/main.js`). It is not a new package.
- P2 The API keeps publishing tasks (`TaskService.request`), because a person waits for the refusal or the id. The outbox (step 4) is out of scope for this change and is a later plan.
- P3 The takeover pictures stay in the API (see "What moves").
- P4 The worker shows on the Service status page for everyone signed in, like the other modules.
- P5 Dead-letter queues and a replay command are in scope.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: the framework (consumer runner, job runner, registries, config, health, graceful shutdown), moving the task-result consumer, the catalog consumer and proxy scoring into it, fixing weaknesses 1 to 5, dead-letter queues with a replay command, packaging (compose, Kubernetes base, staging scripts, CI rollout wait, Service status module).
- Out of scope: the outbox for publishing tasks, the cron run-history table and admin page, user-owned schedules, a workflow engine, a second image, moving takeover pictures, changing the task contract or the spider, new task kinds.

## Design

### Dependency rule (what keeps it SOLID)

```
trpc, middlewares  ->  database, core
worker             ->  database, core, contracts
database, core     -/-> worker, trpc, middlewares
```

- `database/` stays the home of data access, used by both processes. `worker/` holds triggers and orchestration only: when something runs, how it is retried, how it is reported.
- A lint rule (`no-restricted-imports`, brain's ESLint config) forbids importing `worker` from anywhere else, so the router chain that `apps/body` compiles never reaches it and `apps/body/tsconfig.app.json` needs no new mapping.

### Layout (`apps/brain/src/worker/`, a new top-level folder)

```
worker/
  main.ts                 entry: dotenv, ../aliases, then everything else (like server.ts)
  runtime.ts              WorkerRuntime: reads config, starts what the roles select, health, shutdown
  config.ts               WorkerConfig built once from env (static class like Environment)
  consumers/
    defineConsumer.ts     the authoring API and its types
    consumerRunner.ts     connect, reconnect, parse, retry, dead-letter, state
    registry.ts           the list of consumers, one line each
    taskResults.ts        tasks.done -> finish the session, run the task's hook
    taskCatalog.ts        tasks.catalog -> store the catalog
  jobs/
    defineJob.ts
    jobRunner.ts          timers, overlap guard, timeout, error isolation, state
    registry.ts
    proxyScoring.ts       the existing ProxyScoringJob logic, as the first job
  health/
    workerHealth.ts       state collected from the runners, small HTTP server
    replay.ts             moves messages from a dead queue back (Q5)
```

The new folder is added to `importOrder` in `.prettierrc` after `^serviceStatus(.*)`. The entry is `worker/main.ts` and not `src/worker.ts`, so the bare import `worker` has no file to collide with.

### The four extension points (what a future change costs)

| You want | You write | Framework changes |
| --- | --- | --- |
| A new spider task that only needs a record shown | Nothing in brain; the spider folder and its one registry line | None |
| A new task that must change brain data when it finishes | One hook file in `database/` and one entry in `TASK_HOOKS` | None |
| A new queue to consume | A zod schema and topology in `packages/contracts`, one `defineConsumer` file, one line in `consumers/registry.ts` | None |
| A new scheduled job | One `defineJob` file and one line in `jobs/registry.ts` | None |
| Different retry, timeout, prefetch or interval | A field on that definition | None |

### Consumers

```ts
defineConsumer<T>({
   name: 'task-results',
   queue: TASK_DONE_QUEUE,
   topology: assertAccountTopology,
   parse: content => taskResultSchema.parse(JSON.parse(content)),
   label: result => `${result.task} ${result.task_id}`, // never a secret
   handle: async (result, context) => { ... },          // must be idempotent
   prefetch: 10,
   retry: { max: 3, backoffMs: [5_000, 30_000, 120_000] },
})
```

`ConsumerRunner` (one implementation, used for every consumer) does the rest:

- Connects through `MessageBroker`, reconnects with the existing 5 s timer, never throws, so brain can start before RabbitMQ (kept from `resultConsumer.ts`).
- `parse` throws: the message goes to `<queue>.dead` with the reason in a header and is acknowledged. It is never logged with its content.
- `handle` throws: after the back-off it publishes a copy with `x-retries` and acknowledges the original (spider's rule; no nack-requeue). A crash in between redelivers the original, which is why handlers are idempotent.
- Retries exhausted: the copy goes to `<queue>.dead` and the original is acknowledged.
- The dead queues are new durable queues declared by the runner, so no existing queue changes its arguments (RabbitMQ refuses a redeclaration with different arguments, which would break a rolling deploy).
- Keeps per-consumer state (connected, last handled, handled, failed, failure streak) for health, and writes one structured line per outcome.
- `stop()` cancels the consumer and waits for messages in flight, up to the shutdown grace.

### Task results (the part that makes new tasks cheap and fixes weakness 1)

- `taskResults.handle` calls `SpiderSessionService.finishTask(result, after)`. `after(session, tx)` runs **inside the same transaction** that finishes the session and saves its artifacts, and calls `TASK_HOOKS[result.task]?.onResult?.(session, result, tx)`.
- If the hook throws, the transaction rolls back, the session is still `IN_PROGRESS`, and the retry applies the whole result again. The hook can no longer be lost.
- Rule for hooks, written next to the type: `onResult` changes brain's own data through the `tx` it is given, is quick (Prisma's interactive transaction limit applies), and does no network call. Anything that needs the network is a later step of an outbox, not a hook.
- `onRequest` stays where it is (`database/linkedInLogin.hooks.ts`): it must refuse a request while the person waits, so it runs in the API. A task's two hooks stay in one file and one registry entry; each process runs the half it needs.
- A task with no hook needs no brain code at all; `finishTask` alone shows the run on the Sessions page.

### Jobs

```ts
defineJob({
   name: 'proxy-scoring',
   everyMs: 60 * 60 * 1000,
   startAfterMs: 60_000,
   timeoutMs: 15 * 60 * 1000,
   run: async context => ({ summary: `${scored} scored, ${failed} failed` }), // or undefined when nothing was due
})
```

`JobRunner` owns the timers (unref'd), skips a tick while the job still runs, aborts through `context.signal` at the timeout, catches every error so one job never takes the process down, and keeps state for health. It writes a log line only when the job reports a summary or fails, because the staging idle-shutdown checker counts non-noise lines as activity (see `MEMORY.md`, proxy scoring). `ProxyScoringJob.runDue` keeps its logic and its per-proxy `claim`; only its timers go. The cron expression library (`croner`) is not added: an interval is enough until a job needs a calendar.

### Configuration

Environment (validated in `env.ts`, all optional, so nothing has to be set before merging): `WORKER_ROLES` (`consumers`, `jobs`, default both), `WORKER_HEALTH_PORT` (default 3004), `WORKER_SHUTDOWN_GRACE_MS` (default 25000). `WorkerConfig` is built once and passed into the runtime; definitions never read `process.env`. Per-consumer and per-job tuning (prefetch, retry, interval, timeout) lives on its definition.

### Scaling

- Consumers: competing consumers on one queue, so another replica is another Deployment replica. Safe because every handler is idempotent (`finishTask` is conditional, hooks are conditional updates, the catalog write is an upsert).
- Jobs: run only in a replica whose `WORKER_ROLES` contains `jobs`. Scale out by a second Deployment with `WORKER_ROLES=consumers`. No lease table, no leader election.
- Heavier work later: a consumer is a handler plus a queue, so a slow kind of work gets its own queue and its own Deployment through the same roles idea (one more role name), not a rewrite.

### Observability

`GET /health` on `WORKER_HEALTH_PORT`: `status`, `service`, `commit`, `builtAt`, `startedAt`, and per consumer and job the fields from the runner state, plus the depth of each dead queue. It never contains addresses, error text or message content (same rule as the Service status page). A new explicit status module "Background worker" (`STATUS_URL_BRAIN_WORKER`, default `http://brain-worker:3004/health`, empty removes it, `workload: 'brain-worker'` so discovery adds no second card) follows the existing spider worker module. Readiness is "database answers and every consumer is connected"; liveness is a TCP check, as for brain, so a database outage does not restart pods.

### What moves and what stays

| Today | After |
| --- | --- |
| `TaskQueue.consumeResults`, `consumeCatalog` started in `server.ts` | `worker/consumers/taskResults.ts`, `taskCatalog.ts`; `TaskQueue` keeps `publish` |
| `core/resultConsumer.ts` | Stays, used only by `TakeoverRelay.consume` (see the deviations in Outcome); the task consumers use `ConsumerRunner` |
| `TaskService.applyResult` | Stays, now atomic: it finishes the session and runs the task's `onResult` in one transaction; the results consumer calls it |
| `TaskService.applyCatalog` | Stays (a data write); the catalog consumer calls it |
| `ProxyScoringJob.start/stop` | `worker/jobs/proxyScoring.ts` |
| `TakeoverRelay` pictures and `consume()` | Stay in the API: the tRPC calls read them from the API's memory, so a worker process could not serve them. They are not "processing on behalf of brain". `release` on a result goes away; `hold` prunes expired entries instead (weakness 5) |
| `TaskService.request`, `emit`, `TaskQueue.publish` | Stay in the API (P2) |

## Approach

- [x] 0. Lock the plan (answers of 2026-10-16).
- [x] 1. Framework, no behaviour moved. Tests first, each next to its source.
  - [x] `consumers/defineConsumer.ts`, `consumerRunner.ts` (parse, retry with copy and header, dead queue, reconnect, stop, state).
  - [x] `jobs/defineJob.ts`, `jobRunner.ts` (overlap, timeout, error isolation, state, quiet when idle).
  - [x] Registries that fail at boot on a duplicate or invalid name (`TASK_NAME_PATTERN` for task hooks).
  - [x] `config.ts`, env keys, `health/workerHealth.ts`, `runtime.ts`, `main.ts`, the `dev:worker` and `start:worker` scripts, `worker` in `.prettierrc`, the restricted-import lint rule.
- [x] 2. Move the work.
  - [x] `finishTask(result, after)` runs the hook in the transaction; `onResult` gets `tx`; update `linkedInLogin.hooks.ts`.
  - [x] `taskResults` and `taskCatalog` consumers; the `server.ts` wiring and `TaskQueue.consume*` are removed.
  - [x] `proxyScoring` job; remove the timers from `ProxyScoringJob`.
  - [x] `TakeoverRelay`: prune on `hold`, no `release` from results.
  - [x] `server.ts` keeps HTTP, takeover pictures and its shutdown only.
- [x] 3. Packaging.
  - [x] `docker-compose.yml`: `brain-worker` from the same build, `command` override, same environment, depends on `migrate` and `rabbitmq`.
  - [x] `deploy/base/brain-worker.deployment.yaml` and its Service, 1 replica, small requests, same `app-config` and `app-secrets`, discovery annotations; added to `kustomization.yaml`. The image pin already covers the shared image name; the staging pull-secret patch now names `brain-worker`.
  - [x] `staging.yml` rollout wait, `staging-power.sh` scale list, `idle_shutdown.py` `ACTIVITY_APPS` and its test, Service status module and env, `deploy/README.md`.
- [ ] 4. Out of scope for this change (answer to Q2: later). Outbox: `TaskService.request` saves the session as `QUEUED` (additive migration), a `task-dispatch` job publishes it with a confirm and marks it `IN_PROGRESS`, and `emit` and the automatic triggers use the same path. Needs its own plan; the job framework from step 1 is what it would plug into.
- [x] 5. Verify end to end, then update `MEMORY.md` and set this plan to `done`.

## Edge cases and risks

- **Two processes during a rolling deploy.** The old API and the new worker both consume `tasks.done` for a while. Harmless: handlers are idempotent and the queue allows competing consumers. If the worker is not deployed yet, results wait in the durable queue (24 hour TTL, 10,000 cap) and nothing is lost; sessions stay `IN_PROGRESS` meanwhile. The manifests for the worker ship in the same change as the removal from the API.
- **Worker starts before the migration.** The migration is brain's init container. The worker has none. A result applied on an old schema fails, is retried after 5 s, 30 s and 2 minutes, then goes to the dead queue, which the replay command empties. The worker waits for the database to answer before it consumes.
- **Hook failure.** Covered by the single transaction; a test proves the session stays `IN_PROGRESS` and the redelivered result applies.
- **Poison and unknown versions.** A result that does not parse goes to the dead queue, not the void; a newer spider during a rolling deploy is therefore recoverable.
- **Catalog and `drop-head`.** `tasks.catalog` holds one message, so a retry copy could replace a newer one. The catalog write therefore ignores a catalog older than the one it applied last (`announced_at`), and the catalog consumer keeps the default retry.
- **Idle shutdown on staging.** Proxy scoring and result lines move from the `brain` log to the `brain-worker` log. Without adding `brain-worker` to `ACTIVITY_APPS`, staging could power off while a result is being applied, or stay on differently than today.
- **Env validation.** The worker imports `env`, which today requires the API's variables too (`DATABASE_URL`, authentik settings). It uses the same `envFrom` as brain, so no new secret is needed; a smaller worker env is a follow-up, not a goal here.
- **Memory.** Staging has one small node. Request about 50m CPU and 192Mi for the worker; check the node still fits spider (`.plan/spider-staging-deploy.md`).
- **Concurrency of handlers.** Prefetch 10 means ten results in parallel per replica. Two results for the same account are independent (conditional updates keyed on `validationId`), as today.
- **Secrets.** Handlers and logs never print message content. Results carry no credentials, but a dead message keeps its original body, so it is treated as sensitive: bounded queue, no UI, replay only by the operator.
- **Rollback.** Revert the commit: the API consumes again. Messages already in the dead queues stay and can be replayed by the old or new code.
- **Takeover on more than one replica** is not solved here (`.plan/takeover-scale.md` phase 1) and is not made worse.
- **Docker and CI.** One image, no new build entry. `pnpm build`, lint and tests cover the new folder through Turborepo.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root, and every warning fixed.
- Unit: consumer runner (parse failure, retry with header, exhausted to dead queue, reconnect, stop waits), job runner (overlap, timeout, error isolation, quiet when idle), registries (duplicates, bad names), task results (hook inside the transaction, hook failure leaves the session in progress, second delivery changes nothing), catalog guard, takeover pruning.
- Integration (real Postgres and RabbitMQ): a published `TaskResult` is applied by the worker and the account status changes; a failing hook is retried and then applied; a bad message lands in the dead queue and replay returns it.
- End to end: `docker compose up -d --build` plus the spider profile; ask for a task through tRPC, watch `spider-worker` answer and `brain-worker` finish the session; stop `brain-worker`, request a task, confirm the result waits and is applied when it starts.
- State what could not be run (for example a real staging rollout).

## Outcome

Shipped: the `src/worker/` framework (consumer and job runners, registries, config, health, runtime, replay), the result and catalog consumers and proxy scoring running in it, the atomic task hook, dead-letter queues with a replay command, the `brain-worker` compose service and Kubernetes Deployment and Service, the Service status module, and the staging power, CI and idle-checker updates.

Deviations from the plan:

- `TaskService.applyResult` was kept (now atomic) instead of being removed: it is the data rule for what a result does, so it stays in `database/` and the worker only triggers it. This also kept the existing database integration tests in place.
- `core/resultConsumer.ts` stays for the takeover picture consumer, because the API must not import `worker/` and that consumer has to run in the API. It is the one remaining consumer outside the worker.
- The staging pull-secret patch needed `brain-worker` in its name regex (not in the plan).

Verified: lint, `ts:check` (including `apps/body`), unit tests, build, brain integration tests against local Postgres and RabbitMQ (new `worker.integration.test.ts`: result applied, hook failure rolls back and retries, bad message dead-lettered and replayed), the compiled worker against the compose stack (health 200, catalog applied, malformed result dead-lettered, `worker:replay`, graceful SIGTERM), the idle-checker Python tests, and `kubectl kustomize` for the staging and local overlays.

Not verified: a real staging rollout, and a spider task answered end to end through tRPC and a real spider worker. The owner ran `docker compose up -d --build` with the new service and it worked as expected.

Follow-ups: the outbox for publishing tasks (step 4, its own plan); a smaller worker environment (it still needs the API's variables); moving the takeover pictures to a shared store (`.plan/takeover-scale.md`).
