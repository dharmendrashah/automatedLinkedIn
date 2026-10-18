# Graceful shutdown of the spider worker, with the browser profile saved

- Status: done
- Created: 2026-10-19
- Locked by user: yes, 2026-10-19

## Goal

When the worker is told to stop (a deploy, a node going away, Ctrl+C), the run in progress is not lost halfway: it either finishes and its session and browser profile are saved to the bucket, or it is handed to the next worker from the last good profile. Nothing half-written is saved over a good profile.

## What exists (2026-10-19)

- On SIGINT or SIGTERM `worker.ts` stops taking messages and waits for the task in progress (`consumer.stop()` awaits it), then closes the broker and exits. The task's profile is kept inside `finish`, before the result is published, so a run that finishes also saves.
- The wait has **no limit** and Kubernetes gives the pod only its default 30 s (`terminationGracePeriodSeconds` is not set on `spider-worker`; brain-worker has 45). A sign-in or visit takes 1 to 6 minutes, so a deploy usually ends in SIGKILL: the run is cut off, nothing is saved, and the broker redelivers the task (a same-task lease takeover then lets the next worker start it at once).
- Unpack and pack run through `tar` child processes and a bucket stream; a SIGKILL during an upload leaves the old profile in place (the bucket object is replaced only when the upload ends well).

## Proposal

1. **Give the run time:** `terminationGracePeriodSeconds: 600` on `spider-worker` (the longest task limit is 6 min, plus the profile upload), and the worker's own limit `SPIDER_SHUTDOWN_GRACE_MS` (default 540 000) so the process decides before Kubernetes does.
2. **Finish, then save, then leave:** unchanged order (stop taking messages, wait for the run, `keep` the profile, publish the result, close the broker), now bounded by the grace limit.
3. **At the limit:** the run is aborted cleanly: the browser is closed, the temporary profile folder is removed, the lease is released, and the message is **not** acknowledged, so the next worker redelivers it from the last good profile. The profile of the aborted run is not saved (its state is unknown: the session may have been cancelled mid-run, which is how a dead session gets saved over a good one).
4. **A second signal** (a second Ctrl+C) leaves at once, as a developer expects.
5. **Health and logs:** the status page shows the worker as not consuming from the first signal; one log line each for "finishing the run", "saved the profile" and "aborted the run at the limit".
6. **The local tool:** the same stop on Ctrl+C is already there ("Finishing this run and skipping the rest"); its profile is used in place, so nothing to save.

## Requirements

Confirmed:

- On shutdown the worker tries to save the profile of the run it is on.
- A run that cannot finish in time is dropped and redone by the next worker from the last good profile (its half-finished profile is not saved).
- Grace period 10 minutes.

Open questions: none.

## Scope and non-goals

- In scope: `worker.ts` shutdown, a way to abort the run in progress (the runner), the env value, the deployment, tests.
- Out of scope: brain and the spider API (they have their own shutdown), running more than one task at a time.

## Edge cases and risks

- **Upload cut by SIGKILL anyway:** the old profile stays (object replaced only on a good finish).
- **Abort while the profile is being packed:** the pack is stopped and the partly written upload discarded.
- **Redelivery:** the aborted run is requeued once per shutdown; retry counters are untouched (it did nothing wrong), as for a busy account.
- **Two shutdowns in a row** (a rolling restart): each ends the same way; the profile in the bucket is always one that passed its own check.
- **Rollback:** remove the new env value and the grace period; behaviour returns to today's.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; unit tests for the bounded wait, the abort (browser closed, folder removed, message not acknowledged) and the second signal; a local run with a task in progress and a real SIGTERM.

## Outcome

- Shipped:
   - `RunnerDeps.signal`: aborting it makes the run in progress throw `ShutdownError` (browser closed, profile folder and lease released, nothing published, nothing kept); no new run starts after it.
   - The consumer hands a `ShutdownError` message straight back (`nack` with requeue), with no retry counted, no wait and no new copy.
   - Worker: on SIGINT or SIGTERM it stops taking messages, finishes the run (its profile is kept as usual), and aborts it after `SPIDER_SHUTDOWN_GRACE_MS` (540 s); a second signal leaves at once. `spider-worker` has `terminationGracePeriodSeconds: 600`.
- Deviations: no end-to-end run with a real SIGTERM: the local bucket login had expired, so the worker could not start locally. The abort, the consumer and the runner are covered by unit tests; the signal handler in `worker.ts` is not.
- Follow-ups:
   - After deploy, delete the worker pod during a run and check the log lines ("finishing the run", "handed back"), and that the task is redone by the new pod.
