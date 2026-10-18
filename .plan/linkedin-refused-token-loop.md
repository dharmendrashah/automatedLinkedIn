# LinkedIn sign-in: a refused token must not loop the feed and hide the password fallback

- Status: done
- Created: 2026-10-19
- Locked by user: yes, 2026-10-19 ("open a new PR and fix it", for the open item in MEMORY.md)

## Goal

When LinkedIn refuses a stored `li_at`, `/feed/` redirects to itself (each time trying to replace the cookie, which the browser keeps) until a 429 and an empty response; `goto` throws and the check ends in ERROR "LinkedIn did not let the check load a page" without trying the password (run `f0ad6392`, 2026-10-18). The refused token should be dropped and the check go on as for any refused token.

## Requirements

Confirmed:

- When loading the feed with the token fails, the `li_at` cookie is removed from the browser and the feed is loaded once more without it, after the politeness pause.
- If that load works, the token counts as refused: password sign-in when a password is stored, otherwise NEEDS_REAUTH "token expired" (as today).
- If that load fails too, the site or the proxy is down: ERROR "did not let the check load a page" (as today). So a network failure is never reported as an expired token.

Open questions: none.

## Scope and non-goals

- In scope: `LoginSession.clearCookies(name)` (Camoufox: `context.clearCookies({ name })`; the recorded session records the step without screenshots), `AccountValidator.tryToken`, unit tests, an e2e case with a stand-in feed that loops on a bad token.
- Out of scope: why LinkedIn refuses the token; recording `Set-Cookie` attributes.

## Approach

- [x] 1. Lock this plan.
- [x] 2. Tests first: unit (loop then password, loop then token expired in session mode, both loads fail is ERROR), e2e (stand-in feed redirecting to itself while a bad token is sent).
- [x] 3. Code.
- [x] 4. Gates, MEMORY.md, Outcome, PR.

## Edge cases and risks

- One more `/feed/` load after a 429: it follows the politeness pause and carries no token, so it is a plain visit, not a retry of the refused request. One load only.
- A real rate limit (429 for the account): the second load gets the same answer and the check ends in ERROR, as today.
- The removed cookie is only the browser's copy for this run; the stored credential is not changed (brain decides that from the verdict).
- Rollback: revert the commit.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; the validator e2e in a real Camoufox.

## Outcome

- Shipped: `LoginSession.clearCookies(name)` (Camoufox `context.clearCookies({ name })`, a recorded `clearCookies` step without screenshots); `AccountValidator.loadFeed` drops `li_at` and loads the feed once more after a failed load. Unit tests for the three cases; an e2e stand-in feed that redirects to itself for a looping token.
- Deviations: none. Ships in the same PR as `.plan/linkedin-remembered-account.md` (both sign-in fixes, one branch).
- Follow-ups: none.
