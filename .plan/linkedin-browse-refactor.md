# Split the daily-visit walk into reusable modules

- Status: done
- Created: 2026-10-20
- Locked by user: yes, 2026-10-20 ("refactor the code, it should follow SOLID principles so these modules can be reused later for other tasks")

## Goal

`tasks/linkedinBrowse/browse.ts` is one 500-line closure that mixes human pacing, page opening, LinkedIn markup knowledge, route logic and the run loop. Split it so each piece has one job, depends on a small interface, and a later task (like, comment, connect, search) can reuse the human-browsing pieces without copying them. Behaviour does not change.

## Requirements

Confirmed:

- No behaviour change: same routes, timings, logs, warnings, verdicts, and driver calls. `browse.unit.test.ts` (the whole-walk test) and the real-browser `browse.e2e.test.ts` keep passing as they are, apart from import paths.
- Reusable pieces know nothing about LinkedIn; LinkedIn knowledge is in one place; the task only composes.
- Follow the repo rules: KISS and YAGNI (no abstraction without a second use in sight), reuse before writing, delete what is replaced.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: the new layout below, the tests for each new module, `MEMORY.md`.
- Out of scope: `AccountValidator` and its `kindOf` and `SELECTORS` (LinkedIn knowledge too, but 500 lines used by three tasks; moving it is its own change), `browseAfterLogin` (a different, short flow; it only takes `between` from the shared place), the driver (`camoufoxDriver.ts`), brain and body.

## Approach

Layout (dependencies point down only):

```
src/browsing/          site-agnostic toolkit, knows no site
  random.ts            Range, between
  errors.ts            StepFailed (a step that did not work, safe sentence), describe
  hands.ts             Hands: the capabilities a browser must have to browse by clicking, checked once; optional ones get safe defaults
  reader.ts            createReader: pacing of a person on a page (beat, dwell, scrollToward, rest, wait, elapsed)
  overlay.ts           createOverlay: open a window by clicking a link, check it opened, close it (Escape, then its button)
  targets.ts           runTargets: the run loop (budget, failures in a row, recovery, fatal errors)
  snapshot.ts          snapshotPage (moved)
src/linkedin/          LinkedIn knowledge, knows no task
  markup.ts            selectors and page patterns
  feedReader.ts        reading the feed (moved)
  session.ts           SignedOut, open, openFeed, consent, goBack
src/tasks/linkedinBrowse/   the task: composes the two
  walk.ts              the plan of a day and its stays
  state.ts             what a walk has used and how often it failed
  finder.ts            find a post or an author, bring a header into view
  visits.ts            openPost, openProfile, openWindow
  routes.ts            one strategy per route; adding a route is one entry
  browse.ts            composition root
  index.ts             the task definition (unchanged)
```

SOLID, concretely:

- S: pacing, window handling, run loop, LinkedIn markup, session and routes each get a file.
- O: routes are a table of strategies; the run loop takes its policy as options.
- L/I: `Hands` is the narrow set of capabilities the code uses (not the whole `DetectionSession`); optional ones become no-ops, so callers never test for them.
- D: everything is built with `createX(deps)` and takes `Hands`, `Reader` and `Session` as arguments; `browse.ts` is the only place that wires them.

Steps:

- [x] `browsing/random`, `errors`, `hands` with tests
- [x] `browsing/reader` with tests
- [x] `browsing/overlay` with tests
- [x] `browsing/targets` with tests
- [x] move `snapshot` to `browsing/`; move `feedReader` to `linkedin/`; add `linkedin/markup` and `linkedin/session`
- [x] `walk` (pace split from stays), `state`, `finder`, `visits`, `routes`, rewrite `browse.ts`
- [x] repo gates, real-browser e2e (`browse`, `hands`), `MEMORY.md`

## Edge cases and risks

- Behaviour drift is the main risk: the whole-walk unit test and the stand-in e2e are the guard. Any assertion that has to change is a deviation to explain.
- The error type: code in `browsing/` cannot import `VisitError` from `tasks/` (wrong direction), so it throws `StepFailed`. Every place that treats a `VisitError` as "a step that did not work" must treat `StepFailed` the same (failure counting, warn text). `describe` does this in one place.
- Optional driver capabilities (`hover`, `drift`, `clickSelector`, `clickInside`) used to be skipped with `?.`; they become no-ops or `false` through `Hands`, same effect. A browser without `inspect`, `clickLink` or `back` still fails at the start with the same sentence.
- `linkedin/session.ts` imports `kindOf` and `SELECTORS` from `tasks/linkedinLogin/accountValidator` and `VisitError` from the task contract, so `linkedin/` sits beside the task framework, not under it. Accepted; follow-up is to move page-kind knowledge into `linkedin/`. `browsing/` imports neither.
- Import order: spider uses relative imports, so no `importOrder` change is needed.
- Rollback: one commit; nothing outside `apps/spider` changes.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`
- Real-browser e2e: `browse.e2e.test.ts`, `hands.e2e.test.ts` (with `--testTimeout=300000`).

## Outcome

Shipped as planned. `browse.ts` went from 529 to about 130 lines of wiring. New modules and tests: `browsing/{random,errors,hands,reader,overlay,targets,snapshot}`, `linkedin/{markup,feedReader,session}`, `tasks/linkedinBrowse/{state,finder,visits,routes}`. The whole-walk unit test and the real-browser e2e pass with only import paths changed.

Deviations:

- `VisitError` now extends `StepFailed` (instead of `browsing/` importing it), so every `instanceof VisitError` check keeps working and `instanceof StepFailed` covers both.
- The overlay takes its sentences from the spec (`says`), so the warnings are word for word the old ones.
- `TIMING` was split into `PACE` (reader) and `STAYS` (walk).

Not refactored on purpose: `AccountValidator` and `browseAfterLogin` (other tasks, other flows; only `between` moved), the driver, and the consent step of `browseAfterLogin` (a second copy of what `session.acceptConsent` does, but with a different flow around it; merge when a third caller appears).
