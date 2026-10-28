# Spider worker on Cloud Run (Docker), on demand, off Kubernetes

- Status: locked
- Created: 2026-10-28
- Locked by user: yes, 2026-10-28 (answers 1 to 11, then A to E)

## Goal

Run the spider worker (the Camoufox browser worker, image `-spider-worker`, Dockerfile target `worker`) as a Cloud Run **job**, on demand: brain publishes a task, brain wakes the job, one execution takes that task from RabbitMQ, runs it, submits the result and exits. Nothing runs between tasks. The worker is no longer deployed to Kubernetes. Update the Service status ("/health") page, the deployment code and the CD to match.

Why: the daily visit (`linkedin-browse`) is OOM-killed at the worker pod's 3 Gi limit on staging (4 kills, 2026-10-28, `.plan/spider-browse-oom.md`). A Cloud Run execution is sized by itself, is billed only while it runs, and starts from a clean browser for every task.

## What changed from the first draft

You answered that Cloud Run should run only when brain sends it data, run it, submit it and shut down, with no node-pool maintenance. That is the Cloud Run **job** lifecycle, not a worker pool (a pool is always on). So:

- Worker pool is replaced by a job with one execution per task (answer 1 and 4 still hold for the image and size).
- The RabbitMQ heartbeat (answer 6) does not fit a worker that is not running; the status design changes (open question A).
- Deploys no longer cut a run off the way a pool restart would: a new job revision applies to new executions. The 10-second SIGTERM limit (answer 3) now only matters when a task is cancelled or reaches its timeout.
- Pool scaling and wake scripts (answer 5) are not needed. One small change to the idle checker is still required (open question D).

## Findings behind this plan (checked 2026-10-28)

Docs read: Cloud Run "What is Cloud Run", "Container runtime contract", "Create jobs", "Set task timeout for jobs", "Deploy worker pools"; Pulumi registry `gcp.cloudrunv2.WorkerPool` (Pulumi GCP v10.2.0).

- Cloud Run functions and services are started by an HTTP call and cannot consume RabbitMQ. A job runs a container to completion, can be started from an API call, bills per second, and uses the second generation execution environment (full Linux compatibility).
- Jobs: task timeout default 10 min, up to 168 h; retries default 3 (set per job); Direct VPC supports egress only; the file system is in memory (no size limit unless an in-memory volume has one); `/dev`, `/proc`, `/sys` cannot be mounted over.
- During a maintenance event a running task is migrated, with a brief pause, and **outbound VPC connections break**; the task gets SIGTSTP 10 s before. SIGTERM (cancel or timeout) is followed by SIGKILL after 10 s.
- `worker.ts` exits when a broker channel closes. A broken RabbitMQ connection mid-run would end the run, and the unacknowledged message would be delivered again.
- RabbitMQ is a StatefulSet in GKE (`rabbitmq:5672`, ClusterIP). A job reaches it through the VPC, so it needs an internal load balancer Service with a reserved internal IP (general knowledge, not from the Cloud Run docs).
- Brain publishes only to `tasks.run` (`TaskDispatchService.dispatch`, retried by the `task-dispatch` job). The worker also consumes the legacy `linkedin.requests` queue (spider's own topology); nothing in brain publishes to it.
- The worker answers over RabbitMQ (`publishRunResult`), keeps account leases and sessions in GCS, and uses `tasks.run` redelivery plus the dead-letter consumer for crashes (delivery limit 3).
- Brain's status page reads `GET http://spider-worker:3003/health` (`STATUS_URL_SPIDER_WORKER`, `serviceStatus/modules.ts`, modules `spiderWorker` and `storage`, `workload: 'spider-worker'`). A job has no address and, between tasks, no process.
- Staging's idle shutdown (`deploy/overlays/staging/idle-shutdown/idle_shutdown.py`) reads the logs of brain, brain-worker, spider-api and the `spider-worker` pod, and scales the **node pool** to zero when none show activity. Without the worker pod it would not see a run in progress, and a 25-minute task writes no brain log lines.
- `staging-power.sh` `wait_for_apps` waits for `deploy/spider-worker`; `staging.yml` runs `rollout status deploy/spider-worker`.
- GHCR packages are private; Cloud Run cannot pull from them directly.
- Pulumi: `gcp.cloudrunv2.Job` is the job resource (same provider as the pool resource I read; its exact fields are not read yet).
- Not verified: the Cloud Run job memory limit; Camoufox under the Cloud Run sandbox with `xvfb`; the size of `/dev/shm`; the role brain's service account needs to start a job; Node 25 under Pulumi's runtime.

## Requirements

Confirmed (your answers, 2026-10-28):

- Docker image `-spider-worker` on Cloud Run, not Kubernetes; no more Kubernetes deployments of the worker.
- Brain decides when to start it. A run starts when brain sends it data, runs, submits and shuts down. No node-pool management for Cloud Run.
- RabbitMQ stays on GKE behind an internal load balancer; the job uses Direct VPC egress (region `asia-south1`; the VPC and subnet are read from the GKE cluster in step 0).
- 2 vCPU and 8 GiB to start, adjusted after the spike.
- Pulumi for the Cloud Run side only, Kustomize stays for the cluster; state in a GCS bucket.
- CI pushes the worker image to **both** GHCR and Artifact Registry.
- Secrets in Secret Manager, written by the deploy job from `STAGING_SECRETS_ENV`.
- The existing `spider-worker-gcs` service account runs the job.
- Staging only; `spider-api` stays on Kubernetes.
- A new branch and a new PR; update the status page, the deployment code and the CD.
- A. Status page: no heartbeat. "Spider worker" is Live when the Cloud Run job exists and is ready and its last execution did not fail to start (brain reads the Cloud Run Admin API, cached 30 s); Dead when the job is missing or not ready; Unknown when brain cannot ask. "Cloud storage" is brain's own bucket check. The worker's HTTP server and `STATUS_URL_SPIDER_WORKER` are removed.
- B. Brain publishes the task to `tasks.run` as today, then calls the Cloud Run Admin API only to wake the job; the data travels through RabbitMQ. Brain's existing Workload Identity gets permission to run that one job.
- C. **No cap on parallel executions.** Tasks of different accounts run in parallel. For one account only one run goes at a time, as today: brain refuses a second request of the same task while one is in progress (`TaskService.checkPolicy`, `TaskBusyError`), and the worker's GCS account lease holds any other task of that account back (`AccountBusyError`, the "waiting" state you see as pending or queued). That behaviour is kept and is not reimplemented. In once-mode an execution that finds its account busy waits the existing `SPIDER_ACCOUNT_BUSY_DELAY_MS`, hands the message back and exits; the follow-up in step 2 starts the next execution once the message is ready again.
- D. The idle checker counts a running Cloud Run execution as activity (`idle_shutdown.py` and its test); nothing else about the node pool changes.
- E. Pulumi stack secrets use a passphrase kept in a GitHub secret; state bucket `<project>-pulumi-state`, versioned, created once with a command I give.

Open questions: none.

Review of the plan (2026-10-28, answers to six gaps; confirmed by the user):

- G1. Once-mode drains `tasks.run.dead` before it exits, answering each dead task with `exhaustedResult` as the Kubernetes worker does today.
- G2. The Kubernetes worker is NOT removed by CD. It stays while the Cloud Run job is tested with sample tasks that need no brain input (for example a login check, a read of messages). When the job runs smoothly the user removes `spider-worker` from Kubernetes by hand, then the manifests leave git (steps 6 and 10 change order). While both run they share `tasks.run`, so a test pauses the Kubernetes worker first (`kubectl scale deploy/spider-worker --replicas=0`) and restores it after.
- G3. The idle checker counts running Cloud Run executions of the job as activity. Its identity needs `run.executions.list` on that job (step 7).
- G4. Brain's Workload Identity (`brain-recording-links`, `deploy/base/brain.serviceaccount.yaml`) gets a custom role on the one job only: `run.jobs.get`, `run.jobs.run`, `run.executions.list`. Verified in step 0.
- G5. `github-actions-staging` gets a named list of roles for Pulumi, Cloud Run, Secret Manager, Artifact Registry, the internal address and the state bucket (exact list in `deploy/gcp-setup.md`). The publish job gets Google auth and an Artifact Registry login.
- G6. Local compose shows "Spider worker" as Unknown (no job locally). Accepted.

Spike round 1 (2026-10-28, staging, partial): one execution of `spike-spider-worker` (image `spider-worker:spike`, linux/amd64, `spider` repo in asia-south1) connected to RabbitMQ through the internal load balancer `rabbitmq-internal` (10.160.0.34), took a task, ran Camoufox on the virtual display, and finished a real `linkedin-connections` read (a scheduled task, not a removal). SIGTERM with no run in progress: stopped and exited in about 4 s. Cold start: about 85 s from the first log line to "waiting for tasks" (the plan assumed 10 to 30 s). Not measured yet: memory and `/dev/shm`, SIGTERM during a run, brain's permission to start the job. Side effects: the Kubernetes worker was paused from about 11:24 to 11:31 UTC on 2026-10-28; `MaxListenersExceededWarning` on a PassThrough stream during a run (11 listeners), to check.

Spike round 2 (2026-10-28, staging; the Kubernetes worker was paused for the test window and restored at 1 replica afterwards):

- Brain's permission (G4). Custom role `spiderJobLauncher` (`run.jobs.get`, `run.jobs.run`, `run.executions.get`, `run.executions.list`), bound on the job `spike-spider-worker` only, to `brain-recording-links`. Checked from inside the brain pod with its own Workload Identity token (no impersonation, token not printed): get job 200, list executions 200, run job 200; `run.jobs.update` (PATCH) 403, `getIamPolicy` 403. The job's generation stayed 1. `iam.serviceAccounts.actAs` on the runtime account was not needed to start it. The Policy Troubleshooter API is disabled on the project, so it was not used.
- Memory (Cloud Monitoring `run.googleapis.com/container/memory/utilizations`, p99 per minute, 8 GiB limit). Browser detection peaked about 1.7 GiB and returned to 0.4 GiB after it. The daily visit `linkedin-browse` (a real staging account, read only) grew steadily from about 0.2 GiB to 5.2 GiB over about 12 minutes and finished at 12:03:51 UTC with no kill. It passed the old 3 GiB Kubernetes limit where it had been OOM-killed. The growth is about 0.4 to 0.6 GiB a minute, so a longer or heavier visit could reach 8 GiB. Cloud Run ties memory to vCPU, so going above 8 GiB needs a check of the limits before the plan changes. One visit is not a worst case.
- `/dev/shm`: 3970 MB, which the container reports as tmpfs; `MemTotal` 8 GiB; the process runs as uid 1000 (the same as the Kubernetes pod). Measured by a one-off execution with `--args` (shell in place of the worker).
- SIGTERM during a real run. Browser detection was cancelled at 12:09:04 (about 40 s into its run). The worker logged the stop, ran out of its 5 s grace at 12:09:09, and handed the run back at 12:09:11 (7 s after SIGTERM); the message was back on `tasks.run` with no consumer. A new execution took it at 12:10:20, finished it at 12:12:52, and brain's `task-results` consumer applied the result. Not seen: whether the process was killed (SIGKILL at 10 s) or exited on its own. The last log line came at 12:09:16, after the 10 s mark, so check the execution's exit status and set the grace lower (about 3 s) if the margin is thin.
- Cold start: one run took about 85 s from the first log line to "waiting for tasks" (round 1). Round 2 started from a warm execution, so the cold start was not measured again.
- Long-running mode is still in use: a job without once-mode waits for tasks and stays billed until it is cancelled. Once-mode (step 1) is needed before the job can run to completion by itself.
- Clean-up still to do: the spike job, the two `spike-*` secrets and the custom role are test resources that step 5 replaces. `rabbitmq-internal` stays. An idle worker execution was cancelled at the end.

## Scope and non-goals

- In scope: spike, once-mode worker, brain launcher and status check, contracts, infra code for the job and its network, secret and registry pieces, RabbitMQ internal Service, removal of the worker from `deploy/components/spider`, the idle-checker change, `staging.yml`, docs and `MEMORY.md`.
- Out of scope: moving RabbitMQ, brain or spider-api off GKE; autoscaling; production; why the browse task uses so much memory (this gives it room); changing the node-pool power scripts beyond step 8 (`wait_for_apps` loses the worker).

## Approach

- [ ] 0. Spike (before any code). Read the VPC and subnet from the cluster; create by hand a one-off job from the existing image, the internal load balancer for RabbitMQ, and run one execution against a queued task. Measure memory and `/dev/shm`, check Camoufox starts, check the 10 s SIGTERM, check the RabbitMQ connection through the load balancer. Stop and report if it does not work.
- [x] 1. Worker, once-mode (`SPIDER_RUN_ONCE=true`): connect, take one message from `tasks.run` (prefetch 1), run it as today, ack or hand back as today, publish the result, close and exit 0; exit 0 at once when the queue is empty. Busy account: hand back after the existing delay, then exit. SIGTERM: hand the run back at once (`SPIDER_SHUTDOWN_GRACE_MS` about 5 s). A lost broker connection mid-run: finish the run, reconnect to publish the result, accept that the message may be delivered again (irreversible steps are guarded by `markAttempt`). Long-running mode stays for compose and local. Remove the HTTP health server and its port. Tests first.
   - Built 2026-10-28. `consumer.ts` now has `consumeOnce` (one `channel.get`, same handling as `consumeQueue`, via a shared `createHandler`). `deadLetters.ts` has `drainDeadTasks`, run after the task, so a crashed run is answered (G1). Once mode reads only `tasks.run` and `tasks.run.dead`. A dropped channel does not exit a once-mode run; a failed ack ends it with exit 1. Health server, `health/` and `SPIDER_WORKER_HEALTH_PORT` removed; `SPIDER_RUN_ONCE` added (default false).
   - Verified: spider unit tests (98 files, 1285 tests), pipeline integration tests on the local broker (9, including once mode taking one task and leaving the rest), spider `ts:check` and `lint`, built worker in once mode on an empty queue (exit 0, under 1 s), long-running mode with SIGTERM (exit 0).
   - Not done here, by plan: the grace period in the job (step 5), brain's status check that still reads `spider-worker:3003/health` (step 3), and the Kubernetes Service and port (step 6). Until step 3 lands, the status page shows the spider worker as Dead. Not tested: a lost broker connection mid-run, and the SIGTERM exit timing of once mode (staging, step 10).
- [x] 2. Brain launcher (`core/`, static class like the others): `CloudRunJob.start()` asks the Admin API for running executions and the queue's ready count, and starts `ready - running` executions (no cap; Cloud Run's own quotas apply). Called right after `TaskDispatchService.dispatch` publishes, and by a `task-dispatch` follow-up in the same job so a failed or lost start is retried within a minute. Off when `CLOUD_RUN_JOB` is unset (local and compose). Failure to start never fails the task. New runtime dependency `@google-cloud/run` (brain `dependencies`). Fixed-sentence logs, no ids of accounts. Tests first.
   - Built 2026-10-28. `core/cloudRunJob.ts`: `CloudRunJob.start()` never throws; calls run one after another in the process; it counts executions without a `completionTime` as running; it lists only the newest 100 (Cloud Run lists newest first; a missed running execution only causes an extra start). `MessageBroker.readyCount(queue)` checks the queue on its own channel and closes it. The API calls `start()` after its publish attempt (`TaskService.request`, not awaited); the `task-dispatch` job calls it on every wake-up and reports `started` in its summary. `CLOUD_RUN_JOB` (`projects/<p>/locations/<r>/jobs/<j>`) added, default empty.
   - Dependency: `@google-cloud/run` 4.2.0 in brain `dependencies`. `protobufjs` added to `allowBuilds` in `pnpm-workspace.yaml` (pnpm 12 refuses to finish an install with an unapproved install script; its postinstall only prints a warning about version schemes). The lockfile also changed 53 lines in unrelated vitest and vite peer entries, which pnpm rewrote during the add.
   - Verified: brain unit tests (129 files, 1420 tests), brain integration test for `readyCount` on the local RabbitMQ (3 pass), brain `ts:check` and `lint`, the full repo gate (lint, ts:check, unit, build). Read path checked live (read only): `ExecutionsClient.listExecutions` on the spike job returned the five past executions, all finished, so the running count was 0.
   - Not verified yet: `runJob` from the real brain pod (needs the new image, step 9), the job name in staging (step 5), and the cost of a busy account. A busy account hands its message back every 10 s, and each hand-back starts a new execution that exits again, so a long task on one account could cost many short executions. Measure it in step 10; a longer busy delay in once mode is the likely fix.

- [x] 3. Brain status: `spiderWorker` reads the job (ready condition, latest execution) through the launcher's client; `storage` is brain's own bucket check; remove `spiderWorkerUrl`, `STATUS_URL_SPIDER_WORKER` and `workload: 'spider-worker'`; update tests and the status page descriptions in `apps/body`.
   - Built 2026-10-28. `CloudRunJob.reading()` (core) reads the job with `getJob`: found (gRPC NOT_FOUND means missing), `terminalCondition` = `CONDITION_SUCCEEDED` (ready), and `latestCreatedExecution.completionStatus` = `EXECUTION_FAILED`. `spiderWorkerCheck` in `serviceStatus/modules.ts` maps it: Live when ready and the last run did not fail; Dead with "The Cloud Run job does not exist", "is not ready" or "The last run failed"; Unknown "Could not ask Google Cloud" when the API errors; Unknown "Not set up in this deployment" when `CLOUD_RUN_JOB` is empty. Cached 30 s (`ttlMs`). `storage` is `UploadFiles.reachable()`: one object listed under `uploads/` (a prefix brain already reads), left out when there is no bucket. Removed: `workerReport`, `spiderWorkerUrl`, `STATUS_URL_SPIDER_WORKER` (env, export, example), `workload: 'spider-worker'`, reason `workerUnreachable`.
   - Body: no change needed; the module names and descriptions come from brain, and `apps/body` has no hardcoded text for them.
   - Verified: brain unit tests (status, job read, bucket check), brain `ts:check` and `lint`, the full repo gate. Live, read only: from the brain pod with its own identity, the `uploads/` listing returned 200.
   - Decided (the user chose the time window): a failed run counts against the job for one hour (`FAILED_RUN_WINDOW_MS`). `reading()` returns `lastRunFailedAt` from the latest execution's completion time, and after the hour the page is Live again while the job is ready. Checked live: the client returns the timestamp seconds as a string, and it converts to the real completion time. Brain `ts:check`, `lint` and the unit tests pass.
   - Staging until step 5: `CLOUD_RUN_JOB` is not set, so the page shows the spider worker as Unknown; the old Kubernetes worker still runs, so its Deployment appears as an "Other services" card until step 10.

- [x] 4. Docker: `worker` stage already carries `GIT_SHA`/`BUILD_TIME` (PR #120); verify the image runs with the Cloud Run entrypoint and `SPIDER_HEADLESS=virtual`.
   - Done 2026-10-28. `docker build --check` on `apps/spider/Dockerfile`: no warnings. The `worker-build` stage builds for `linux/amd64`: the dependency install passes with `protobufjs` approved, the compiled worker has no health module, and the production tree is pruned. The full `worker` target was not rebuilt here: its browser download is about 1.3 GB and slow on this connection, so the runtime checks used the amd64 spike image (built from the same Dockerfile, so the same browser layer) with the new compiled code copied in. On that image: Camoufox started on the virtual display (18 s cold) and closed; the image's own entrypoint `node dist/src/worker.js` ran with `SPIDER_RUN_ONCE=true` against the local RabbitMQ, took one task, answered it on `tasks.done` (`NEEDS_PROXY`, as expected for a task sent without a proxy) and exited 0 in 5 s. Not verified here: the done marker write to the bucket (no Google credentials on this machine, so it failed and the run went on) and the full `worker` build on this machine (CI and the step 9 build do it).
- [x] 5. Infra code (`infra/cloud-run`, Pulumi, TypeScript, state in GCS): Artifact Registry repo, reserved internal IP, Direct VPC subnet access, Secret Manager secrets (containers, access for the job's service account; values written by the CD with `gcloud secrets versions add`, never through Pulumi state), the job (image tag as input, 2 vCPU, 8 GiB, task timeout 30 min, retries 0, `spider-worker-gcs` service account), IAM for brain to run it. RabbitMQ internal LoadBalancer Service in `deploy/` (staging overlay).
   - Decision E, done 2026-10-28: state bucket `automate-linkedin-511215-pulumi-state` (asia-south1, versioned, uniform access, public access enforced, access for `github-actions-staging` only); passphrase generated locally, set as GitHub secret `PULUMI_CONFIG_PASSPHRASE` with `gh secret set`, and kept in a 600 file on the operator's machine (GitHub cannot return the value).
   - G5 approved and applied 2026-10-28, the CI account `github-actions-staging`: project roles `run.admin`, `secretmanager.admin`, `secretmanager.secretVersionAdder`, `artifactregistry.admin`, `compute.addressAdmin`, `compute.networkUser`, `serviceusage.serviceUsageConsumer`; and `iam.serviceAccountUser` on `spider-worker-gcs` only. The role `secretmanager.admin` is project-wide (the narrower `secretAdmin` role does not exist); say so if it needs narrowing.
   - Built 2026-10-28, not applied. `infra/cloud-run`: TypeScript compiled with `tsc` (TypeScript 6.0.3, because `@pulumi/pulumi` peers below 7) into `bin/`, which Pulumi runs. The stack `staging` holds non-secret config only. The `spider` repository and the `spiderJobLauncher` role are adopted by import, not created. The reserved internal address is `10.160.0.200` (the spike's load balancer uses `10.160.0.34`, one node is at `10.160.0.32`). The job's env is the committed `deploy/components/spider/spider.config.env` plus the staging values; `SPIDER_SHUTDOWN_GRACE_MS` is 5000. The Service is `deploy/overlays/staging/rabbitmq-internal.service.yaml`, not in kustomization until the cutover.
   - `pulumi preview` on staging: clean, 8 to create, 2 to import, nothing changed. The image tag in config is still `spike` (old code); the CD sets the commit tag, and `pulumi up` runs at the cutover (step 10), not now. The spike's job, secrets and role are deleted after that apply.

- [ ] 6. Kubernetes: remove `spider-worker.deployment.yaml`, `.service.yaml` and `.serviceaccount.yaml` from `deploy/components/spider`; update `deploy/README.md` and `deploy/gcp-setup.md` (new one-time steps: state bucket, brain's permission, the deployer's roles).
- [x] 7. Idle checker: count running executions as activity (`idle_shutdown.py`, its test).
   - Built 2026-10-28. `CloudRunExecutions.running(job, now)` lists the job's executions with the checker's own Workload Identity token (`staging-power`) and counts those without a `completionTime`. It reads pages only while a page still holds an execution from the last hour (a task has 30 minutes, so a running one is always inside that window). A 404 means no job and so nothing running; any other error stops the checker before it decides, as every other error does. `run()` adds the count to the activity, so a run keeps the node pool on.
   - Dormant until cutover: `CLOUD_RUN_JOB` is read from the config map, which is not set yet, and the checker does nothing new without it. The overlay literal is added together with the Pulumi apply (step 10). Adding it now would make every check fail with 403 until the grant exists, and stop staging's shutdown, which runs in enforce mode.
   - Grant, in `infra/cloud-run` (applied at cutover): custom role `spiderJobWatcher` (`run.executions.list` only), bound to `staging-power` on the job. `pulumi preview`: 10 to create, 2 to import.
   - Verified: the checker's unit tests (44, including the running case, pagination, the 404 and 403 paths and the config check), and a live read-only run of the real code against the spike job (0 running) and a job that does not exist (0). Not verified: the positive case against the live API, which needs a running execution (step 10), and whether `run.executions.list` alone is enough for the list call (the first live run at cutover shows it; a 403 would say otherwise). CI does not run these Python tests (no change here).

- [x] 8. `staging-power.sh`: `wait_for_apps` without `deploy/spider-worker`.
   - Built 2026-10-28. `wait_for_apps` no longer waits for `deploy/spider-worker`. The script now runs its command block only when executed directly (`BASH_SOURCE` guard), so a test can source the functions. New test `deploy/scripts/staging-power.test.sh` (run with `bash`): a stub `kubectl` records the rollouts, and the test checks that the wait covers brain, brain-worker, body, spider-api and rabbitmq, and not the spider worker. It failed first on the worker, then passed.
   - Not changed here: `staging.yml` still runs `rollout status deploy/spider-worker` (step 9), and the worker's Deployment still exists until the cutover. Until step 9 lands, the deploy job waits for the Kubernetes worker and the wake does not.
   - Not verified against a cluster: a real wake (step 10 and staging).

- [x] 9. CD (`staging.yml`): `publish` also pushes the worker image to Artifact Registry (keeps GHCR); the `deploy` job writes the secrets to Secret Manager, runs `pulumi up` with the sha tag after the `kubectl` apply, and fails if the job is not ready; remove `rollout status deploy/spider-worker`. New values in `STAGING_CONFIG_ENV` for brain (`CLOUD_RUN_JOB`) are added by you.
   - Built 2026-10-28, not run in CI. `publish`: Google auth and `gcloud auth configure-docker` for Artifact Registry; the worker row also gets the tag `sha-<commit>` in `asia-south1-docker.pkg.dev/<project>/spider/spider-worker` (a step builds the tag list; checked with stub values). `deploy`: the `rollout status deploy/spider-worker` line is gone; after the apply, `setup-node` (`.nvmrc`), the Pulumi CLI 3.272.0 pinned from get.pulumi.com (the archive URL and layout checked), `npm ci && npm run build` in `infra/cloud-run`, then `deploy/scripts/spider-job.sh sha-<commit>`. The timeout is 25 minutes. `PULUMI_CONFIG_PASSPHRASE` is a GitHub secret. The smart-shutdown lock is still released with `if: always()`.
   - `deploy/scripts/spider-job.sh` (test `deploy/scripts/spider-job.test.sh`, stubs, run with `bash`): targeted `pulumi up` of the two secret containers and the address first; then the two values are written with `gcloud secrets versions add` (from stdin, so no value reaches a command line); then the full `pulumi up`; then it fails unless the job's ready condition is `CONDITION_SUCCEEDED` and its image is this tag. Checked: the order, the broker URL built from the reserved address, no secret on a command line, a relative secrets path, a job that is not ready, and another image.
   - Not verified: a real run of the workflow and of the script against staging. The job's image is expected to need to exist in Artifact Registry before `pulumi up` (not tested), so the first real run is the merge to `main` (or the cutover). Each deploy adds a new secret version, and old ones are not pruned yet. `actionlint` is not installed here, so the workflow is checked only for YAML and for the tag step.
   - Left for you: `STAGING_CONFIG_ENV` gets `CLOUD_RUN_JOB=projects/automate-linkedin-511215/locations/asia-south1/jobs/spider-worker` at the cutover (with the idle checker's literal, step 7). Committing `infra/cloud-run` (its `package-lock.json` and `Pulumi.staging.yaml`) is needed before the CD can run.

- [ ] 10. Cutover: apply the infra and the RabbitMQ Service, scale the Kubernetes worker to 0 once an execution has completed a task end to end, then remove it from git.
- [ ] 11. `MEMORY.md`, plan Outcome.

## Edge cases and risks

- **Wake-up lost.** A task is published but the start call fails or the container dies: the message stays in the queue. The follow-up in `task-dispatch` starts executions again within a minute; an execution that finds an empty queue exits at once (a few seconds billed).
- **Many executions at once.** Without a cap, a burst of tasks for many accounts starts as many executions (2 vCPU and 8 GiB each) as there are ready messages. Cloud Run quotas bound it; a cap can be added later if cost or quota requires. Extra executions that find an empty queue exit at once.
- **Retries.** Cloud Run retries are 0: RabbitMQ redelivery (limit 3) plus brain's follow-up are the only retry path, as today.
- **Maintenance migration.** The RabbitMQ connection breaks; the message may be delivered to a second execution. Duplicate irreversible steps are guarded by `markAttempt`; the duplicate answer is ignored by brain as `onExhausted` is.
- **Cold start.** An execution takes roughly 10 to 30 s to start (image pull plus the profile download). Fine for these queued tasks; to be measured in the spike.
- **Node pool asleep.** If staging sleeps there is no brain to start anything, and no RabbitMQ to read; running executions would fail to connect and exit. The idle checker (step 7) prevents the pool from sleeping under a run.
- **RabbitMQ exposure.** An internal load balancer opens AMQP to the VPC; no external IP; password stays in Secret Manager.
- **Secrets.** Values reach Secret Manager from the GitHub secret in the CD and are never printed or put in Pulumi state; the image carries none.
- **Brain credentials.** Brain gets permission to run one job only; a stolen brain token cannot change the job's image or command (to verify with the real role in the spike).
- **Pulumi.** State bucket access control; Node 25 support (not verified); `deletionProtection` on the job.
- **Rollback.** Keep the Kubernetes manifests in git history; rollback is `git revert` of step 6 and unsetting `CLOUD_RUN_JOB`, which makes brain stop starting executions while the Kubernetes worker runs again in long-running mode.
- **Cost.** An execution is billed while it runs (2 vCPU, 8 GiB); nothing is billed between tasks.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; `docker build --check` on the spider Dockerfile; `pulumi preview` clean; `kubectl kustomize` renders without the worker.
- Local: compose with the worker in long-running mode still finishes a task; once-mode against the compose RabbitMQ takes one task and exits; brain with `CLOUD_RUN_JOB` unset starts nothing.
- Staging: status page shows the job Live; a reply, a messages read and a daily visit each finish through a Cloud Run execution; memory of the daily visit read from Cloud Monitoring; a task started while another runs for the same account is held by the lease; a deploy during a run leaves the run alone.

## Outcome

Filled in when done.
