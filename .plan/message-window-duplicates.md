# linkedin-message: slow window gets pressed again and opens duplicate New message windows (#198)

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-11-05
- Locked by user: yes, 2026-11-05

## Goal

Stop `linkedin-message` from pressing Message again while a slow window is still on its way, so one run opens one window, types once, and gives a verdict that does not say "not sent" when the send may have gone. Source: GitHub issue dharmendrashah/automatedLinkedIn#198.

## Requirements

Confirmed:

- One run opens at most one message window for the person; a second press must not happen while a window is still drawing.
- Nothing is typed into a window unless it is the only window open and it is for the person asked for.
- A send whose outcome is unclear is `UNKNOWN`, never `NOT_SENT` and never a retry (repo hard rule).
- A window an earlier run left open for this person is not pressed again.

Open questions (all answered yes on 2026-11-05, kept for the record):

- Q1. How long to wait for the first window before a second press? Recommended: up to 45 s (about 30 looks), then press again only if no window of any kind is open. Owner to confirm, since it lengthens each run.
- Q2. Maximum presses per run? Recommended: 2 (down from 3). A third press has never been the one that opened a window in the recorded runs.
- Q3. A send with the words still in the box and no 4xx answer: `UNKNOWN` (recommended) or `NOT_SENT` (current)? Choosing `UNKNOWN` means the owner must check the conversation by hand before a retry.
- Q4. Is a devtools recording of the affected account (Lydia Jaladi's layout, session `4c9033cc`) wanted before the change, to measure how long the window takes? Recommended: read the kept `failure.html` and `timeline.json` of that run first (no new LinkedIn traffic), then decide.
- Q5. Check the task's time limit in the `linkedin-message` task definition before raising the wait: the longer wait must still fit.

## Scope and non-goals

- In scope: the press and wait loop, the close of stale windows, the single-window guard before typing, the send verdict, unit tests, one staging check.
- Out of scope: the data-service and Unibox changes, the brain side (`FAILED`/`NOT_SENT` handling stays unless Q3 changes it), a new driver call, a reply task, new selectors.

## Root cause (from the code, 2026-11-05)

1. The press loop in [send.ts](apps/spider/src/tasks/linkedinMessage/send.ts) waits only about 12 looks (roughly 11 to 19 s) for a window, then presses Message again. The window is drawn 20 s or more after a press on a slow proxy, so the second press opens a second compose window.
2. `ownIndex` counts a window only when its box is drawn (`composer.present`). A window that is still drawing counts as "nothing open", so the loop presses again even though a window is already coming.
3. The loop starts with an empty page, so it presses Message even when an earlier run left this person's window open. That press adds a duplicate.
4. `closeOtherWindows` runs once, after the press loop. A window drawn after it is never closed.
5. `hands.clickSelector(WINDOW_COMPOSER)`, `hands.clickSelector(send)` and `parseMessageWindow` take the first matching window, not the window for the person. With two windows open the typing, the send press and the reading can hit different windows.
6. `confirm` in [messageBox.ts](apps/spider/src/linkedin/messageBox.ts) returns `NOT_SENT` when the words are still in the box and no 4xx answer came. That is a guess: the send may have gone in another window. The hard rule says `UNKNOWN`.

Evidence: issue #198 (run `4c9033cc`, 2026-11-04: presses at 53, 76, 98 s, duplicate windows in `failure.html`); the three earlier `NO_COMPOSER` runs on the same account came from the same loop (MEMORY, 2026-11-04).

## Approach

- [x] 0. Kept run `4c9033cc` read (2026-11-06, from the bucket, before the fix): Message pressed at 53 s, 77 s and 99 s (about 22 s apart), box clicked at 110 s, 133 characters typed in 28 s, send at 143 s, verdict FAILED at 160 s. The window's arrival time is not in the timeline (it is in the run's logs). (`result.json`, `timeline.json`, `failure.html`, `logs.json`): which window holds the typed words, which one got the send click, and the time from press to window. Record the findings in the plan.
- [x] 1. Tests first in [send.unit.test.ts](apps/spider/src/tasks/linkedinMessage/send.unit.test.ts):
  - a window that draws after the old budget (about 30 s of looks) gets exactly one press and one typing;
  - a window that is open but whose box is not drawn yet gets no second press;
  - a window for this person left open before the run gets no press at all;
  - a late duplicate window is closed before typing, and nothing is typed when it cannot be closed;
  - words still in the box after a send with no 4xx answer give `UNKNOWN`;
  - a 4xx answer still gives `NOT_SENT`;
  - the existing cases stay green (press again when nothing opens; no more than the press limit when no window ever opens; send once).
- [x] 2. Close stale windows before the first press, not only after the loop (`closeOtherWindows` moved up; keep its `MAX_CLOSES`).
- [x] 3. Press Message once, then wait for any window (drawn or not). Press again only when no window of any kind is open after the wait, up to the limit from Q2. Once a window shows, wait for its box without pressing.
- [x] 4. Before typing, require exactly one open window and that it is for this person (`windowIsFor`); otherwise `NO_COMPOSER` or `WRONG_RECIPIENT`, nothing typed.
- [x] 5. In `confirm`, `NOT_SENT` only on a 4xx answer. Words still in the box with no answer become `UNKNOWN`. Update `answer.ts` text if the verdict copy changes.
- [x] 6. Update the comments at the top of the loop (a short line each) and [MEMORY.md](MEMORY.md) (the cause and the staging result).
- [ ] 7. Staging check: one queued message to a first-degree connection with the new build; read `timeline.json` to confirm one press and one window.

## Edge cases and risks

- A message sent twice is the worst failure. The fix must not add a send path: `markAttempt()` stays before the first keystroke, and only one send press remains.
- Presses before `markAttempt()` are not guarded by it. A redelivered command can press Message again and open a window, but cannot send. A window left open by that is handled by the stale-window close.
- Opening a profile's Message link many times looks automated to LinkedIn. Fewer presses are better; Q1 and Q2 trade run time against duplicates.
- Waiting 45 s per attempt makes each run longer. A slow page can push the task past its time limit (Q5). The account's browsing budget counts that time.
- Concurrency: one account runs one task at a time (the account lease), so two windows from two runs of the same account should not happen; a window from a manual session in another tab can still appear, and the single-window guard covers it.
- Idempotency: a run that answers `UNKNOWN` must never be retried by brain or the worker (check that a `FAILED`/`NOT_SENT` answer is not retried automatically either).
- Existing data: none; no migration.
- Dev vs production: none; the change is in the spider only. Docker: the spider worker image is rebuilt and the worker restarted so brain sees the task (no new task name).
- CI: spider unit tests and lint only; no integration test covers the window.
- Rollback: revert the commit; nothing stored changes.

## Verification

- `pnpm --filter @automatedLinkedIn/spider test:unit:run` for the new and existing send tests, then the repo gate `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` (contracts `build:lib` first if the root run fails on stale dist).
- No new driver call, so no e2e stand-in is needed.
- Staging: one real run on a queued message; the run folder shows one `Message` press and one window, and the verdict matches what LinkedIn shows.
- Not run by the agent: a live LinkedIn run (needs the owner's account and the staging worker).

## Outcome

- Shipped (spider only): one press, then up to 45 s (30 looks) for any window; at most 2 presses, and only while no window is open; a window for this person left open is kept and not pressed again; stale windows are closed before the first press; more than one window open before typing is refused (`WRONG_RECIPIENT`, nothing typed); a late duplicate is closed after the box shows; the box wait is 20 looks. A send is `NOT_SENT` only when LinkedIn refused it (4xx); words left in the box with no answer are `UNKNOWN`. Files: `linkedinMessage/send.ts`, `linkedin/messageBox.ts` (exports `refusedBy`), `linkedinMessage/send.unit.test.ts`.
- Deviation: the shared `confirm` still says `NOT_SENT` for words left in the box, so `linkedin-reply` keeps its verdict and tests; the UNKNOWN rule is applied in the message task only. Say if the reply task should follow.
- Checks run: `pnpm lint`, `pnpm ts:check`, `pnpm test:unit:run` (1,371 passed), `pnpm build` all pass; send tests 57 passed (message and reply). One real-browser e2e test (`readMessages`, not related) timed out once in a focused run.
- Time limit (Q5): `timeoutMs` is 5 min. Worst estimated path about 4 min. `budget.estimateS` stays 90 (it settles to the measured browser time).
- Deployed: PR 202 merged (merge commit `13c051e`, 2026-11-06 03:22 UTC), staging deploy run `42156153935` succeeded. No `linkedin-message` run has been made since the deploy (the newest kept run is from 2026-11-04), so step 7 is pending a real first message.
- Not run: step 7 (staging run). Follow-ups: check what the runner answers when the 5 min limit hits after send was pressed (should be UNKNOWN, not a retry); check that the budget estimate of 90 s still fits.
