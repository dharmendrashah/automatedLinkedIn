# Smart shutdown for the staging environment

- Status: locked <!-- draft | locked | in progress | done -->
- Created: 2026-10-13
- Locked by user: yes, 2026-10-13 (decisions below). Code can start after the spider log check.

## Goal

Cut the staging bill by turning off the staging VM when nobody is using staging, and bringing it back when someone needs it.

## Background

- The staging GKE node pool is the billed part. Scaling Deployments to zero does not stop the VM. Only scaling the node pool to zero does.
- The node pool is currently one `e2-standard-4` Spot VM in `asia-south1-b` (pool `big-pool`).
- Persistent data is limited to the RabbitMQ volume (2 GB). It survives a node shutdown. The boot disk is deleted with the VM.
- The DNS record `app.staging` follows the node IP through the DNS updater CronJob. That job runs on the node, so it cannot update DNS while the node is off.

## Requirements

Confirmed by the user:

- Check the logs of the spider worker, the spider API and the backend (brain) for activity.
- If there is no activity for a configurable period (45 to 60 minutes; set by an environment variable), shut staging down automatically.

Proposed (need confirmation in the questions section):

- R1 Activity means real work, not health probes or retry noise. Health and readiness checks, and repeated connection-refused errors, do not count.
- R2 The idle timer is kept in cluster state, so it survives restarts of the checker.
- R3 Dry-run is the default. The checker reports "would shut down" and changes nothing until enforce mode is switched on.
- R4 Shutdown means scaling the node pool to zero. Scaling pods alone does not save money.
- R5 Staging comes back on demand, with DNS updated, without a manual edit.
- R6 Any error in the checker means no shutdown. Failing safe is the default.

## Design

Four parts:

1. **Activity detector.** Reads the last few minutes of logs from brain, spider-api and spider-worker. Counts lines that are real activity. Activity is any non-noise line in the window.
2. **Idle timer.** Stored in a ConfigMap. Any activity resets it. When the timer reaches the limit, the decision is "shutdown". The first quiet run starts the timer, so nothing shuts down on the first check.
3. **Actuator.** In enforce mode, resizes the node pool to zero. Nothing else is changed.
4. **Wake procedure.** Resizes the node pool back to one node, waits for it to be Ready, runs the DNS updater once, and runs the smoke checks. It is triggered by a GitHub workflow button and by the staging deploy job.

Schedule: a CronJob every 5 minutes reads the last 10 minutes of logs. The 10-minute window overlaps each run, so no activity is missed.

## Signals

Log lines from the three apps. Excluded as noise:

- Health and readiness probes (`/health`, `/healthz`, `/readyz`).
- Known retry loops, such as `Could not consume validation results` and repeated `ECONNREFUSED`.

Open: whether logs alone are enough. The alternative is to also count RabbitMQ queue activity (messages published or consumed). Queue activity is a more reliable signal for spider jobs, but it needs broker credentials for the checker.

## Shutdown and wake behaviour

- Scaling the pool to zero removes the VM. Its pods are evicted. Data on the RabbitMQ volume is kept.
- While the pool is at zero, the public app, API and auth endpoints are down. Browsers get a connection error.
- Waking the pool creates a new VM with a new external IP. Until the DNS updater runs, `app.staging` points at the old IP. The wake procedure runs the DNS update itself, so this window is only a few seconds.
- Expected wake time: the VM and node start in about 2 to 3 minutes. The pods take a few more minutes. The authentik migrations are already done, so no long start is expected.

## Permissions

- Enforce mode needs a GCP identity that can set the size of this one node pool.
- Recommended: a dedicated service account with a custom role limited to `container.nodePools.update` (or the equivalent setSize permission) on this pool. Not the broad `container.admin` role.
- The in-cluster checker reaches GCP through Workload Identity, so no key file is stored.
- The wake workflow uses the existing CI identity, plus the same narrow permission. This needs your approval.

## Safety

- Kill switch: `SMART_SHUTDOWN_ENABLED=false` turns the whole checker off.
- Dry-run by default. Enforce mode is switched on by a config change, reviewed in a PR.
- No shutdown while a deploy is running. The deploy workflow holds a lock in the same ConfigMap while it runs.
- No shutdown if the node pool is not at exactly one node. Anything unexpected is left alone.
- At most one shutdown per idle period, so a failed resize is not retried in a loop.
- Every decision is logged with the activity count, the last activity time and the outcome.

## Rollout

1. Dry-run for at least one week. Compare "would shut down" against real use. Adjust the window or the noise list if it is wrong.
2. Build and test the wake procedure on staging first. Confirm it brings staging back, and that DNS and the smoke checks pass.
3. Enable enforce mode only after steps 1 and 2 pass.

## Edge cases

- A spider job that runs longer than the idle limit with no log lines. It counts as idle and could be cut off. Mitigation: spider writes a heartbeat line while a job runs.
- Spider workers polling an empty queue. Their poll lines must be noise, not activity.
- Brain error loops (for example, RabbitMQ down). Excluded by the noise list. Keep the list short and reviewed.
- A deploy starts while staging is off. The deploy job must wake the pool before applying manifests.
- Two checkers running at once. Prevented by the CronJob concurrency policy.
- The checker itself cannot reach the logs API. Treated as activity-unknown, so nothing shuts down.
- The node is replaced by GKE for maintenance during the idle period. The timer continues, so this is safe.
- Clock skew. Use the server time in UTC for all comparisons.

## Cost

- Saving is roughly proportional to the hours the VM is off. Office hours only would turn off about two-thirds of the week. The exact figure depends on the actual schedule and the Spot price.
- Remaining cost while off: the RabbitMQ volume (2 GB) and the cluster control plane (free in zonal mode).

## Verification

- Dry-run: the decision log matches what you would expect from real use, for one week.
- Wake: staging comes back from zero, with `app`, `api` and `auth` returning 200 and the DNS record matching the new node IP.
- Enforce: a manual test that idles staging past the limit, then checks that it shuts down once and does not shut down again.
- Safety: a deploy during an idle period wakes the pool first.

## Decisions (answered by the user, 2026-10-13)

1. **Activity signal:** logs only for now. RabbitMQ queue activity is out of scope for this version.
2. **Idle limit:** 45 minutes. The environment variable accepts 5 to 1440 minutes.
3. **Quiet hours:** none. Staging may shut down during working hours too.
4. **Wake-up:** both a manual button and an automatic wake on deploy.
5. **Permissions:** a dedicated service account with a narrow custom role on the node pool only.
6. **Who uses staging:** the team only. No outside notification is needed.
7. **Spider activity:** counts only while a job is running. Idle polling does not count.
8. **Authentik sign-ins:** do not count.

### Consequences of the decisions

- Spider must log a line when a job starts and another when it finishes, so the checker can tell a running job from idle
  polling. This is a dependency to verify in the spider code before implementation. A long-running job must also write a
  heartbeat line, so it is not treated as idle.
- The manual wake button is a GitHub Actions workflow named "Staging power" with a `wake` / `sleep` input. It is started
  from the Actions tab under "Run workflow", or with `gh workflow run`. It uses the same dedicated service account.
- The deploy job wakes the pool before applying manifests, if the pool is at zero.
- Remaining decisions for later: none that block the design.

## Outcome

Filled in when done.
