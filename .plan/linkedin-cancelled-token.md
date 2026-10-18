# A token LinkedIn cancels right after the first page must not count as signed in

- Status: done
- Created: 2026-10-19
- Locked by user: yes, 2026-10-19 ("continue the fix")

## Goal

A stored `li_at` opened the feed once, then LinkedIn cancelled the session within a second (the realtime connection got 401 and every answer tried to remove `li_at`). The sign-in check still answered VALID and kept the dead session; the daily visit then looped on `/feed/` and crashed (local runs `83932e10`, `320f5fe2`, 2026-10-18).

## Requirements

Confirmed:

- **Sign-in check:** after the token opens the feed, wait a few seconds and load the feed once more (through `loadFeed`, which drops `li_at` and retries on a loop). Only a second feed counts as signed in with the token; otherwise the token is refused: password sign-in when one is stored, else NEEDS_REAUTH "token expired". A second failure stays ERROR.
- **After-sign-in browse:** a profile that does not load (`VisitError` reason `load`) means the session is not kept (`commitSession` false). A page that is only not allowed (allowlist, robots) keeps it, as today.
- **Daily visit:** a feed that does not load drops `li_at` and is loaded once more; landing on a sign-in page is SIGNED_OUT, not a crash. A second failure is an error, as today.

Open questions: none.

## Scope and non-goals

- In scope: `AccountValidator.tryToken`, `browseAfterLogin`, `linkedinBrowse/browse.ts`, their unit tests, the validator e2e (a token the stand-in cancels after the first page).
- Out of scope: why LinkedIn cancels pasted tokens (likely a token copied from another device); storing a different token.

## Approach

- [x] 1. Lock this plan.
- [x] 2. Tests first (unit: token cancelled after the first page, falls back to the password or says token expired; browse after login keeps nothing on a load failure; visit answers SIGNED_OUT on a looping feed. e2e: stand-in cancels a token after one feed).
- [x] 3. Code.
- [x] 4. Gates, e2e, MEMORY.md, Outcome.

## Edge cases and risks

- One extra feed load per token sign-in, after a short wait (5 s). On a good token it is a normal page view.
- A network blip on the second load: `loadFeed` retries without the token; if that also fails, ERROR as today, never "token expired".
- Rollback: revert the commit.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; validator and browse e2e in a real Camoufox; a local `pnpm record` daily visit by the owner.

## Outcome

- Shipped: `AccountValidator.tokenHolds` (5 s wait, a second feed through `loadFeed`; otherwise `li_at` is dropped and the token counts as refused); `browseAfterLogin` returns false on a `load` failure; `browseLinkedin.openFeed` drops `li_at` and retries once, a sign-in page then is SIGNED_OUT.
- Deviations: added at the owner's request (2026-10-19): the daily visit ends by opening the feed again and answers DONE (which saves the session) only when it still opens, so a session LinkedIn cancels mid-visit is never saved over a good one.
- Follow-ups: the owner re-runs `pnpm record` (daily visit) for the account; storing the password for token-only accounts avoids the cancelled token.
