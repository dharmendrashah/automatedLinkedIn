# App error page

- Status: done
- Created: 2026-10-30
- Locked by user: yes, 2026-10-30 (the request settles the scope)

## Goal

A crash anywhere in the body app shows a proper error page with Try again, Reload, Go back and Go to dashboard instead of a blank screen, and every caught error goes through one function that Sentry will use later.

## Requirements

Confirmed:

- One error page for the whole app, not only the dashboard layout.
- Options to retry, refresh and navigate.
- Sentry comes later: errors go through one reporting function now (console only), so Sentry is one change there.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: `ErrorBoundary` at the root of the app (full screen) and around each dashboard page and the person drawer (in place); one `ErrorPage`; `reportError` in `lib/app-error.ts`; a "new version" message when a lazy page chunk fails to load after a deploy; copy details for support.
- Out of scope: Sentry itself, catching errors outside React rendering (window `error`, `unhandledrejection`; Sentry captures those itself), server errors (tRPC errors are already shown by each page).

## Approach

- [x] `lib/app-error.ts`: `reportError`, `isNewVersionError`, `errorDetails`, with unit tests.
- [x] `components/error-page.tsx`: the page, with Try again, Reload page, Go back, Go to dashboard and Copy details.
- [x] `ErrorBoundary` uses `ErrorPage` and `reportError`; it takes `where` and `fullScreen`.
- [x] Root boundary in `main.tsx` (inside the theme, outside the router, so it works when the router or sign-in crash); the page and drawer boundaries name their place.

## Edge cases and risks

- The root fallback sits outside the router and the sign-in: it uses plain `window.location` and `history`, never router hooks or tRPC.
- Go back with no history: the button is hidden; Go to dashboard is a full load to `/dashboard`.
- A lazy chunk missing after a deploy cannot be retried: the page says a new version is out and puts Reload first.
- Copy details holds the message, the path and the time only, never tokens or page data; clipboard refusal shows "Copy failed".
- Try again re-renders the same children; a crash that repeats shows the page again, nothing loops.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Not seen in a browser.

## Outcome

Shipped as planned. Follow-up: wire Sentry in `reportError` (and its own global handlers) when it is added.
