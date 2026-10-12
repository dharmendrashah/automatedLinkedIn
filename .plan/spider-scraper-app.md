# Spider: asynchronous distributed scraper app (Fastify API + Playwright worker)

- Status: locked
- Created: 2026-10-11
- Locked by user: yes, 2026-10-11 (Option A, answers below)
- Superseded in part on 2026-10-12 by `.plan/camoufox-browser.md`: the browser is now Camoufox, fingerprint spoofing is
  allowed on the operator's attestation of LinkedIn's permission, LinkedIn is allowed locally, and robots.txt can be
  exempted per host (`SPIDER_ROBOTS_EXEMPT_HOSTS`).

## Goal

Add a new app `apps/spider`: a Fastify API that validates a `ScrapeTaskCommand` and publishes it to RabbitMQ, and a Playwright worker that consumes one task at a time, drives a headless Chromium through typed actions, writes the raw JSON to Google Cloud Storage, and publishes a `ScrapeTaskResult`. Scope matches the blueprint in the request.

## Blocker B1 (must be resolved before any code)

The blueprint is, in plain terms, an automated LinkedIn scraper with anti-bot evasion. This collides head-on with decisions already recorded in this repo and with the project's own rules:

- `.plan/linkedin-account-linking.md` (merged, still a draft/blocker) states: no automated LinkedIn login, cookie reuse, scraping, or messaging **until a written LinkedIn permission (its blocker B1) is produced**, because LinkedIn's User Agreement 8.2 forbids scraping, bot access, cookie copying, and "override any security feature or bypass or circumvent any access controls". A user's consent to share credentials does not waive LinkedIn's terms.
- `.github/copilot-instructions.md` and `AGENTS.md` say to build automation on the user's own account within published rate limits and robots rules, and explicitly **not** to build "mass scraping of other users' data" or "evading anti-bot or security controls". The blueprint's section 5.C ("Anti-Bot & Evasion Frameworks": injected user agents, randomized human-like delays, cookie injection to bypass MFA/login) is control evasion.
- The PR checklist requires every change to follow LinkedIn's Terms of Service.

What this means: I can build the **generic, platform-neutral distributed-task framework** (Fastify → RabbitMQ → worker → GCS, with durability, prefetch 1, late ack, typed commands). I should **not** build the parts whose purpose is to evade LinkedIn's anti-bot controls or to scrape other users at scale. The two can be separated: the queue/worker/storage skeleton is legitimate infrastructure; the "inject a user agent, randomize delays to look human, reuse cookies to bypass MFA on linkedin.com" behaviour is what the rules forbid.

Resolved: the user chose **Option A**. Build the generic framework; target only allowed things (the user's own account within LinkedIn's limits, sites whose terms permit it, test pages); no fingerprint or user-agent spoofing; no "look human" randomization as evasion; honor `robots.txt` and a rate limit. Option B (evasion against LinkedIn) stays blocked until the written permission in `.plan/linkedin-account-linking.md` exists. LinkedIn hosts are NOT in any default allowlist; adding one is an explicit operator decision that must reference that plan.

## Locked answers

- Q1 Option A.
- Q2 A real GCS bucket now, via `@google-cloud/storage` and Application Default Credentials (Workload Identity on GKE later). Bucket name from env `SPIDER_GCS_BUCKET`. Creating the bucket is a shared-infrastructure change and needs the user's explicit OK when it happens.
- Q3 One package, two images from the same Dockerfile: `spider` (API, node alpine) and `spider-worker` (Playwright base image).
- Q4 Standalone: no coupling to brain's database. `auth_session_key` is an opaque storage key under `sessions/`.
- Q5 The API is internal only: loopback-bound in compose, no public ingress.
- Q6 Local only. No staging deployment now: no Kubernetes manifests, no staging workflow changes, not added to the publish matrices.
- Module format: CommonJS (repo standard), not ES Modules.

## Requirements (confirmed)

- Strict TypeScript, CommonJS output (repo standard), tsc build to `dist/src`, bare-import aliases via `module-alias` like brain, env via `envalid` reusing `RABBITMQ_URL`.
- Fastify API: POST endpoint, validates the body against the `ScrapeTaskCommand` types with a schema, generates `task_id`, publishes to a durable direct exchange `scraping.exchange` with routing key `linkedin.task` → durable queue `linkedin.requests`, `persistent: true`.
- Worker: `prefetch(1)`, opens one Chromium context per task, runs the typed `actions` loop with a type-guarded dispatch, streams the result JSON to GCS, publishes `ScrapeTaskResult` with routing key `task.result`, then `ack` **after** storage and notification succeed (late ack); on crash the task re-queues.
- Durability everywhere: durable exchanges and queues, persistent messages, late ack.
- Types exactly as in the blueprint's `types.ts` and `ScrapeTaskResult`, shared between API and worker (one module).
- Co-located tests: unit (mock amqplib, env, GCS, Playwright), integration (real RabbitMQ from the CI service container; a fake/local GCS), no live LinkedIn.

## Scope and non-goals

- In scope: the `apps/spider` package (API + worker + shared types + a storage abstraction + a broker topology helper), compose services, CI wiring (lint, ts:check, unit, and an integration test against the CI RabbitMQ), Docker images, Kubernetes manifests (API Deployment/Service; worker Deployment gated per Q6), docs.
- Out of scope (hard): anti-bot fingerprint/user-agent spoofing, "human-like" randomization presented as evasion, bypassing MFA or access controls on third-party sites, mass scraping of other users. Also out: moving brain/body onto this; a UI; retry/back-off tuning beyond re-queue on crash; dead-letter queues (noted as a follow-up).

## Approach (after Q1–Q6 answered and locked)

- [x] Scaffold `apps/spider` (package.json, tsconfig extending `@automatedLinkedIn/tsconfig/node.json`, `aliases.ts`, env, vitest `.mts`, `.prettierrc` importOrder additions for new top-level folders).
- [x] `types.ts` (shared command/result), a `MessageBroker` + topology helper (assert the durable exchange/queues), tests first.
- [x] `server.ts` (Fastify, schema validation, publish), tests first.
- [x] `worker.ts` (consume prefetch 1, typed action dispatch, Playwright, storage, late ack), tests first with Playwright and GCS mocked.
- [x] Storage abstraction: `GcsStore` and a local store for dev; tests.
- [x] Dockerfiles (Playwright base for the worker), compose services, CI matrix entry, Kubernetes manifests, overlays, README and `MEMORY.md`.
- [x] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, plus the RabbitMQ integration test.

## Edge cases and risks

- Compliance: covered by B1 and the non-goals. Do not implement evasion; honor robots and a rate limit; log task ids and outcomes only, never scraped content or cookies.
- Secrets in messages: `auth_session_key` must be an opaque reference, never a raw cookie in the queue; the worker fetches the session from storage it is authorized to read. Never log it.
- Poison messages: a task that always crashes re-queues forever with late ack. Add a redelivery/`x-delivery-count` cap or a dead-letter queue (follow-up; note it so it is not forgotten).
- Browser resource leaks: the context and browser must close in a `finally`, before ack, or memory climbs; `prefetch(1)` only helps if cleanup is guaranteed.
- Broker down at publish: the API returns a clear 503, does not drop the task silently.
- GCS auth: Workload Identity on GKE, a local store in dev; a missing bucket or permission must fail the task with a clear `error`, not hang.
- Capacity: Chromium does not fit the current staging node (Q6); the worker stays off staging until the node is resized, or runs elsewhere.
- Playwright image size and cold pulls on a small node; pin the Playwright version to the installed `playwright` package.
- module-alias trap: every new top-level `src` folder must be added to `.prettierrc` `importOrder` after `^(.*)aliases$`, or production crashes.
- CJS vs ESM: the blueprint says ES Modules, but the repo standard is CJS with `tsc`. Follow the repo (CJS) unless the user wants spider to be the first ESM app, which changes tsconfig, vitest, and the Dockerfile. Proposed: CJS to match the monorepo.
- Rollback: delete `apps/spider`, its compose services and manifests, and the CI matrix entry; nothing else depends on it.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Integration: publish a task to the CI/compose RabbitMQ and assert the worker consumes it, writes to the local/fake store, and publishes a result (no LinkedIn).
- `docker compose up` brings up the API and worker against the compose RabbitMQ; a sample task runs end to end against a local test page.
- `kubectl kustomize` renders the new manifests for local and staging.

## Outcome

Shipped locally on branch `feat/spider` (not committed, not deployed to staging, per the answers). New package `apps/spider` (CommonJS, relative imports, no module-alias): Fastify API (`POST /tasks` -> 202 with a server-made `task_id`, `GET /health`, body cap, 400/422/503 mapping that never echoes input), a Playwright worker, the blueprint's exact types plus zod schemas, and a `GcsStore`. Topology on RabbitMQ: durable direct `scraping.exchange`, quorum queue `linkedin.requests` (routing key `linkedin.task`), dead-letter exchange/queue, and a TTL-capped `scraping.results` queue (`task.result`). Worker: `prefetch(1)`, a fresh Chromium per task, raw JSON written to GCS under `results/<task_type>/<task_id>.json`, a `ScrapeTaskResult` published with publisher confirms, and the message acknowledged only after both. Compliance controls (Option A): host allowlist `SPIDER_ALLOWED_HOSTS` enforced in the API, the engine and inside the browser (off-list navigations are blocked), `robots.txt` per RFC 9309 including Crawl-delay, a fixed per-host minimum gap, a record cap, a `login` action that only loads stored cookies (never types credentials), cookies filtered to allowed hosts, a 4xx/5xx page is a failure and is never worked around, and no user-agent or fingerprint changes (a test asserts the browser stays an ordinary HeadlessChrome). Docker: one Dockerfile with `api` (node alpine) and `worker` (Playwright v1.64.0-noble) targets; compose services `spider-api` and `spider-worker` behind the `spider` profile; CI runs spider's integration tests against the RabbitMQ service.

Deviations and findings:
- RabbitMQ 4.3 does not count `nack(requeue=true)` against a quorum queue's `x-delivery-limit` and redelivers instantly, so a failing task spun about 100 times per second. Replaced with a bounded retry in the consumer: after a back-off (5 s, 30 s, 120 s) the task is published again with an `x-retries` counter; after 3 retries it is dead-lettered. Verified on a real broker (exactly 4 attempts, then the dead-letter queue).
- Retries sleep while holding the single task slot (same effect as one task at a time); a longer outage will hold the worker for up to about 2.5 minutes per task.
- The real bucket `gs://automate-linkedin-511215-spider` was created (asia-south1, uniform access, public access prevention enforced) after the user's OK.

Verification: lint, ts:check, unit tests (spider 121, brain 181, body 37) and build pass; 8 real-Chromium tests against a local site pass (extract, click-through, record cap, robots refusal, blocked off-allowlist redirect, 404 as failure, stored cookie sent, unspoofed browser); 4 pipeline tests pass on the real RabbitMQ (round trip with late ack, FAILED result not retried, bounded retries then dead letter, invalid message dead-lettered); both images build, the worker image starts Chromium as a non-root user.

NOT verified end to end with the real bucket: the local worker run reached GCS but was denied, because Application Default Credentials on this machine belong to a different account (not the one that owns the bucket). The scrape itself worked, the failure was retried and nothing was announced as SUCCESS, as designed. To finish: log in ADC as an identity with access to the bucket (see MEMORY.md), then run one task.

Follow-ups: staging deployment (manifests, a bigger node for Chromium, Workload Identity, publish matrices); a result consumer; the linking decision in `.plan/linkedin-account-linking.md` before any LinkedIn host is allowlisted.
