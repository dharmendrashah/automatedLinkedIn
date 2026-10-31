# Invite with a note, else without: the free-notes fallback

- Status: in progress (built and tested; the live devtools and staging runs are still to do)
- Created: 2026-10-31
- Locked by user: yes, 2026-10-31 (answers below)

## Goal

An invite asked with a note from an account that has used its free custom notes for the month is not sent today: the task presses Add a note, LinkedIn shows a Premium upsell instead of the note box, and the invite ends `NOTE_REFUSED` ("LinkedIn gave no place for the note… Nothing was sent."). Instead, the task tries the note first and, when LinkedIn refuses the note, sends the same invite without a note and says so in `invites.json`.

## Evidence (staging run `e137a154-8108-4622-b28b-bca9d6a77e13`, 2026-10-31, account of user `01a127bf…`, invite `01a190c5…` to Harshit Srivastava)

- Video (contact sheet of the last 30 s): Connect opened "Add a note to your invitation?" with Add a note and Send without a note. Add a note replaced that window with a modal "Send unlimited personalized invites with Premium" ("You're out of free custom notes…", "Reactivate Premium", a close X). Escape closed it; the profile was back with Message, Follow, More and no invite pending.
- Kept page `files/note-1.html` (the modal open): `#artdeco-modal-outlet` → `div[data-test-modal-id="modal-upsell"]` → `div[role="dialog"].artdeco-modal.modal-upsell` (`aria-labelledby="modal-upsell-header"`), with `button[aria-label="Dismiss"]`. The words "You're out of free custom notes" are in it. This modal is in the light DOM, not the `#interop-outlet` shadow root the invite window uses.
- `network.json`: no `verifyQuotaAndCreate` request, so Add a note alone sent nothing.
- The HTML pasted in chat came through empty; the kept page above is used instead.
- Not seen: what happens after Dismiss (does the invite window come back, or must Connect be pressed again); the upsell in another language or layout; the note-box path when a free note is left on a second account.

## Requirements

Confirmed (2026-10-31, owner): an invite with a note tries the note; on an error, it goes on without the note; `invites.json` says what happened. And:

1. Only LinkedIn refusing the note before Send falls back (the "out of free custom notes" upsell, or no note box). A refused or unclear Send is never pressed again.
2. Once the notes are out, the rest of the run sends without the note straight away.
3. Brain remembers per account that the free notes are used up until the 1st of next month (`LinkedInAccount.notesOutUntil`, additive migration); `dispatchNext` drops the note until then.
4. No "only with the note" option: every invite falls back.
5. The invite shows as Sent with the reason "Sent without the note: no free notes left this month." and keeps the note as written.

Open questions: none.

## Scope and non-goals

- In scope: the task's note path, a new outcome `SENT_WITHOUT_NOTE` in `invitesFileSchema` (contract 2), the task `version` 2, brain's handling of the outcome (state, reason), unit tests, a fixture of the upsell.
- Out of scope: Premium detection; retrying a refused or unclear Send; a per-invite "note required" switch (question 4); notes longer than 200 characters.

## Approach

Design:

- `markup.ts`: `NOTE_UPSELL = '[data-test-modal-id="modal-upsell"]'`, `NOTE_UPSELL_DISMISS = '[data-test-modal-id="modal-upsell"] button[aria-label="Dismiss"]'`, and the words `/out of free custom notes/i` as a second anchor (dated 2026-10-31, the run above).
- `inviteReader.parseInviteDialog` gains `notesOut: boolean` (the upsell or its words).
- `run.ts` `throughDialog`, note path: after Add a note, wait (bounded) for the note box or the upsell. On the upsell or no box: Dismiss (fallback Escape), mark `notesOut` for the run, press the person's Connect again (the same `pressConnect`/More path), and in the window press Send without a note; confirm as today; the outcome is `SENT_WITHOUT_NOTE` when confirmed, else what `confirmSent` says. `markAttempt` stays once per run, before the first Connect (Add a note and the upsell send nothing, checked in `network.json`).
- Later invites of the run with `notesOut` go straight to Send without a note and answer `SENT_WITHOUT_NOTE`.
- Contracts: `INVITE_SEND_OUTCOMES` gains `SENT_WITHOUT_NOTE`; `INVITES_CONTRACT_VERSION` 2; the task `version` 2 (an older brain would reject the new outcome).
- Brain `inviteRules.sendChange`: `SENT_WITHOUT_NOTE` → state `SENT`, `invitedAt` set, reason "Sent without the note: no free notes left this month." Results and Today count it as sent. `LinkedInAccount.notesOutUntil` (additive migration) is set to the 1st of next month by the invite result, and `dispatchNext` sends the invites of an account without their note while it is in the future.

Checklist (from the spider-task-writer skill):

### 1. Plan

- [x] Plan exists in `.plan/` from `_template.md`; the goal says what a good run and each failed run look like.
- [x] Open questions are empty and the user locked the requirements.
- [x] Task name unchanged (`linkedin-invite`), input gains `notesOut`, verdicts unchanged, `version` 2.
- [ ] Is it a write task? Yes: the irreversible step is Send (with or without a note). Test account and audience for the live run: to agree with the owner (the account with no free notes left, a test person).

### 2. Lifecycle

- [x] The task assumes a signed-in feed at the start and does not repeat steps 1 to 4 (unchanged).
- [x] n/a: not one of the two exempt tasks.
- [x] Every page the task lands on is checked for the sign-in page; `SIGNED_OUT` is declared and answered (unchanged; the fallback stays on the profile and opens no new page).
- [x] Every SUCCEEDED verdict whose own check passed returns `commitSession: true` (unchanged; `SENT_WITHOUT_NOTE` counts as settled for DONE).
- [x] The task leaves the browser on a normal signed-in page (the offer is dismissed, Escape if Dismiss cannot be pressed).
- [ ] The task was run twice in a row on a test account; both run folders are complete. Not run yet.
- [ ] Each run folder holds the full set of files. Not run yet (the runner is unchanged).
- [ ] A deliberate failure was run once. Not run yet.
- [x] n/a: no run folder was found lacking a file.

### 3. Evidence from the real page

- [x] Real markup of the upsell captured (kept page above, 2026-10-31).
- [x] Layout differences: only one account seen with no free notes left; said here and in `MEMORY.md`.
- [x] Selectors are plain CSS in `markup.ts` with the date (`NOTE_UPSELL`, `NOTE_UPSELL_DISMISS`, `NOTES_OUT_WORDS`); no generated class names.
- [x] Unverified, listed: the page after Dismiss (both shapes are handled: the window still open, or the profile), the offer on other accounts or languages.

### 4. Tests first

- [x] Fixture `notesOutMarkup` (`linkedin/inviteFixture.ts`, structure only).
- [x] Reader tests: offer by outlet, by words only, absent next to the note box.
- [x] Task unit tests: note sent (existing); notes out, sent without the note and the rest of the run skips the note; `notesOut` from brain skips it from the start; Dismiss leaves the window open; Dismiss cannot be pressed (Escape); Pending after the offer is `UNSURE` and stops; `SIGNED_OUT` and a repeated command (existing). Not written: "second Connect not found" (the same `pressConnect` path as the first, tested already).
- [x] Write task: nothing is typed when the note is refused; Send is pressed once per invite (`send` calls counted).
- [x] n/a: no new driver call.
- [x] n/a: no new page shape beyond the kept one.

### 5. Build

- [x] Folder unchanged; `version` 2.
- [x] `defineTask` fields complete (`verdicts` unchanged, description mentions the fallback).
- [x] `markAttempt()` still asked once before the first Connect; an unclear Send is `UNSURE`, never retried.
- [x] Waits are bounded loops (`until` with `DIALOG_LOOKS` / `MENU_LOOKS`).
- [x] Pacing: `reader.wait(PAUSES.step)` after Dismiss and before the second Connect.
- [x] Fixed sentences only; the note's words never reach the log or files.
- [x] Failed runs keep their final page through the runner (unchanged); the offer page is kept as `note-*.html`.

### 6. Brain side

- [x] Contracts: `SENT_WITHOUT_NOTE`, input `notesOut`, contract 2 (files of contract 1 still read); `dist` rebuilt.
- [x] `inviteRules.sendChange` and `notesBackAt` with tests; `store` sets `notesOutUntil`, `dispatchNext` sends `notesOut` (integration test). `taskHooks` unchanged.
- [x] Verdict labels unchanged.
- [ ] The spider worker restarted so brain sees version 2: at deploy.

### 7. Verify

- [x] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` pass with no warnings (only Vite's existing chunk-size note).
- [ ] Devtools run on the account with no free notes left: an invite with a note ends `SENT_WITHOUT_NOTE`. Not run (needs the owner's go and a test person).
- [x] The failed staging run was read from `files/`, `network.json`, `timeline.json` and the video.
- [ ] Staging run: after deploy.

### 8. Close

- [ ] Plan `done`: after the live run.
- [x] `MEMORY.md`: the offer markup (account, date), the fallback rule, what is still not seen live.
- [x] Conventional commit; no recordings or secrets.

## Edge cases and risks

- **Double invite:** the fallback presses Connect a second time. Safe only because Add a note and the upsell send nothing (seen in `network.json`). Before the second press the task checks the profile: if it already shows Pending, something went that we did not see, and the invite is `UNSURE` (nothing pressed).
- **Upsell shape changes:** words and the `data-test-modal-id` are both anchors. With neither and no note box, the invite still falls back (requirement 1), but the run does not mark the notes out.
- **Dismiss leaves the invite window open** (not seen): the reader finds Send without a note in it and presses it; no second Connect.
- **The note matters to the owner:** sending without it changes the message. The reason sentence says so in History and the invite list.
- **Weekly invite limit** after the fallback: `LIMIT_REACHED` as today.
- **Older brain:** version 2 and contract 2 keep an old brain from misreading the new outcome; deploy brain first.
- **Rollback:** revert the task and brain; existing invites keep their states.

## Verification

- Unit and reader tests above; `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- A devtools run on the account that has no free notes, invite with a note to a test person; then staging.

## Outcome

- Built (branch `feat/invite-note-fallback`): contracts 2 (`SENT_WITHOUT_NOTE`, input `notesOut`), the task's fallback (`throughDialog` answers `NO_NOTE`, `withoutNote` sends from the open window or presses Connect once more), version 2, brain's reason and `notesOutUntil` (migration `20261031150000_invite_notes_out`).
- The task no longer produces `NOTE_REFUSED`; the outcome stays in the contract for old files.
- Still to do: a devtools run on the account with no free notes left, then staging; mark the plan `done` after.
