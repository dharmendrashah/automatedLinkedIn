# Scheduler architecture: scheduling at scale, with as little code per use case as possible

- Status: draft, on hold (2026-10-14: the owner finds it over-engineered for now, to be revisited) <!-- draft | locked | in progress | done -->
- Created: 2026-10-14
- Locked by user: no <!-- change to "yes, <date>" only after the user confirms -->

This is an architecture decision, not a feature plan. No use case is planned here (profile checks, login checks, proxy checks, browser checks with a custom URL are only used to test the design). It extends `.plan/cron-service.md`, whose scheduler would become one concrete instance of what is decided here.

## What the framework must satisfy

Confirmed by the owner (2026-10-14):

- R1 Scale: more than 100 users, each with thousands of their own schedules, with room to grow as far as possible.
- R2 Never miss the time: a schedule fires when it is due, restarts and deploys included.
- R3 Dynamic: the application creates, changes and removes schedules at runtime, and the data a job uses can be dynamic too.
- R4 Many kinds of job will come. Writing a new kind should take as little cron code as possible, close to none.
- R5 SOLID: small contracts, replaceable parts.
- R6 Kept from the cron plan: every run recorded for 30 days with what it asked and what came back, failures easy to detect and understand, only the admin sees the operational view, the DNS updater is untouched, the cron service is for application work only.

## What scale means in numbers (assumptions to confirm)

| Quantity | 100 users x 1,000 | 1,000 users x 5,000 | Why it matters |
| --- | --- | --- | --- |
| Schedules | 100 thousand | 5 million | rows to index and poll |
| Fires per day if every schedule runs daily | about 100 thousand (1.2 a second) | 5 million (58 a second) | trigger load |
| Fires if every schedule runs hourly | 2.4 million a day (28 a second) | 120 million a day (1,400 a second) | trigger load |
| Run records kept 30 days (daily case) | 3 million rows | 150 million rows | storage and deletion |

The trigger side is cheap up to about the second column; the expensive part is always the execution. One browser task in the spider takes in the order of a minute, and a worker takes one at a time, so 100 thousand browser tasks a day needs dozens of workers regardless of how the scheduling is built. LinkedIn also limits how often one account may be touched, so most of the useful throttle is per account, not per system. Conclusion: separate firing (cheap, must be exact) from executing (costly, must be capacity-aware and rate-limited), and make the engine measure and enforce both.

## The model (the same under every proposal)

Four concepts, each with one reason to change:

1. **Schedule (when).** A row: owner, a stable key, a `spec` (cron expression, fixed interval, one time, or a calendar rule; time zone; start and end), jitter, `misfire` policy (fire once late, skip, coalesce), `nextFireAt`, enabled, quotas. Pure data.
2. **Target (what).** A reference to a unit of work already registered somewhere, plus its parameters: `{ target: 'browser-detection', params: { url } }`. The engine never contains the work.
3. **Policy (how).** Composable rules wrapped around every execution: timeout, retry with back-off, concurrency key (for example one run per account), rate limit scope (per account, per host, per user, global), circuit breaker per dependency, priority class, deadline (`startBy`: run late or drop).
4. **Run (the record).** One row per (schedule, scheduled slot), unique, with status, timings, lag (`startedAt - scheduledFor`), summary, result, failure cause and hint, and the steps (what was asked, what came back).

Ports (small interfaces, adapters behind them): `ScheduleStore`, `NextFireCalculator` (one per schedule kind), `DueSource`, `Dispatcher`, `Executor`, `JobRegistry`, `Binding` (resolves dynamic data at fire time), `RateLimiter`, `RunStore`, `Clock`. The application only ever sees one port, `Scheduler`: `upsert`, `pause`, `resume`, `remove`, `runNow`, `list`. Because the application depends on that port and not on an engine, the engine in the next section can be replaced later without touching a single use case.

## Three proposals for the engine

### Proposal 1: Postgres schedule table and due-queue, executed through RabbitMQ (recommended start)

- Schedules live in a table with a partial index on `(nextFireAt) where enabled`. Any number of identical dispatcher replicas claim due rows in batches with `SELECT ... FOR UPDATE SKIP LOCKED`, insert the `Run` (unique on schedule and slot), compute and write the next `nextFireAt`, and publish the execution message, all in one transaction (or through an outbox). No leader election, no in-memory timers, restart safe.
- Executors are stateless consumers of RabbitMQ (already in the stack; the spider already works this way), scaled by replica count, with per-key concurrency and rate limits enforced by the policy chain.
- Fairness: the claim takes at most N due schedules per owner per tick (deficit round robin), so one user's 5,000 due jobs cannot starve everyone else; per-owner quotas (schedule count, minimum interval, runs per day) are checked when a schedule is created.
- Run records are partitioned by day, so the 30 day retention is dropping a partition (instant) instead of deleting millions of rows; steps are stored as capped `jsonb` on the run (or in a partitioned table) to keep the row count low.
- Scale ceiling: a few million schedules and low thousands of fires a second on one Postgres before partitioning the schedule table (by owner hash) is needed. Estimates, to be benchmarked early with a load test of the claim query.
- Pros: no new infrastructure, transactional with application data (create a schedule in the same transaction as the domain change), easiest to operate and to reason about, matches the current stack and a small cluster, simple per-owner fairness and exact idempotency.
- Cons: polling load on Postgres (mitigated by the partial index and batch size; `LISTEN/NOTIFY` can wake dispatchers early), sub-second precision is not the goal, and at tens of millions of schedules the table needs partitioning work.

### Proposal 2: Adopt a workflow or scheduling engine (Temporal, or a lighter Postgres-based one such as Hatchet)

- Each user schedule is a native schedule of the engine, each job an activity or task run by a worker pool; retries, timeouts, history, visibility and rate limiting come from the engine.
- Pros: least code of ours, battle tested semantics (exactly-once slots, backfill, pause), very high ceiling in the large engines, good tooling for failures.
- Cons: a new cluster to run (Temporal is several services plus a database and usually Elasticsearch for search; heavy for this single small staging node), a learning curve and lock-in to its programming model, our 30 day run record and admin-only view still have to be built or mapped onto its history, and per-owner fairness and per-account rate limits are still ours to build. Not evaluated in this repository; the claims above should be verified before choosing it.
- Fit: a good choice if jobs become multi-step workflows (wait for a result, branch, signal), or if the team grows enough to own the platform.

### Proposal 3: Lookahead planner with sharded owners and delay queues (event-driven)

- A planner expands schedules into concrete fires for the next window (for example 10 minutes) and publishes them with a delivery time to a delay or partitioned queue; executors pull when due. The schedule space is split into shards (hash of schedule id) owned by planner instances through leases, so planning scales out and smooths peaks by design.
- Pros: the highest ceiling (tens of millions of schedules), predictable load shaping (the window is where jitter, priorities and capacity-aware admission happen), delay queues keep timing off the database.
- Cons: the most moving parts (shard ownership, rebalancing, planner failure handling, queue semantics for delayed messages), harder to reason about exactly-once slots, and it is more than this product needs for a long time.
- Fit: the scale-out path of Proposal 1 (add lookahead and shards behind the same ports), not a starting point.

### Comparison

| Criterion | 1 Postgres due-queue + RabbitMQ | 2 Workflow engine | 3 Lookahead + shards |
| --- | --- | --- | --- |
| Scale ceiling | millions of schedules, thousands of fires a second | very high | highest |
| Never missing the time | strong (claim in a transaction, misfire policy, lag metric) | strong (built in) | strong, more to get right |
| Dynamic schedules from the app | transactional, idempotent upsert | via the engine's API | via the planner |
| New infrastructure | none | a cluster | queues with delay, shard leases |
| Code of ours | medium | least for firing, more for fairness and records | most |
| Fit with the current stack and node | best | poor on the current node | medium |
| Reversible | yes, behind the `Scheduler` port | yes | yes |

## Recommendation

Start with Proposal 1 behind the `Scheduler` and `DueSource` ports, with the model above and the zero-code mechanisms below. It uses what already runs (Postgres, RabbitMQ, the spider task framework), is transactional with the application, and can grow into Proposal 3 by adding lookahead and shards behind the same ports. Revisit Proposal 2 only when jobs become real multi-step workflows or the operations team can own a cluster. Decide with numbers: build a small load test of the claim query first (1 and 5 million schedules, 1 to 3 dispatchers) and move on only if the lag stays inside the agreed limit.

## How to write close to zero cron code in future

1. **A schedule is a pointer, not code.** The spider already has a generic task framework (typed commands, a registry, a catalog the worker announces, one runner). A scheduled login check, profile check, proxy check or browser check with a custom URL is a schedule row `{ target: <existing task>, params }`. The engine emits the same command that `TaskService.request` emits for a manual run. There is one execution framework (tasks) and the scheduler only decides when; no second one.
2. **Everything schedulable is self-describing.** Each task in the catalog carries a parameter schema; the scheduler validates `params` against it and the UI can render the form from it. A new kind of check is therefore one task definition (which has to exist anyway), and it becomes schedulable, validated and listed automatically.
3. **Late binding for dynamic data.** Parameters may contain bindings resolved at fire time (the account's best proxy, its latest session, a user's current URL list) through small `Binding` implementations, so a schedule never goes stale and the application does not rewrite schedules when data changes.
4. **Desired-state schedule sets.** Instead of the application creating thousands of schedules one by one, it declares a rule ("every proxy of this user, every 6 hours, spread over the period") and a reconciler keeps the individual schedules in step as proxies appear and disappear, like a controller. The imperative `upsert` stays for the one-off cases.
5. **One generic API and screen.** A single `schedule.*` router and one admin screen driven by the registry, not one endpoint per feature.
6. **Policy is configuration.** Defaults per target (timeout, retries, rate scope, priority), overridable per schedule, enforced by the engine. Nobody writes retry or rate-limit code in a job.
7. **System jobs are schedules too.** The proxy scoring and retention jobs of the cron plan become schedules with no owner, seeded from a declaration, so the framework has one path, not two.

## How it never misses the time

- `nextFireAt` is stored, never held only in memory; a restart loses nothing.
- Dispatch lag is the first-class metric: `now - scheduledFor` at claim, and `startedAt - scheduledFor` at execution, as histograms with an agreed limit (for example 99% of runs start within 30 seconds of the slot). Late is a visible state, not a silent one.
- Misfire policy per schedule: `fire-once-late` (default), `skip`, `coalesce` several missed slots into one. After downtime the engine catches up in a controlled way, oldest first, capped.
- At-least-once delivery with an exact-once effect: the run is unique on (schedule, slot) and handlers receive an idempotency key.
- Spreading: a stable offset from a hash of the schedule id inside a jitter window, so "every user at 09:00" does not become one burst (and looks like a person, which also fits LinkedIn's rules).
- Capacity-aware admission: when the queue for a target is deeper than its workers can drain by the deadline, new fires of low priority are delayed and the lag metric says so; high priority has its own lane.
- Deadlines: a schedule may carry `startBy`; past it the run is dropped or marked late according to policy, so stale work never piles up.

## Protection against noisy neighbours and abuse

Quotas at creation (schedules per user, minimum interval, runs per day), fair claiming per owner, per account rate limits for anything touching LinkedIn, a circuit breaker per dependency (a failing AbuseIPDB stops its calls for a while instead of burning the quota), and a global kill switch for the admin. These are policies in the chain, not code in jobs.

## SOLID, concretely

- **S**: store, next-fire calculation, dispatch, execution, policy, recording and bindings are separate parts with one reason to change each.
- **O**: a new job target, schedule kind, policy, binding or rate scope is a new implementation registered by id; the engine is not edited.
- **L**: every target honours one contract (validated params in, result or typed `JobError` out, idempotent, cancellable), so the policy chain and recorder work for any of them unchanged.
- **I**: narrow ports; a handler receives only the context pieces it declared it needs.
- **D**: the application and the targets depend on the `Scheduler` and the context ports; Postgres, RabbitMQ and Kubernetes are adapters. Swapping Proposal 1 for 2 or 3 changes adapters only.

## What changes in `.plan/cron-service.md` if this is adopted

- The in-code job registry becomes a `Schedule` table (system jobs are schedules without an owner, seeded from declarations); `CronRun` becomes a day-partitioned run table and keeps its fields; steps become capped `jsonb` on the run or a partitioned table; the 30 day cleanup is a partition drop; the heartbeat, late detection, admin-only page and the status module stay.
- Dispatchers and executors may run in the same `brain-cron` container at first (one image, one command) and split into separate deployments only when load requires it; the code is organised so that split is a command-line change.
- The listeners (result consumers) remain separate from scheduling.
- User-owned schedules, when they exist, are a product feature a user sees about their own account; the rule "no user sees anything about the cron jobs" is about the operational view, so the two need a deliberate decision when the first user-facing schedule is built.

## Questions to settle

- Q1 Which proposal: 1 (recommended), 2, or 1 designed so it can grow into 3?
- Q2 The numbers to design for: users, schedules per user, and the busiest hour; and the lateness we accept (for example 99% start within 30 seconds of the slot).
- Q3 Will users ever see and manage their own schedules (a product feature), or are schedules always created by the application on their behalf?
- Q4 Is running a cluster such as Temporal acceptable if Proposal 2 turns out better, or must it stay on Postgres and RabbitMQ?
- Q5 Should the cron plan be reshaped around this model now (schedule table, partitioned runs), or built as planned first and migrated later? Building it as planned first means a rework of the data model, so reshaping now is cheaper.

## Risks and edge cases

- The Postgres due-queue is the busiest table in the system; its index, vacuum behaviour and partitioning need a load test before the design is frozen.
- Claim storms: many dispatchers waking at once; mitigated by small random sleeps and `SKIP LOCKED`.
- Clock: all dueness is decided by the database clock.
- Very long jobs (a browser task) must not hold a database transaction; the dispatcher only enqueues, the executor records start and end separately.
- Reconcilers and bindings can multiply load (a rule over 5,000 proxies creates 5,000 schedules); quotas and a dry-run count apply to them too.
- Wrong schedules at scale are the new failure mode (a typo making 100 thousand jobs fire every minute); quotas, a minimum interval per target and the admin kill switch bound the damage.

## Next steps

Settle Q1 to Q5, then either update `.plan/cron-service.md` to this model or write a short plan for the load test of the claim query first.
