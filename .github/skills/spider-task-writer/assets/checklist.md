# Spider task checklist

Copy this into the Approach section of `.plan/<task>.md`. Tick a box when done; write "n/a: reason" instead of leaving one empty. The plan is not `done` until all are ticked or explained.

## 1. Plan

- [ ] Plan exists in `.plan/` from `_template.md`; the goal says what a good run and each failed run look like.
- [ ] Open questions are empty and the user locked the requirements.
- [ ] Task name chosen (permanent), input and verdicts listed, `version` set.
- [ ] Is it a write task (post, reply, send, connect)? If yes: the irreversible step is named, and the test account and audience for live runs are agreed.

## 2. Lifecycle (the runner owns it; the task must fit it)

The order every account task runs in:

1. Load the account's device, browser profile and saved session; start the recorder; write `files/input.json`.
2. Land on `/feed/`.
3. If it lands on `/`, `/login` or another sign-in page: sign in once with the stored password and the two-step key if asked.
4. After a sign-in: land on `/feed/` again, wait 5 s and scroll.
5. The actual task.
6. Keep the final picture (and, for a failed run, the final page), then close the browser.
7. Save the session and the browser profile when the run passed its check or still ends on a signed-in page, so a later run starts from them.
8. Everything is recorded: steps, network, logs, screenshots, video, input, result, session.

- [ ] The task assumes a signed-in feed at the start and does not repeat steps 1 to 4 (no login form, no first `/feed/` visit of its own, no wait of its own for the feed).
- [ ] Is this task one of the two that do not use the sign-in lifecycle? `browser-detection` (no account, no LinkedIn) and `linkedin-login` (signs in itself, decides its own session) are exempt from steps 2 to 4 and 7 only; they still record everything (steps 1, 6 and 8). Every other task, new or old, follows all steps. A new task claims the exemption only when it needs no account.
- [ ] Every page the task lands on is checked for the sign-in page (the home `/` counts); `SIGNED_OUT` is declared and answered.
- [ ] Every SUCCEEDED verdict whose own check passed returns `commitSession: true`.
- [ ] The task leaves the browser on a normal signed-in page, never half-way through a form it will not finish, so the runner can save the session.
- [ ] The task was run twice in a row on a test account: the second run started signed in from the saved session and profile (no sign-in in its `logs.json`), and both run folders are complete.
- [ ] Each run folder holds: `timeline.json`, `network.json`, `logs.json`, `screenshots/` (with `final.png`), `video.webm`, `result.json`, `session.json`, `files/input.json`; a failed run also holds `failure.html`.
- [ ] A deliberate failure (a selector that cannot match) was run once: the run folder alone (video, screenshots, network, steps, final page, input) is enough to see why, without re-running.
- [ ] If a run folder lacked any of these, the runner or recorder was fixed with a test, not the task.

## 3. Evidence from the real page

- [ ] Real markup of every page the task reads or clicks was captured (devtools snapshot or a kept run page); account and date written in the plan.
- [ ] Layout differences between accounts were looked for (at least two accounts, or the plan says only one was seen).
- [ ] Each selector is plain CSS (no `:visible`, `>>`, `:has-text`), lives in `linkedin/markup.ts` with its date, and does not depend on generated class names.
- [ ] Anything not seen on the real page is listed as unverified in the plan.

## 4. Tests first

- [ ] Fixture for each page shape (`linkedin/*Fixture.ts`, structure only, no real names or text), including each layout variant seen.
- [ ] Reader tests (pure) for present, absent and variant markup.
- [ ] Task unit tests: success; every declared verdict; `SIGNED_OUT` when the first page and a later page land on `/uas/login`; page never draws; page answers 404; click does not land; a command delivered twice.
- [ ] Write task: a test that nothing is typed or pressed before the box and button are confirmed, and that Post/Send is pressed at most once.
- [ ] New driver call: forwarded in `recording/recordedDetectionSession.ts`, covered by a driver e2e test.
- [ ] Real-browser `*.e2e.test.ts` stand-in when the task uses a new page shape or driver call (run with `--testTimeout=120000`; not run in CI).

## 5. Build

- [ ] Folder `tasks/<name>/` exports `TASK_NAME` and `createX(config)`; one line in `tasks/registry.ts`.
- [ ] `defineTask` fields complete: `needs`, `hosts`, `verdicts` (labels and tones), `retryOn`, `budget` (`estimateS`, `class`), `policy`, `limits`, `recording`.
- [ ] `markAttempt()` is asked just before every irreversible step; unclear outcome after it is `UNKNOWN`.
- [ ] Waits are bounded loops; a slow page (15 to 30 s through a proxy) is not read as empty.
- [ ] Pacing uses `pause` and random gaps; `policy` and `budget` fit LinkedIn's limits and the account's browsing budget.
- [ ] Messages are fixed sentences; no page text, words the owner wrote, or secrets reach the log, the result or the files.
- [ ] A failed run keeps its final page without any code in the task: the runner saves `failure.html` and `screenshots/final.png` for every FAILED run (production records failures by default, `SPIDER_RECORDING=failures`). A task only `attach`es a page when it needs one from the middle of the run.

## 6. Brain side

- [ ] Input and report schemas in `packages/contracts` (rebuild `dist` after a contract change).
- [ ] `database/taskHooks.ts` entry when the finished task must change brain data; tested.
- [ ] Verdict labels show correctly in the app (catalog entry parses: `registry.unit.test.ts`).
- [ ] The spider worker was restarted so brain sees the task (`TaskDefinition.seenAt`).

## 7. Verify

- [ ] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` pass from the repo root, with no warnings.
- [ ] Run through the devtools ("Run a task") on a test account; result and run folder noted in the plan.
- [ ] Failed runs were read from `logs.json`, `timeline.json`, `files/` and the video (contact sheet), not guessed.
- [ ] Staging run, when the task is meant for staging; what could not be run is written down.

## 8. Close

- [ ] Plan status `done`, Outcome filled in (what shipped, deviations, follow-ups, what is still not run live).
- [ ] `MEMORY.md` updated: markup seen (account, date), gotchas, open items, one changelog line.
- [ ] Commit follows conventional commits; no secrets, recordings or `.env` files committed (`.devtools-recordings/` stays ignored).
