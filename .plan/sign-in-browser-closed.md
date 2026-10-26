# Sign-in check: keep the session when the browser closes after it, and ease the load

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-26
- Locked by user: yes, 2026-10-26 (the request: improve this task; the browser closed too soon)

## Goal

A staging sign-in check (session `9536b2e6`) signed in, scrolled the feed, opened the own profile and scrolled it, then the browser closed in the middle of step 19 (`page.evaluate: Target page, context or browser has been closed`). The answer was `VALID`, but no session file was saved (the run has no `session` artifact), so the sign-in was thrown away and the next task had to sign in again.

## What the run shows (read from the staging bucket, 2026-10-26)

- Sign-in at 34 s, feed scrolls to 74 s, `/in/me/` at 83 s, three profile scrolls, then no browser log line after 114 s and the fourth profile scroll failed at 124.7 s after hanging 9.5 s. The video file is exactly 1.5 MiB (cut short).
- The last browser lines before the close are Juggler `Network.getResponseBody` / `convertString` errors (`NS_ERROR_UNEXPECTED`): the recorder reads the body of every text, JSON and XML response in full through the browser, however large, and keeps only 64 KB of each (2 MB in all). The profile page loads many large JSON responses.
- The browser died by itself (the worker pod is replaced since, so a memory kill cannot be confirmed; the container did not restart). Not proven: the load of reading bodies is a likely contributor, not shown to be the cause.

## Requirements

1. **Keep the session right after a good sign-in**, before looking around, so a browser that closes later does not lose it. The runner saves that copy when the browser can no longer be read at the end.
2. **A closed browser during the look-around is said in one fixed sentence**, ends the look-around at once, and does not fail the sign-in.
3. **The recorder stops reading what it will throw away:** a response whose declared size is over 256 KB is not read, and no body is read once 2 MB were taken (the recorder's own total).

## Scope and non-goals

- In scope: `tasks/defineTask.ts` (`keepSession` in the context), `tasks/runner.ts`, `tasks/linkedinLogin/index.ts` and `browseAfterLogin.ts`, `recording/attachRecorder.ts`, tests, `MEMORY.md`.
- Out of scope: the worker's memory limit and shared memory (changed only with a measurement); the other tasks' look-around.

## Approach

- [x] 1. Tests first: runner keeps the early session when the browser is gone at the end, prefers the live one when it can be read, and keeps nothing for a failed sign-in; the login task asks for it; `browseAfterLogin` on a closed browser; the recorder skips large and late bodies.
- [x] 2. Code.
- [x] 3. Checks and `MEMORY.md`.

## Edge cases and risks

- A session copied right after sign-in is the one LinkedIn just gave; if the look-around then finds the browser signed out, `commitSession` is false and nothing is saved, as before.
- The early copy is filtered by the same allowlist as the final one.
- A body over the declared size is lost from the record (the network list still shows the request); headers, status and timing stay.
- `content-length` is the compressed size, so a small compressed body can be large; the 2 MB total still bounds it.

## Verification

- Unit tests; `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Live: a staging sign-in check after the worker image is deployed.

## Outcome

Shipped as planned. `TaskContext.keepSession` copies the allowlisted session; `linkedin-login` calls it right after a VALID sign-in, before `browseAfterLogin`; the runner falls back to that copy when the browser cannot be read at the end and the task asked to commit. `browseAfterLogin` says "The browser closed while it looked around" and stops, without failing the sign-in. `attachRecorder` skips a body whose `content-length` is over 256 KB and any body once 2 MB were taken. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` pass (exit 0, no warnings).

Not run: a live staging sign-in check (needs the new worker image). Follow-up: if the browser still dies on its own, measure the worker's memory and shared memory before changing limits.
