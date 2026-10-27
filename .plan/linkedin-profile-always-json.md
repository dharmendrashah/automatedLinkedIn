# linkedin-profile: always write profile.json

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-28
- Locked by user: yes, 2026-10-28 ("we should always get the profile.json file whether we run it with capture true or false")

## Goal

A run with `capture: true` (run `066fa57d`, 2026-10-27) ended `DONE` "Kept the pages of the profile" with no `profile.json`, because capture mode opened and kept the pages and read nothing. The profile file must come out of every run.

## Requirements

Confirmed:

- Every run of `linkedin-profile` reads the profile and attaches `profile.json`, whatever the input.
- `capture: true` still keeps the pages (markup, links and a picture) with the run, as `snapshots: true` does; it now does so while reading.
- An input that still carries `capture` stays valid (devtools forms and stored inputs), so the field stays in the schema.

Open questions: none.

## Scope and non-goals

- In scope: `tasks/linkedinProfile` (`index.ts`, `answer.ts`, `capture.ts`, their tests).
- Out of scope: the readers, the reading walk (`read.ts`), brain's import of the file.

## Approach

- [x] 1. Tests first: `index.unit.test.ts` mocks `./read` and checks that every input reads, and that `capture` or `snapshots` keeps the pages.
- [x] 2. `index.ts` always runs `readProfile`; `snapshots` is `input.snapshots || input.capture`.
- [x] 3. Deleted what only the capture-only path used: `captureProfile`, `answerFor` and `ProfileCapture`, with their tests; `DETAIL_PAGES` moved to `detailPages.ts` (used by the reading).
- [x] 4. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` pass.
- [x] 5. Spider checklist: lifecycle items n/a (runner untouched); evidence items n/a (no selector changed).

## Edge cases and risks

- Run file limit: a run keeps at most 20 files; reading with snapshots keeps 12 pages plus `profile.json`, `input.json` and `profile.inspect.json`, so 15.
- The Interests tabs: the capture kept one page per chip (`detail-interests-N`); the reading keeps `detail-interests` once. Less kept, accepted; the reading still clicks every chip.
- A `capture` run now imports its result into brain like a normal run (the profile page of the account updates). That is what "always" asks for.
- Time: reading adds parsing only; the walk is the same pages.
- Task `version` stays 3: the input is unchanged and the report is the reading's.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.

## Outcome

Shipped: every run reads the profile and attaches `profile.json`; `capture: true` is now the same as `snapshots: true` (keeps the pages while reading) and stays in the input so old callers validate. The capture-only walk and its tests are gone. Not run live: the next devtools or staging run is the proof. Deviation: none.
