# Takeover at scale

- Status: draft
- Created: 2026-10-16
- Locked by user: no

## Goal

Let several owners take over several runs at once, with the current stack (RabbitMQ, brain on Express and tRPC, spider workers on Kubernetes), without a new service.

## Requirements

Confirmed:

- None yet.

Open questions (must be empty before locking):

- How many owners at the same time must work: about 5, about 20, or 50 and more? It decides how far the phases below go.
- Is it acceptable that a takeover keeps one worker busy for up to 10 minutes (phases 1 to 3), or must normal tasks never wait behind it (phase 4)?

## Scope and non-goals

- In scope: pictures reaching every brain replica, push instead of polling, fewer pictures, more worker replicas that follow the queue, a separate worker pool for runs that need a person.
- Out of scope: freeing a worker while it waits for the owner (the page and its captcha cannot be restored from a saved session), a new service for pictures, a different broker.

## Approach

- [ ] 1. Several brain replicas: the worker publishes pictures to a fanout exchange; each brain replica reads its own exclusive auto-delete queue bound to it and keeps the newest picture per run in memory, as today. Inputs already go through a topic exchange keyed by run and need no change. Then `deploy/base/brain.deployment.yaml` can have more than one replica.
- [ ] 2. Fewer pictures: the worker skips a picture byte-identical to the last one; the dialog asks only for a picture newer than the last it holds (`since` seq) and gets "unchanged" otherwise.
- [ ] 3. Push: replace polling with a tRPC 11 SSE subscription (`httpSubscriptionLink`) on brain; the dialog keeps the polling query as the fallback.
- [ ] 4. Workers: replicas of `spider-worker` follow `tasks.run` queue length (KEDA RabbitMQ scaler or an HPA on a queue metric). Move the per-host gap (`HostRateLimiter`, in memory per process today) to something shared or keep it per worker and say so, because with N workers the gap is per worker.
- [ ] 5. Optional: a second worker deployment that only takes runs of tasks that may need a person, so ordinary scrapes never wait behind a takeover (a second queue or a routing key in the task command).

## Edge cases and risks

- Fanout to every brain replica multiplies picture traffic by the number of replicas; keep the picture TTL at 15 s and the queue auto-delete so a dead replica leaves nothing behind.
- A replica that starts late has no picture until the next one arrives, at most 700 ms later.
- SSE through the ingress needs buffering off and a long read timeout; the polling fallback covers a proxy that breaks it.
- Several workers each keep their own host gap, so LinkedIn sees more requests per second in total than `SPIDER_MIN_DELAY_MS` suggests; accounts are still one task at a time through the account lease.
- Each Camoufox takes memory (a few hundred MB) and CPU; the node pool has to be sized for the number of workers.
- Staging runs everything at one replica, and spider is not deployed to production yet.

## Verification

- Unit tests for the fanout consumer, the unchanged-picture rule and the subscription; an integration test with RabbitMQ and two brain consumers; then a run with two real takeovers at once (not possible with one worker).

## Outcome

Filled in when done.
