# Land on the feed before every account task, and sign in again when LinkedIn asks

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-10-26
- Locked by user: yes, 2026-10-26 (the request below)

## Goal

A post run from the app on staging ended on LinkedIn's 404 page ("Could not open /sharing/compose, the site answered 404"). The session the account's profile held was not accepted, and LinkedIn answered a deep address with a 404 instead of the sign-in page. Every task that uses an account must start from the feed, and sign in again with the stored password and two-step key when the feed is not what opens, then carry on. What the sign-in learned is kept for the next task.

Owner's words: all tasks after login land on `/feed`; if a page says 404, check the login page: if it redirects to the feed it is fine, else sign in and continue, especially the posting task; once the sign-in is done, update the profile and the session for the next task.

## Requirements

Confirmed (from the request):

1. **One step in the runner, for every account task** (all existing and future ones, `linkedin-login` excepted): before the task starts, open `/feed/`.
   - The feed opens: go on.
   - A sign-in or security page opens: sign in.
   - The feed gives a 404 or does not load: open `/login`. If LinkedIn sends it to the feed the session is fine, go on. Otherwise sign in.
2. **Signing in is the same engine as the `linkedin-login` task** (`AccountValidator.validate`, password and two-step code from the stored credentials), run in the task's own browser.
3. **After a sign-in the session and the profile are kept for the next run**, even if the task that triggered it then fails (only an answer of `SIGNED_OUT` does not keep them).
4. **A task that lands on a 404 for its own first address** (the post's compose address) does not end in `ERROR`: it goes on as if the window did not open (feed, then Start a post).

## Scope and non-goals

- In scope: `tasks/runner.ts` (the step), a small `tasks/ensureSignedIn.ts` (the decision, tested alone), `worker.ts` and `devtools/runEnvironment.ts` (give the runner the validator), `linkedinPost/post.ts` (404 on the compose address), tests, `MEMORY.md`, `.github/copilot-instructions.md` and `AGENTS.md`.
- Out of scope: brain's rules about when a sign-in may be asked for; a person finishing a security check on the worker (the run answers `SIGNED_OUT`); the browser test task (no account).

## Approach

- [x] 1. `ensureSignedIn` with tests first: feed opens, feed shows a sign-in page, feed 404 then `/login` goes to the feed, feed 404 then `/login` shows the login page, sign-in fails, `/login` itself does not load.
- [x] 2. Runner: run it before `task.run` for an account task when the deps give a sign-in; a failed sign-in ends the run with the task's own `SIGNED_OUT` verdict; a good one marks the run so the session and the profile are kept at the end (not for a `SIGNED_OUT` answer).
- [x] 3. Wire the validator into the runner in the worker and in the devtools.
- [x] 4. Post task: a `VisitError` on the compose address goes on to Start a post.
- [x] 5. Checks, `MEMORY.md`, instructions.

## Edge cases and risks

- **Sign-in is an account risk.** Brain keeps the owner's 5 minute gap between two sign-ins, and the spider cannot see it. The step signs in at most once per run, never repeats a failed sign-in (the validator already refuses to), and answers `SIGNED_OUT` on any failure. A run now signs in on its own when the session is gone, so sign-ins can happen without the owner asking; the owner accepted this in the request.
- **Extra visit.** Every account task opens the feed first (one more page, counted in the run's browsing time). The rate limiter and the allowlist still apply, because the step opens it through the run's own `visit`.
- **A feed that is slow or shows a consent page** opens as the feed (the consent page is accepted by the existing helper); a page that is neither the feed nor a sign-in page and is not a load failure goes on without a sign-in.
- **A security check or a wrong password** is not repeated; the answer is `SIGNED_OUT` with a fixed sentence, and nothing is kept.
- **Devtools** keep their own "sign in first" for a staging account; with the step in the runner it finds the session valid and does not sign in twice.
- **Idempotent:** the step runs before the task and before `markAttempt`, so a redelivered command cannot double a post.
- **Rollback:** remove the runner step and the deps; tasks behave as before.

## Verification

- Unit tests for the decision, the runner step (ordering, failure, commit after sign-in) and the post task's 404.
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Live: not run until the worker image is deployed and a staging post is tried with the owner's go-ahead.

## Outcome

Built: `tasks/ensureSignedIn.ts` (tested alone), the runner step before `task.run` (`RunnerDeps.reauth`, wired in the worker and the devtools), session and profile kept after a sign-in unless the answer is `SIGNED_OUT`, and the post task going on from the feed when the compose address does not load. Unit tests and `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` pass. Not run live: needs the worker image deployed and a staging post with the owner's go-ahead. Follow-up: the post composer's markup in the new layout is still unknown (`NO_COMPOSER` after the composer opened), so a recorded snapshot is needed.
