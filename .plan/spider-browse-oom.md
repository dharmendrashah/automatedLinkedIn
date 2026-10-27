# Staging: browse runs killed for memory, and sessions left "In progress"

- Status: in progress
- Created: 2026-10-28
- Locked by user: yes, 2026-10-28 ("go ahead" to fixes 1, 2 and 4)

## Goal

Stop `linkedin-browse` (the daily visit) from running the staging spider worker out of memory, stop a stuck page from holding a run until its 12-minute limit, and make sure a task that dies with the worker is answered to brain instead of staying "In progress" for ever.

## Requirements

Confirmed:

- Evidence (staging, 2026-10-28): `spider-worker` OOMKilled 8 times at the 3 Gi limit, each time inside `linkedin-browse`. The broker redelivered it (a task is acked only after it finishes) until `x-delivery-limit: 3` moved it to `tasks.run.dead`. Nothing reads that queue and no onExhausted runs for a crash, so 3 sessions stayed `IN_PROGRESS` and showed "No answer".
- Local recording (tripti.verma, 2026-10-27): after a video loaded in the feed the page stopped answering; scroll steps took 46, 96, 128, 229 s until the 12-minute limit.
- 1: block video autoplay in the browser (`media.autoplay.default = 5`).
- 2: a scroll call that does not answer in 30 s fails with a fixed sentence instead of waiting for the task limit.
- 4: the worker reads `tasks.run.dead` and answers each task with `exhaustedResult` (CRASHED, or NOT_STARTED when no attempt was made), then acks. This also closes the 3 dead messages already on staging.

Open questions: none.

## Scope and non-goals

- In scope: `MEMORY_PREFS`, a time limit on `scrollBy` and `scrollOver` in the driver, a dead-letter consumer in the spider worker, tests, `MEMORY.md`.
- Out of scope: the plain-layout feed reader (fix 3, waits for new recordings), raising the memory limit, a brain-side reaper.

## Approach

- [x] Autoplay pref in `MEMORY_PREFS` + test
- [x] Scroll time limit in `camoufoxDriver` + test
- [x] `messaging/deadLetters.ts` consumer + unit test, wired in `worker.ts`
- [x] `MEMORY.md`, checks

## Edge cases and risks

- Autoplay blocked is a stock Firefox setting ("Block audio and video"), not a fingerprint change that scripts can read as automation; videos still load their poster and play on click.
- A scroll that is cut at 30 s leaves the wheel call running in the page; its late result is ignored (the race handles the rejection). The run then ends in ERROR from the task, which is the earlier and cleaner end than a 12-minute timeout. A page that answers late is not retried.
- Dead-letter consumer: a message that cannot be parsed is logged (no content) and dropped; a failed publish puts the message back. A duplicate answer for a session brain already closed is ignored by brain (same path as `onExhausted`).
- The consumer shares the worker's broker connection and does not take the browser mutex.
- Rollback: revert the image. No migration.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- On staging after deploy: `tasks.run.dead` drains to 0 and the three sessions finish as failed; no new OOMKilled on the next daily visit.

## Outcome

Filled in when done.
