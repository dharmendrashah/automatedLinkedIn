# Spider worker: out-of-memory kills, and an account blocked for 30 minutes after a crash

- Status: done
- Created: 2026-10-19
- Locked by user: yes, 2026-10-19
- Ships in: a new branch and PR off `main`

## Goal

A sign-in check (or any browser task) does not run the worker out of memory. If a worker dies anyway, its task starts again within a few minutes, not 30.

## What happened (staging, 2026-10-18, from the logs; nothing was changed on the cluster)

- **The OOM kill:**
   - At 19:03:10 UTC, `linkedin-login` for an account started. At about 19:04:45, `spider-worker` was **OOMKilled** (exit 137, limit 2 GiB).
   - On the re-run, memory went 121 MiB, then 1060, 1625 and 1736 MiB in under 2 minutes.
   - The `/dev/shm` volume (`emptyDir`, memory-backed, up to 1 GiB) counts against the same 2 GiB limit.
- **The 30-minute block:**
   - After the restart, RabbitMQ handed the task back. The killed run's account lease (`locks/<account>.json`, TTL `SPIDER_ACCOUNT_LOCK_TTL_MS` = 30 min, no heartbeat) was still there.
   - So the worker answered "account busy" and re-queued the task every 10 s, 170 times, each logged as `spider job started`.
   - At 19:33:18 the lease expired and the task ran (2 minutes, VALID).
   - Meanwhile the session showed "In progress" for about 30 minutes.

## Proposal

1. **More memory for the worker** (`deploy/components/spider/spider-worker.deployment.yaml`):
   - Limit 2 GiB → **3 GiB**; request 1 GiB → **1.5 GiB**.
   - The staging node uses 3.8 GiB, 28%, so this fits. CPU is unchanged.
   - `/dev/shm` stays at 1 GiB.
2. **A lighter browser.** See question 1 for the options. Today's video already uses Playwright's default size (at most 800 px), so a smaller video saves little.
3. **A crashed run no longer blocks its account for 30 minutes:**
   - **Same task, same lease:** when the lease is held by the **same task id**, the earlier holder died before releasing it (the broker gives a task to one worker at a time and redelivers it only when that worker's connection is gone). So `AccountLock.acquire` takes it over at once. A different task still waits for the lease or its expiry, as today.
   - **Heartbeat:** the lease is renewed while the task runs, every minute. This needs a conditional update in the store (`replace(key, body, version)`, GCS `ifGenerationMatch`, and the same in the local store).
   - **Shorter expiry:** with the heartbeat, `SPIDER_ACCOUNT_LOCK_TTL_MS` drops from 30 min to **5 min**. So even a lease left by another task's crash frees the account within 5 minutes. The env description no longer says "longer than the longest task".
4. **Plain logs while waiting.** "Account busy, trying again in 10 s" is logged as `spider job waiting: Task <id> (its account is in use)`, once per minute per task, not as `spider job started`.
   - The idle checker (`staging-power.sh` and its log rule) also counts a waiting job as work, so the cluster does not power down while one waits.

## Requirements

Confirmed: raise the memory, make runs lighter (but **not** by browsing less after sign-in), stop a crash from blocking the account for 30 minutes, and clearer logs.

Answered by the owner on 2026-10-19:

1. **Lighter browser:** both.
   - Firefox prefs that only cut memory: one content process, a smaller memory cache.
   - A smaller video for sign-in checks: 640x360.
2. **Lease expiry:** 5 minutes, renewed every minute while the task runs.

Open questions: none.

## Scope and non-goals

- In scope:
   - The deployment resources.
   - `accountLock.ts` (takeover by the same task, heartbeat), `store.ts` plus the GCS and local stores (`replace`), the runner (renewal while the task runs), `consumer.ts` (the waiting log line).
   - The env default and description, the idle-checker rule, and tests.
- Out of scope:
   - What `browseAfterLogin` does.
   - More workers or autoscaling.
   - The `MaxListenersExceededWarning` and Camoufox's own `LeakWarning` lines in the log (noise only, noted for later).

## Approach

- [x] 1. Lock this plan.
- [x] 2. Tests first:
   - Lock: the same task takes over its own lease; a different task waits; the heartbeat renews it, and stops on release; a lease that fails to renew is reported in the log and does not stop the run.
   - Consumer: a busy task logs `waiting`, not `started`.
   - Store: `replace` with a version, in both stores.
- [x] 3. Code changes, the deployment and env, and the idle checker.
- [x] 4. Verify:
   - Spider gates, plus `kubectl kustomize deploy/overlays/staging` renders.
   - After deploy, one sign-in check: memory peak on `kubectl top`, no OOM, the session finishes.
   - Optionally, delete the worker pod once mid-run (only with the owner's go) to see the task restart within about 1 minute.
- [x] 5. MEMORY.md and Outcome.

## Edge cases and risks

- **A worker that lost its broker connection but still runs** (network blip): the task is redelivered, and with the same-task takeover both runs could briefly share the account. The broker closes that worker's channel, so it cannot ack, and the run ends with its 3-minute limit. Risk is low, and a heartbeat makes the overlap visible in the log.
- **A renewal that fails** (bucket hiccup): the run goes on; the lease may expire after 5 minutes and another task could start. Logged as a warning.
- **Clock skew between workers:** the expiry uses each worker's clock, as today; 5 minutes leaves room.
- **Node capacity:** 3 GiB limit, 1.5 GiB request on a node with about 13 GiB free. Rollout replaces the pod once.
- **Rollback:** revert the image and the manifest. No data migration; lease objects stay compatible (same JSON).

## Verification

- `pnpm --filter @automatedLinkedIn/spider lint ts:check test:unit:run`, the repo definition of done, and `kubectl kustomize` rendering.
- A staging sign-in check with memory watched, by the owner or with the owner's go.

## Outcome

- Shipped:
   - Worker limit 3Gi, request 1536Mi.
   - `buildCamoufoxOptions` passes `firefox_user_prefs` with one content process (`dom.ipc.processCount`, `.webIsolated`) and a 16 MB memory-cache cap. Camoufox already disables the cache by default, so the cap is only a guard.
   - `linkedin-login` records at 640x360.
   - `AccountLock`: same-task takeover, a heartbeat every `ttl / 5` through `ObjectStore.replace` (GCS `ifGenerationMatch`; a 412 or 404 means the lease was lost, warned once). The TTL defaults to 5 min.
   - The consumer logs `spider job waiting: <label> (its account is in use)` once per heartbeat interval, and skips `spider job started` while a task waits. `idle_shutdown.py` counts the waiting line.
- Deviations:
   - There is no local store, only `GcsStore`, so `replace` exists there alone. The runner needed no change: the lock renews itself from `acquire` until `release`.
   - The idle rule lives in `deploy/overlays/staging/idle-shutdown/idle_shutdown.py`, not `staging-power.sh`.
- Follow-ups:
   - After deploy: run one sign-in check while watching memory (`kubectl top`).
   - The local `apps/spider/.env` may still set `SPIDER_ACCOUNT_LOCK_TTL_MS=1800000` (git-ignored). That still works, renewing every 6 min.
