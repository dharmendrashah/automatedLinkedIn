# Spider task lifecycle: close the gaps so every run is repeatable and easy to debug

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-27
- Locked by user: yes, 2026-10-27 (answers below)

## Goal

Every account task runs the same lifecycle, leaves a complete record, and leaves the account's session and browser profile saved and up to date, so the same task can be run again and again, and a failed run can be read from its video, screenshots, network, steps, input and page without guessing. Defined in `.github/skills/spider-task-writer/SKILL.md`.

## The lifecycle (from the owner, 2026-10-27)

1. Load the account's session, device and browser profile.
2. Land on `/feed/`.
3. If it lands on `/` or `/login` (or another sign-in page): sign in with the two-step key if asked.
4. Once signed in, land on `/feed/` again, wait 5 s and scroll.
5. The actual task.
6. Save the session and the profile, so a later run (or another browser action) starts from them.
7. Always record the steps, network, screenshots, input, result and video.

## What the code does today (checked 2026-10-27)

| Step | State |
| --- | --- |
| 1 | Done (`IdentityStore`, `DiskProfiles`, `SessionVault` in `tasks/runner.ts`) |
| 2 | Done (`tasks/ensureSignedIn.ts`) |
| 3 | Partly: `kindOf`/`isSignedOutPage` know login, `/uas/login`, authwall, checkpoint, signup, but not the public home `/`; `ensureSignedIn` accepts any landing that is not one of those as the feed |
| 4 | Not done: no second landing on `/feed/` after a sign-in, no 5 s wait, no scroll (only the token sign-in waits 5 s) |
| 6 | Partly: saved only for a SUCCEEDED run that returned `commitSession`, or a run that signed in again; a FAILED run that is still signed in saves nothing, so cookies LinkedIn refreshed during it are lost |
| 7 | Partly: timeline, network, logs, video, result and session are kept; the input is not; steps and screenshots exist only for calls the recorder wraps (`goto`, `scrollBy`); `clickSelector`, `clickNth`, `typeKeys`, `attachFiles` are passed straight to the browser, so a click or typing leaves no step and no picture; `failure.html` is kept only when a wrapped step throws, so a run that ends in a verdict such as `NO_COMPOSER` keeps no final picture or page (found 2026-10-27: the composer was open in the video, and only a task-specific `attach` made the page readable) |

## Requirements

Confirmed (from the request and the lifecycle above):

- Steps 2 to 4 and 6 to 7 are the runner's job for every account task, and tasks do not repeat them.
- A second sign-in is never tried in the same run.
- Recording covers steps, network, screenshots, input, result and video for every run.

Answered by the owner on 2026-10-27:

1. **Input:** keep every field, mask secrets only (words of a post or reply included; private bucket, 7 day retention).
2. **Wait and scroll:** only after a sign-in (step 4 as written in the lifecycle).
3. **Final page:** yes: final screenshot for every run, compact final page HTML for every FAILED run.
4. **Saving after a failed run:** yes, whenever the run ends on a signed-in page, never when it ends on a sign-in page.

Open questions: none.

## Scope and non-goals

- In scope: `linkedin/session.ts` and `accountValidator.ts` (`kindOf`) for `/`; `tasks/ensureSignedIn.ts` and `tasks/runner.ts` for the second landing, wait, scroll and the save rule; the recorder for `input.json`, the final screenshot and the final page; recording of `clickSelector`, `clickNth`, `typeKeys` and `attachFiles` as steps (what was typed is never stored: its length only, as `fill` does); tests; the skill and checklist; `MEMORY.md`.
- Out of scope: changing any task's own logic, the worker's memory, staging deploy settings (staging already records `always`), the account browsing budget rules.

## Approach

- [x] 1. Lock the answers above.
- [x] 2. Tests first for each gap (unit tests for `isSignedOutPage`, `ensureSignedIn`, the runner end-of-run and sign-in cases, the recorder's final picture, `RecordedDetectionSession` steps, the body's step sentences).
- [x] 3. Code, smallest change per gap.
- [ ] 4. Run a real task through the devtools on a test account twice in a row (not run: it signs in to live LinkedIn; the owner runs it).
- [x] 5. Skill and checklist updated, `MEMORY.md`, `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.

## Edge cases and risks

- Treating `/` as signed out must not break a task that legitimately lands on `/` (none known; `linkedin-login` reads the home page itself and is excluded from `ensureSignedIn`).
- The 5 s wait and scroll add about 10 s to every run and count in the account's browsing time; a refusal by the budget must still happen before the browser opens.
- Saving a session after a failed run risks keeping a half-logged-out state: the guard is the end page (must be a signed-in page) and `SIGNED_OUT`/`NEEDS_REAUTH` verdicts never save.
- `input.json` can hold personal data and the owner's words: masked secrets use the recorder's existing redaction; the file inherits the 7 day retention and the private bucket; erasure with the run.
- Step recording of clicks must not store typed text or page content; screenshots are already kept per step and a run keeps at most 20 files (`createKeep` comment), so many click steps need a cap.
- Video, network and screenshot volume grows; recording stays off in production by default (`SPIDER_RECORDING`), `always` on staging.
- Rollback: each gap is its own small change and can be reverted on its own.

## Verification

- Unit tests per gap; `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Real: two devtools runs of one task in a row on a test account; read both run folders; one deliberate failure (an unreachable selector) shows its final picture and page.
- Not verifiable here: the same on staging with the real worker.

## Outcome

Shipped 2026-10-27, all six gaps:

1. `isSignedOutPage` (`linkedin/session.ts`) treats the public home `/` as signed out; new `isSignedInPage` (also refuses a restriction notice). Deviation from the plan: the landing is not required to be `/feed` (a consent or other page is left to the task, so a sign-in loop cannot start). The view-company test that expected `/` to mean "page not available" now expects `SIGNED_OUT`.
2. After a sign-in, `ensureSignedIn` lands on `/feed/` again (a sign-in page there fails the run as `SIGNED_OUT`), then the runner waits 5 s and scrolls 700 px (`afterSignIn`). Only after a sign-in, as answered.
3. `files/input.json` holds the validated input, run secrets masked (`recorder.attach` in `execute`).
4. `RecordedDetectionSession` records `clickSelector`, `clickNth` (no picture each), `typeKeys` (length only, never added as a secret) and `attachFiles` as steps; `StepEntry.index`; sentences for them in the body's `describeStep`.
5. `finish` keeps `screenshots/final.png` for every run (its own place in the 40 picture allowance) and the compact page as `failure.html` for a FAILED run, before the browser closes.
6. A run that fails but still ends on a signed-in page (`isSignedInPage`, a `li_at` cookie in the state, verdict not `SIGNED_OUT`) saves the session and the profile; unknown end page (a browser without `pageUrl`, a closed browser) keeps the old rule. New optional `LoginSession.pageUrl`.

Also: moved `isBudgetRefusal` out of `start-anyway-dialog.tsx` into `budget-refusal.ts` (an oxlint react-refresh warning that was on main).

Not run: step 4 above (two real runs in a row on a test account) and staging. Follow-ups: the devtools menu's own sign-in (`devtools/signIn.ts`) still has its own flow; a worker-level check that the run folder is complete is not automated.
