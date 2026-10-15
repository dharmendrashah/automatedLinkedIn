# Takeover latency on staging

- Status: done
- Created: 2026-10-16
- Locked by user: yes, 2026-10-16 ("check why, how can it be very fast as on the local"; the changes below stay inside the current architecture)

## Goal

Make the takeover dialog answer almost as fast on staging as locally, and show where the time goes.

## Requirements

Confirmed:

- Staging differs from local in four ways that matter: the owner talks to brain over the internet (each picture is a few hundred KB of base64 in JSON, polled every 300 ms, so the connection is the bottleneck); every poll costs brain two database round trips (user and run ownership); the worker has a 400m CPU request on a shared Spot node; and staging runs the image that was last deployed (before the faster cadence, the shorter cursor glide and the reCAPTCHA frame fix of PR 43).
- Send only what changed: the worker skips a picture identical to the last one (still one every 5 s so the run stays listed); the dialog says which picture it has and brain answers with a few bytes when it is still the newest.
- Brain remembers for 10 s that a user owns a run, so a poll costs no database query.
- The dialog shows how old the picture is (worker capture to brain), so a slow staging run can be read at a glance.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: contract field `taken_at` (optional, older workers still work), worker skip rule, brain `since` and age, ownership cache, dialog, tests.
- Out of scope: push (SSE) instead of polling, more brain replicas, worker pools, resource changes in `deploy/` (see `.plan/takeover-scale.md`).

## Approach

- [x] Contract: optional `taken_at`
- [x] Worker: stamp `taken_at`; skip identical pictures except a keep-alive every 5 s
- [x] Brain: `frame({ id, since })` answers without the picture when `since` is the newest `seq`, and says `age_ms`
- [x] Brain: ownership cache (10 s, positive answers only)
- [x] Dialog: asks with the `seq` it holds, keeps the last picture, shows the age
- [x] Tests, `MEMORY.md`, then the definition of done

## Edge cases and risks

- Skipping identical pictures must not let brain's 15 s picture TTL expire: the keep-alive publishes at least every 5 s.
- A cached ownership answer lasts 10 s; the run still disappears the moment the worker stops holding it, because the picture is checked on every call.
- Clock difference between worker and brain would show a wrong age; both run in the same cluster, so it is small. The age is only for reading, never for a decision.
- An older worker without `taken_at` gives no age; the dialog shows nothing then.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; the takeover e2e and the brain relay integration test still pass. Not verifiable here: staging itself.

## Outcome

Shipped as planned: the worker no longer sends a picture identical to the last (one every 5 s as keep-alive), the dialog asks for pictures newer than the one it holds and brain answers with a few bytes when there is none, a poll costs no database query for 10 s after the first, and the dialog shows how long ago the page last changed (`Page updated N s ago`). Verified with unit tests across the repo (spider 581, brain 759, body 237, contracts 99), lint without warnings, type check and build. Not verified: staging itself (read the new line in the dialog there: a large number right after a click points at the worker, a small number with a slow dialog points at the connection). Follow-ups: push instead of polling and worker capacity are in `.plan/takeover-scale.md`; the staging worker's 400m CPU request is unchanged.
