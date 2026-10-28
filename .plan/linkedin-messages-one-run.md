# LinkedIn messages: one run for the whole inbox, no refresh, only new messages after that

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-10-29
- Locked by user: yes, 2026-10-29, for Q1, Q2, Q4 and the sweep answer below (all the recommended options). Q3 (pace) was not asked; the default stands until the user says otherwise.

## Goal

A messages run (`linkedin-messages`) reads the whole inbox in one run and never reloads the page to recover from a click. After the first read, each run looks at the top of the list and reads only what is new or changed. A run that finishes with everything read is DONE, not PARTIAL.

## Evidence (run 00279106-9838-4f6e-9227-04133d3ec44b, account tripti.verma, 2026-10-28 20:33)

- Result PARTIAL "Read 19 conversations and 79 messages" after 631 s (10.5 min). The input was `limit 20, skip 0, known []` with no stop rule (`files/input.json`). That is brain's daily sweep (`messagesInput` with `sweep`: the newest `SWEEP = 20` rows, nothing passed as known), not the first read. So the sweep opens the newest 20 conversations every day even when nothing changed, marks them read, and ends PARTIAL, which the app shows as "Partly read" every time.
- 5 of 20 first clicks did not open a conversation (rows 3, 8, 9, 12, 15). Each one logged "The page stayed on the conversation before", then "Trying the conversation again", then a full `goto /messaging/`. That reload is the refresh seen in the app. Timeline: the click call returned ok, but the URL did not change.
- Likely cause of the wrong click (not yet confirmed in markup): `spot` picks a random point over the whole row link, and `NEVER_CLICK` does not name the row's selection checkbox. A click there ticks the row instead of opening it. The video at 2:17 shows "1 Selected" with a row ticked and the bulk toolbar on top. The first-click miss rate (5 of 20) fits this.
- Time per conversation is about 30 s: click about 1.3 s, polls, scrolling the thread to its first message (up to 80 scrolls at 0.9 to 2.2 s), then 3 to 9 s between conversations. The run stops starting new conversations after 20 minutes and times out at 25. At 30 s each, 100 conversations take about 50 minutes, so a whole-inbox run does not fit the current limits.
- Brain stores each message with a `linkedInId` (`LinkedInMessage`), so "only new messages" is possible without re-reading a whole thread.

## Requirements

Requested by the user on 2026-10-29 (not yet locked as a plan):

- The whole inbox is read in one run ("fully read at once"), not in batches.
- The wrong click and the refresh are fixed.
- Upcoming runs always look for new messages.
- The run is faster than 11 minutes for 20 conversations.

## Proposed approach (defaults, open for change)

1. **Click (done 2026-10-29, see "Confirmed cause").** Never click the row's checkbox or any element that selects (checkbox, label of a checkbox, the selection area). Click the row's text area, not a random point of the whole link. If a click does not open the conversation, do not reload the page; press the same row once more from the list, then go on with the next row.
2. **Whole inbox in one run.** No batch of 50 for the first read. The first read goes to the end of the list. Its time limit is raised to fit the inbox (about 30 s a conversation, so the limit is set from the number of rows seen), and the budget rule (no new conversation after the budget) keeps the same meaning.
3. **New messages only.** After the first read, the daily sweep and every other run start at the top, leave rows whose hash brain knows alone (the sweep passes `known` today it does not), read changed rows, and stop after 3 known rows in a row (as now). For a changed conversation, the thread is scrolled only until it reaches the newest message brain already holds (its `linkedInId`), not to the first message.
4. **Speed.** Shorter pauses between conversations for incremental runs. The first full read keeps the human pacing.
5. **Markup.** The row's selection checkbox is confirmed in a real page before the selector changes: one live inbox read with snapshots on (marks conversations read, as before).

## Answers (2026-10-29)

- Whole inbox in one run: yes (Q1).
- Daily sweep leaves rows brain knows alone: yes. Done in brain (`messagesInput`, sweep branch passes `known`; tests updated).
- Changed conversation: only the new messages (Q2).
- Live read with snapshots on tripti.verma to confirm the checkbox markup: yes (Q4). Run by the user with `pnpm record` on 2026-10-29 (run `966875f2`, DONE, 633.7 s): 18 conversations, the whole list ("Everything the list holds was gone through: Yes"), 3 "The page stayed on the conversation before" reloads (rows 2, 6 and 6 again, plus one "did not open" on row 6). Limit was 50, so one run covered the inbox.

## Confirmed cause of the wrong click (2026-10-29)

- Each row holds `div.msg-selectable-entity__checkbox-container` with an `input[type=checkbox]` and a `label.msg-selectable-entity__checkbox-label`, inside the row's link (checked in the kept `files/inbox.html`: all 10 checkboxes of the page are inside a row link).
- `NEVER_CLICK` named `input` but not the label, so a click on the label ticked the row and the page did not open the conversation.
- Real-browser probe on the kept inbox page (200 click spots on the first three rows): before the fix 20 of 200 spots were on the checkbox; after the fix 0 of 200, all 200 on the row's text.
- Fix: `NEVER_CLICK` takes `[class*="msg-selectable-entity__checkbox"]` (PR, branch `fix/messages-row-checkbox-click`); regression test in `markup.unit.test.ts` (fails without the fix).

## Open questions (answered above; Q3 pace still open)

- Q1: Should the first read go through the whole inbox in one run, lifting the 240-opens-a-day cap that was accepted for the 2-hourly read? (Default: yes.)
- Q2: For a changed conversation, read only the messages newer than the last stored one, or the whole thread? (Default: only newer.)
- Q3: Pace for incremental runs: about 15 s a conversation (shorter waits, more risk of LinkedIn noticing), or keep the human pace (about 30 s)? (Default: shorter for incremental runs only.)
- Q4: OK to run one live inbox read on tripti.verma with snapshots on, to confirm the checkbox markup? (Default: yes.)

## Scope and non-goals

- In scope: `apps/spider/src/tasks/linkedinMessages/read.ts`, `index.ts`, `linkedin/markup.ts` (row and checkbox selectors), `linkedin/messageReader.ts` if the row markup changes; brain's `messagesRefresh.ts` input (limits, stop rule) and the hook's DONE/PARTIAL handling; tests and fixtures from a real page (structure only).
- Out of scope: sending replies (`linkedin-reply`), the connections and invitations tasks, the visit task.

## Edge cases and risks

- Opening a conversation marks it read on LinkedIn, so a whole-inbox run marks everything read. The owner's accepted behaviour (Q1 of `.plan/linkedin-messages.md`); worth stating in the UI.
- A whole-inbox run is long: the worker lease and the 25 minute time limit must be raised, and a run that stops half way must still hand over what it read (today it does).
- Detection: more opens in one day. The current accepted cap is 240 a day.
- The checkbox fix is unconfirmed until the markup is seen (step 5). No selector change before that.
- Brain: `knownRows` and `messagesInput` need the newest `linkedInId` per conversation; the task input is limited to 8 KB.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root.
- Unit tests first: a click that does not open does not reload; a checkbox is never clicked; a changed conversation stops at the first stored message; a whole-inbox first read ends DONE at the end of the list.
- Real browser on the captured inbox page (structure only in the fixture).
- One live run on tripti.verma after the deploy: DONE, time per conversation recorded.

## Outcome

Filled in when done.
