---
name: spider-task-writer
description: 'Use when writing, changing, reviewing or debugging a spider task in apps/spider (anything under apps/spider/src/tasks, apps/spider/src/linkedin, or a NO_COMPOSER / SIGNED_OUT / ERROR verdict from a LinkedIn task). Gives the procedure, the hard rules learned from past incidents, how to read a failed run, and a checklist to copy into the task plan.'
argument-hint: 'Task name or the incident to work on (for example linkedin-post, NO_COMPOSER)'
---

# Spider task writer

Draft v1, 2026-10-27. A spider task drives a real browser on a real LinkedIn account, so it is hard to test and costly to get wrong. Most past failures were a selector or a page shape that was assumed and never checked against the real page. This skill makes that check part of the job.

## When to use

- A new task, or a change to the input, verdicts, selectors, timing or pacing of an existing one.
- A task failed in a run (devtools or staging) and needs a cause and a fix.
- Reviewing a spider change before it merges.

## Procedure

1. **Plan first.** Follow the planning workflow in `.github/copilot-instructions.md`: a plan in `.plan/<task>.md`, and copy [the checklist](./assets/checklist.md) into its Approach section. The plan is not `done` until every box is ticked or marked not applicable with a reason.
2. **Look at the real page before writing a selector.** Record the real page (devtools `pnpm record`, "Record a session", `s` keeps a snapshot) or read the kept page of an earlier run. Write down which account and date it came from. Never use a selector you only expect to exist.
3. **Write the test first.** Pure readers (`linkedin/*.ts`, `node-html-parser` on `pageHtml()`) get a fixture (`linkedin/*Fixture.ts`, structure only, no real names or text). The task gets a unit test per verdict with the hands mocked.
4. **Build the task** under `tasks/<name>/` (exports `TASK_NAME` and `createX(config)`, one line in `tasks/registry.ts`).
5. **Run it for real** through the devtools ("Run a task") on a test account before it goes to staging. For a task that writes (post, reply, send), use the narrowest audience or a test account and say that it is public or not.
6. **Check in the real browser** with an `*.e2e.test.ts` stand-in when the task uses a new driver call or a new page shape.
7. **Finish:** the definition of done in `.github/copilot-instructions.md`, then `MEMORY.md` (what was seen, on which account and date, what was not run live).

## Lifecycle every task keeps

Every task that uses an account runs inside the same lifecycle, so a run can be repeated later from the same session and profile, and read afterwards from what it recorded. The runner (`tasks/runner.ts`) owns every step except 5; a task never repeats them.

| # | Step | Owner |
| --- | --- | --- |
| 1 | Load the account's device (`IdentityStore`), browser profile (`DiskProfiles`) and saved session (`SessionVault`); start the recorder and write `files/input.json` (the validated input, the run's secrets masked) | runner |
| 2 | Land on `/feed/` | `ensureSignedIn` |
| 3 | Landed on `/`, `/login` or any other sign-in page (login, `/uas/login`, authwall, checkpoint; `isSignedOutPage`): sign in once with the stored password, and the two-step key if asked; never a second time | `ensureSignedIn`, `AccountValidator` |
| 4 | After a sign-in only: land on `/feed/` again (a sign-in page there fails the run as `SIGNED_OUT`), wait 5 s, scroll | `ensureSignedIn` with the runner's `afterSignIn` |
| 5 | The actual task | `task.run` |
| 6 | Keep the final picture (`screenshots/final.png`) and, for a FAILED run, the compact final page (`failure.html`); then close the browser | runner |
| 7 | Save the session and the browser profile when the run passed its own check (`commitSession` on a SUCCEEDED verdict), signed in again, or still ends on a signed-in page (not a sign-in page, the home page, a check or a restriction notice) with a login cookie and a verdict other than `SIGNED_OUT`; never otherwise | runner |
| 8 | Record everything: `timeline.json` (steps: `goto`, `scroll`, `clickSelector`, `clickNth`, `typeKeys` with its length only, `attachFiles`), `network.json`, `logs.json`, `screenshots/`, `video.webm`, `files/input.json`, `result.json`, `session.json` | recorder |

What a task may assume: it starts on a signed-in feed with the account's own session and profile. What a task must do: use `visit` for every page, check each landed page for the sign-in page, answer `SIGNED_OUT` when it finds one, return `commitSession` on every SUCCEEDED verdict whose own check passed, and leave the browser on a normal signed-in page. A run that ends on a sign-in page never replaces a good saved session.

Fixed 2026-10-27 (`.plan/spider-task-lifecycle.md`): the home page `/` is signed out; the feed, 5 s wait and scroll after a sign-in; `input.json`; steps for clicks, typing and files; a final picture and page; saving after a failed run that is still signed in. Deliberately not done: requiring the landing to be `/feed` (a consent or other page there is left to the task to judge, so a sign-in loop cannot start).

If a run folder lacks one of the files above, that is a bug in the runner or the recorder, not something for the task to patch: fix it there, with a test.

Two tasks do not use `ensureSignedIn` and have no feed, wait, scroll or end-of-run session save of the runner's: `browser-detection` (`needs.account` false: no account, no session, no LinkedIn at all) and `linkedin-login` (it signs in itself and decides its own session with `commitSession` and `keepSession`; the runner skips `ensureSignedIn` for it by name and never saves a session on its behalf). Both still get the recorder: input, steps, network, logs, screenshots, final picture, video and result. A new task is not exempt unless it needs no account or is the sign-in task; any other task that uses an account follows the whole lifecycle.

## Hard rules

- **Sign-in page.** Every LinkedIn page the task lands on (first visit, click that navigates, back, retry) is checked with `isSignedOutPage(url)` or `createSession(...).signedIn(url)` before anything is read or clicked. The answer is `SIGNED_OUT`. Only `linkedin-login` ever fills a login form. A task that uses an account declares `SIGNED_OUT` (`registry.unit.test.ts` enforces it) and has a unit test that lands on `/uas/login`.
- **Selectors are plain CSS.** They run through `querySelectorAll`: no `:visible`, `>>`, `:has-text`. They reach open shadow roots through `pageHtml()`, `clickSelector`, `clickNth`; keep reads and clicks on those paths. Keep selectors in `linkedin/markup.ts` with the date they were seen.
- **Markup varies by account.** LinkedIn serves different layouts to different accounts (2026-10-27: one account's composer had no `data-view-name`; Post was found by its text). Prefer anchors that exist in every layout (role, `aria-label`, visible words, `componentkey` names that are words) over generated class names or one attribute family, and test both shapes with a fixture variant.
- **No guessed fallbacks.** If a selector or page shape is not verified, say so in the plan and `MEMORY.md`, and read the failed run: the runner keeps `failure.html` (the compact final page) and `screenshots/final.png` for every FAILED run of every task, in production too (`SPIDER_RECORDING` defaults to `failures`), so the next failure can be read. A task `attach`es a page (`compactHtml`) only when it needs one from the middle of a run.
- **Irreversible steps happen once.** Ask `markAttempt()` just before the step (typing, Post, Send). Once the click may have landed, an unclear outcome is `UNKNOWN`, never a retry. Nothing is typed until the box and the button are confirmed present.
- **Pages draw slowly.** Through a proxy a page can take 15 to 30 s. Look in a bounded loop before concluding a page is empty or has ended. Do not end in `ERROR` on a first address that answers 404; go on from the feed.
- **Every account task starts from the feed.** See the lifecycle above: the runner opens `/feed/` before `task.run` (`tasks/ensureSignedIn.ts`) and signs in again once when LinkedIn refuses the session. Do not repeat that in the task.
- **Verdicts.** Declared in `verdicts` with a label and tone, never the runner's own codes (`RUNNER_VERDICTS`), and answered with one fixed sentence: never page content, words the owner wrote, or secrets.
- **Session.** Return `commitSession` only when the run's own check passed. A sign-in task calls `context.keepSession()` right after a good sign-in, before looking around.
- **New driver call.** Add it to the driver, forward it in `recording/recordedDetectionSession.ts` (or the runner and devtools never see it), and cover it in the driver's e2e test.
- **Pacing.** Use `pause`, `PAUSES`-style random gaps and the task's `policy` (`cooldownMs`, `oneAtATime`) and `budget` (`estimateS`, `class`). Stay inside LinkedIn's published limits and the account's browsing budget.
- **Version.** Raise `version` when `input` or the report changes in a way an older brain would misread. `name` is permanent.
- **Brain side.** A task that must change brain data when it finishes needs an entry in `apps/brain/src/database/taskHooks.ts` (`onResult` runs in the finishing transaction). The spider worker announces its tasks when it starts; a worker started before the task existed must be restarted or brain answers `TaskUnavailableError`.

## Reading a failed run

A run folder (`.devtools-recordings/runs/<task>/devtools/<date>/<id>/` locally, `runs/<task>/<user>/<date>/<id>/` in the bucket) holds:

- `result.json` (verdict and fixed message), `timeline.json` (the steps: address, selector, length of what was typed, found or not, time), `logs.json`, `network.json`, `screenshots/` (one per `goto`, scroll, `clickSelector` and `typeKeys`, plus `final.png`), `video.webm` (what the page showed between steps), `session.json` (the session saved for the account), `failure.html` (the compact final page of a failed run) and `files/` (`input.json` and the pages the task kept).
- Read `logs.json` for the task's own lines (`source: "spider"`); the rest is browser noise.
- Look at the video before guessing: `ffmpeg -i video.webm -vf "fps=1/4,scale=640:-1,tile=4x4" -frames:v 1 sheet.png` makes a contact sheet. A task that says "no composer" while the video shows one means the reader missed it, not that LinkedIn did not draw it.
- Inspect a kept page with a small Node script written to a file (not an inline `node -e` with `!` in it: zsh expands `!`).
- Shell notes: running a command from inside `apps/spider` can raise a zsh-autoenv "Authorize this file?" prompt that swallows the next command; run helper scripts from `/tmp` with absolute paths and never authorize on the user's behalf.

## Related

- Checklist to copy into the plan: [assets/checklist.md](./assets/checklist.md)
- Spider rules in the project guide: `.github/copilot-instructions.md`, section "Spider tasks and the sign-in page"
- History and gotchas: `MEMORY.md`
