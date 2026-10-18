# Keep IndexedDB with the saved browser session

- Status: done
- Created: 2026-10-19
- Locked by user: yes, 2026-10-19 ("same for indexed db and cookies")

## Goal

The saved session of an account (`sessions/<account>/state.json`, sealed) already holds the cookies and the local storage of every allowed site, saved after each run that passed its own check and loaded before every run of the account. IndexedDB is not in it, so a site that keeps part of its sign-in there starts each run without it. Save and restore IndexedDB the same way.

## Requirements

Confirmed:

- Capture with Playwright's `storageState({ indexedDB: true })`; restore through the same `storageState` option a new context already gets.
- Same rules as today: only allowed sites, sealed with the credentials key, saved only after a run that passed its check (`commitSession`).
- Session storage is not kept: it belongs to one tab and ends with it, in any browser.

Open questions: none.

## Scope and non-goals

- In scope: `StorageState` type, `CamoufoxSession.storageState`, `SessionVault` (schema and size limit), tests (unit round trip, a real Camoufox round trip).
- Out of scope: brain (it never reads the session), the run's `session.json` artifact format (it is the same object).

## Approach

- [x] 1. Lock this plan.
- [x] 2. Tests first.
- [x] 3. Code.
- [x] 4. Gates, e2e, MEMORY.md, Outcome.

## Edge cases and risks

- **Size:** IndexedDB can be large (caches). Limit 5 MB with it; if the state is larger, IndexedDB is dropped and cookies and local storage are still saved, never the other way round. Over 1 MB without IndexedDB stays an error, as today.
- **Older saved files:** have no `indexedDB`; they still load (the field is optional).
- **Rollback:** revert; files saved with IndexedDB still load in the old code (the extra field is stripped).

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; a Camoufox e2e that writes IndexedDB, saves the state, opens a new browser with it and reads the value back.

## Outcome

- Shipped: `CamoufoxSession.storageState` takes `{ indexedDB: true }`; `StorageState` origins carry an optional `indexedDB` (opaque `unknown[]`: Playwright's typings leave it out); `SessionVault` keeps it (5 MB with it; above that it is dropped and the rest kept; over 1 MB without it is still an error). A real Camoufox e2e (`sessions/sessionVault.e2e.test.ts`) proves cookie, local storage and IndexedDB come back in a new browser.
- Deviations: none.
- Follow-ups: none.
