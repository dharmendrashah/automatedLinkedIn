# Spider: a run never closes the browser when a page keeps a stream open

- Status: done
- Created: 2026-10-18
- Locked by user: yes, 2026-10-18
- Ships in: PR #65 (`fix/linkedin-login-code-dialog`), since testing that fix needs it

## Goal

A task always closes its browser and publishes its result, whatever the last page keeps open.

## What happened (checked in the code)

- The owner's local run (`pnpm record`, run mode, `linkedin-login`):
   - It signed in, then `browseAfterLogin` opened the profile.
   - It never closed the browser. After about 5 minutes the run was stopped by hand, so nothing was saved: a local run writes its files only at the end.
- **The hang:**
   - `attachRecorder` reads the body of every `document`, `xhr` or `fetch` response whose content type matches `/text|json|xml/` (`response.text()`). Each read is tracked with `recorder.track`.
   - LinkedIn's signed-in pages hold a realtime connection, a `text/event-stream` fetch that never ends. `response.text()` on it never resolves.
   - At the end of the run, `CamoufoxSession.close()` first awaits `recorder.settle()` (`Promise.allSettled` of every pending capture, **with no time limit**), so `context.close()` and `browser.close()` are never reached.
   - `finish` is outside the task's 3-minute limit (`withLimit` only wraps `task.run`). So nothing stops it: the browser stays open, no result is published, and the worker takes no next task.
- **Same cause on staging:** the sessions stuck "In progress" there (screenshot of 2026-10-18) fit this. Each runs until the broker gives up on it, while the worker stays blocked.

## Proposal

1. **Never read a streaming body.** `attachRecorder` skips the body when the content type is `text/event-stream` (or `multipart/x-mixed-replace`); the network entry is still kept, without its body.
2. **Never let captures block the close.** `Recorder.settle()` waits at most 5 s; captures still running after that are dropped (the run notes that some were left out).
3. **A last guard on closing.** `CamoufoxSession.close()` closes the browser even if closing the context does not finish within a limit, about 15 s; the video may then be cut short. This makes the close path bounded in every case.

## Requirements

Confirmed by the request: the run must close the browser by itself after the profile visit.

Answered by the owner on 2026-10-18: the limits are fine (5 s for pending captures, 15 s to close the context).

Open questions: none.

## Scope and non-goals

- In scope: `attachRecorder.ts`, `recorder.ts` (`settle`), `camoufoxDriver.ts` (`close`), unit tests.
- Out of scope: changing what `browseAfterLogin` does, and the broker's redelivery rules.

## Approach

- [x] 1. Lock this plan.
- [x] 2. Tests first:
   - `attachRecorder` does not read an event-stream body.
   - `settle` returns after the limit while a capture never ends.
   - `close` closes the browser when the context does not close.
- [x] 3. The three changes.
- [x] 4. Verify:
   - The spider gates and the login e2e (a stand-in page that opens an endless `text/event-stream`).
   - Then the owner runs `pnpm record` once more: the browser must close by itself after the profile visit.
- [x] 5. MEMORY.md and Outcome.

## Edge cases and risks

- **A slow but finite response** (a big JSON body): read normally, up to the 5 s settle limit, then dropped from the record only.
- **Video:** a context closed late still writes its video. Only the 15 s guard can cut the video short, and only in a case that hangs today.
- **Rollback:** a revert of the spider image. No data change.

## Verification

- `pnpm --filter @automatedLinkedIn/spider lint ts:check test:unit:run`, the login e2e, and the repo definition of done.
- A real `pnpm record` run by the owner.

## Outcome

**Shipped:**

- `attachRecorder` no longer reads `text/event-stream` or `multipart/x-mixed-replace` bodies; the entry is still noted.
- `Recorder.settle()` waits at most 5 s (`settleMs`). Captures still running after that are dropped with a note and the pending set is cleared, so a second settle does not wait again.
- `CamoufoxSession.close()` closes the browser even when the context close takes more than 15 s (`closeTimeoutMs`).
- **Tests:**
   - 3 unit tests: a stream body is not read; settle with a capture that never ends; close when the context never closes.
   - The recording e2e's feed now opens an endless `text/event-stream` like LinkedIn's realtime connection; the run records and closes in about 30 s.
- **Repo gates:** pass.

**Deviation:** the recording e2e still expected a `click` for the password submit. Since the 2026-10-15 sign-in selectors, a page whose button is not below the password field is sent with Enter, so the test now accepts `click` or `press`.

**Not run:** the owner's `pnpm record` run against real LinkedIn.
