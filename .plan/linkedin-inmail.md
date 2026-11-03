# Spider task linkedin-inmail: message a Premium member who accepts messages from anyone

- Status: locked
- Created: 2026-11-03
- Locked by user: yes, 2026-11-03

## Goal

A new spider task, `linkedin-inmail` (spider only for now), that opens the profile of one person the account is not connected to, presses the profile's Message link, checks the window that opens is LinkedIn's InMail window for that person, types an optional subject and the message at a person's pace, presses send once, and says whether it went.

A good run: `SENT`, the window shows the message, nothing was spent unless the owner allowed it. A failed run never leaves words in a box and never sends twice: no Message link, a window that is not an InMail window, a banner that says a credit would be spent, a window for someone else, a box that does not draw, a send that stays disabled, a send that is not accepted, signed out, and "pressed, outcome unknown" are each their own verdict, with one fixed sentence.

Nothing in this task reads other members in bulk: it acts on one person the owner chose, from the owner's own account, one message at a time.

## What was seen on the real page (recorded 2026-11-03, devtools "Record a session", local, tripti.verma, English, free account, through a proxy)

Session folder: `apps/spider/.devtools-recordings/session-2026-11-03T08-44-40-796Z` (21 steps, 349 network calls). The person was a second-degree member whose profile says "Profile enhanced with Premium". During the recording a real message was sent from that account to that member (nothing came from the task).

Seen (kept pages: `step-9.html`, `step-11.html`, `step-21.html`):

- The profile's own Message link is `a[href*="/messaging/compose/?profileUrn=...&recipient=...&screenContext=NON_SELF_PROFILE_VIEW&interop=msgOverlay"]` with no `aria-label` (the same link `PROFILE_MESSAGE` already finds: `a[href*="/messaging/compose/"]:not([aria-label])`). The Message links of other people on the page carry `aria-label="Message <name>"`. The top card showed Follow, Message and Visit my website, and no Connect.
- Pressing it opens a window over the profile, address unchanged: `[data-view-name="message-overlay-conversation-bubble-item"]` (the same `MESSAGE_WINDOW`) with the extra class `msg-overlay-conversation-bubble--inmail`, role dialog, header `h2.msg-overlay-bubble-header__title` reading "New message", and a form `.msg-inmail-compose-form-v2`.
- The person is shown as a card, not a chip: `.msg-compose__inmail-compose-entity-lockup a[href="/in/<slug>/"]`. There is no `.msg-connections-typeahead__added-recipients` chip, so `windowIsFor` as written for `linkedin-message` would refuse this window.
- A banner `section.msg-inmail-credits-display p` reads "Free message | Why?" (a free message to a member who left their profile open to messages). What it reads when a credit is spent was not seen.
- Subject: `input[name="subject"]` inside `.msg-form__subject`, placeholder "Subject (optional)". Body: `.msg-form__contenteditable[contenteditable="true"][role="textbox"]`, `aria-label="Write a message…"` (the same `COMPOSER` as a conversation). Send: `button.msg-form__send-btn[type="submit"]`, disabled until there are words. This is not the conversation's `button.msg-form__send-button` (`SEND_BUTTON`), so the existing selector does not fit.
- Calls the page made on opening: `GET voyagerMessagingDashComposeOptions/urn:li:fsd_composeOption:(<member>,NON_SELF_PROFILE_VIEW,EMPTY_CONTEXT_ENTITY_URN)`, `GET voyagerMessagingDashCredits`, `GET premium/featureAccess`. The send was one `POST voyagerMessagingDashMessengerMessages` answered 200, then two acknowledgements answered 204. The recorder keeps no query strings, so whether the send carries `action=createMessage` (the text `SEND_REQUEST` waits for) is not known.
- After send the same window becomes a conversation window: the `--inmail` class and the banner are gone, and the message shows as `li.msg-s-event-listitem` with `h3.msg-s-event-listitem__subject` and `p.msg-s-event-listitem__body`.
- Pressing Message twice left a second minimised "New message" bubble at the bottom of the page.

Not seen (listed as unverified, and the task keeps the page it cannot read):

- What the banner says when a credit would be spent, the credit count, and whether the send then asks for more. Only a free message was seen.
- A member who does not accept messages: whether the profile shows no Message link, a Message link that opens an upgrade dialog, or something else. Only one account (free, English) and one open profile were seen.
- A first-degree connection: the Message link then opens an ordinary conversation window (`linkedin-message` territory); not seen here.
- The limits on subject and body length, and whether Enter inside the box sends or starts a new line for this window.
- A second layout (an account whose profile page has no `data-view-name`, as seen for `linkedin-message` on 2026-10-29).
- Whether a window left open by an earlier run comes back when a profile opens.

## Requirements

Confirmed (from the request):

- A new spider task called `linkedin-inmail`.
- It sends a message to a Premium member who accepts messages from people they are not connected to.
- Planned in spider only.

Decisions (owner answers, 2026-11-03):

- Free only, always: like Send connection request, Send message and Reply, the task sends only the free message to a member who is open to messages. It never spends a credit. A banner that is not "Free message" stops the run with `WOULD_COST_CREDIT` and nothing typed. No paid path is planned, so no Premium sender is needed.
- Input: `{ slug, subject?, text, files, uploadId? }`. The profile address after /in/, an optional subject (up to 200), the words (up to 1,900; may be empty when there are files), and files as for a reply: images, documents, video and, as an experiment, audio (`replyFileSchema`, `MAX_ATTACHMENTS`, the upload kept by brain). No name input: the card linking to `/in/<slug>/` is the recipient check.
- Limits: subject 200 and words 1,900, until seen.
- Pacing: `oneAtATime: 'account'` and `cooldownMs: 120000`. The cooldown counts toward the account's daily caps, which are set in brain with the block.
- One line `'linkedin-inmail': { planned: '...' }` in `packages/contracts/src/workflow.ts` (and a contracts rebuild): the registry test needs it. The block comes in the workflow later.
- Live test: later, with a recipient the owner names. The task is built and tested offline first.

## Scope and non-goals

- In scope: `tasks/linkedinInmail/` (task, `answer.ts`, send flow, unit tests, files as in `linkedin-reply`); selectors for the InMail window in `linkedin/markup.ts` with the date; readers for the window, the banner and the sent message in `linkedin/messageReader.ts` (pure, with fixtures made from the recorded pages, structure only); reuse of `createMessageBox`, `createReader`, `createSession`, `handsOf`, `PACE` and `markAttempt`; one line in `tasks/registry.ts`; the `planned` line in contracts; `MEMORY.md`.
- Out of scope: the Account Actions block, "Act for real", limits and any brain code; paid InMail (never planned); reading who accepts InMail or finding such members; handing the new conversation over to brain (the member is not in the owner's connections, so there is nothing to import; later); attachments and images; sales tools.

## Design

Input `{ slug, subject?, text, files, uploadId? }` as above. Name `linkedin-inmail`, version 1, `needs: { proxy: 'required', account: true }`, `hosts` the LinkedIn host, `budget { estimateS: 90, class: 'ACTION' }`, `policy { cooldownMs, oneAtATime: 'account' }`, `limits { timeoutMs: 5 min }`, `recording: { always: true }`. The task is a sibling of `linkedin-message`, which stays unchanged.

Flow, after the runner has opened a signed-in feed:

1. Open `/in/<slug>/`. A sign-in page is `SIGNED_OUT`; an address that is not a profile is `NOT_AVAILABLE`.
2. Wait in a bounded loop for the profile's own Message link (`PROFILE_MESSAGE`). None is `NO_MESSAGE_BUTTON` (the profile is not open to messages, or a layout not seen). Press it once.
3. Wait in a bounded loop for the InMail window (`MESSAGE_WINDOW` with `--inmail`). A window that never opens is `NO_COMPOSER`. A window that opens without `--inmail` is an ordinary conversation (the person is a connection): `NOT_INMAIL`, nothing typed.
4. Check the window is for the person: exactly one InMail window, and its card links to `/in/<slug>/`. Anything else is `WRONG_RECIPIENT`, nothing typed.
5. Read the banner. "Free message" goes on. Anything else is `WOULD_COST_CREDIT`, nothing typed (v1).
6. `markAttempt()`. A command delivered again answers `UNKNOWN` without typing.
7. Click the body box. With files, fetch them from the upload, give images to the window's image input and the rest to its file input (`hands.attachFiles`, scoped to the InMail window), and wait until the box stops changing (as `linkedin-reply` does); `NO_FILES`, `ATTACH` and `UPLOAD` are `FAILED` reasons. Then click the subject box and type the subject when there is one, click the body box and type the text, both through `typeKeys` at a person's pace. Check the box holds words.
8. Wait for `button.msg-form__send-btn` to come alive. A disabled button is `FAILED / SEND_DISABLED`, the box is cleared.
9. Start listening for the send request, press send once (`FAILED / SEND_NOT_CLICKED` if it cannot be pressed), then confirm: the window has become a conversation whose newest message is ours and holds the body words, or LinkedIn answered the send request with success; a refused request is `FAILED / NOT_SENT`; neither is `UNKNOWN`.
10. Leave the page signed in; the runner saves the session on `SENT`.

Verdicts (declared with a label and tone, one fixed sentence each, never page content): `SENT`, `UNKNOWN`, `FAILED`, `NO_MESSAGE_BUTTON`, `NOT_INMAIL`, `WOULD_COST_CREDIT`, `NO_COMPOSER`, `WRONG_RECIPIENT`, `NOT_AVAILABLE`, `SIGNED_OUT`, `ERROR`.

Shared code: the file fetch and upload wait follow `linkedin-reply/send.ts` (a small shared helper only if the copy would be exact); `createMessageBox` already takes the box, send and scope selectors, so the InMail task passes `INMAIL_COMPOSER` (the same `COMPOSER` inside the InMail window), `INMAIL_SEND_BUTTON` and `INMAIL_WINDOW`. The subject box and banner are small new readers. No change to `linkedin-message` or `linkedin-reply`.

## Approach

Each step starts with failing tests. Copy of the spider checklist (`.github/skills/spider-task-writer/assets/checklist.md`):

- [x] 1. Fixtures: `linkedin/inmailFixture.ts` (structure only, no names or text) for the profile with its Message link, the InMail window (free banner, empty), the same with a typed box and live send, the window after send (subject and body message), and a banner that names a credit (made up, marked unverified). Reader tests for each.
- [x] 2. Selectors in `linkedin/markup.ts` with the date (2026-11-03, tripti.verma): `INMAIL_WINDOW`, `INMAIL_RECIPIENT`, `INMAIL_BANNER`, `INMAIL_SUBJECT`, `INMAIL_COMPOSER`, `INMAIL_SEND_BUTTON`, `SENT_SUBJECT`; plain CSS only.
- [x] 3. Readers in `linkedin/messageReader.ts`: `parseInmailWindow(html)` (open, inmail, recipient links, banner kind `free` or `other`, subject box, composer state, messages), tested pure.
- [x] 4. Task unit tests with the hands mocked: SENT; words only, files only, words and files, a subject; each verdict (and `NO_FILES`, `ATTACH`, `UPLOAD`); sign-in page on the profile and in the middle; page that never draws; Message link absent; window never opens; ordinary window; two windows; wrong recipient; credit banner; box that does not take words; send disabled; send not pressable; request refused; request accepted with no window change (UNKNOWN or SENT as decided); command delivered twice; nothing typed or pressed before the window, recipient and banner are confirmed; send pressed at most once.
- [x] 5. Build `tasks/linkedinInmail/` (`index.ts`, `send.ts`, `answer.ts`), one line in `tasks/registry.ts`, the `planned` line in contracts, rebuild contracts.
- [x] 6. Offline gate: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- [ ] 7. Live, with the owner's go-ahead: devtools "Run a task" on the test account and recipient the owner names; read the run folder; fix what it shows; run once more for the saved session; record the credit banner when a Premium sender account is available. (not done: waits for the live run)
- [x] 8. `MEMORY.md`, this plan's Outcome.

Checklist boxes (tick or write n/a with a reason before `done`):

### 1. Plan

- [x] Plan exists in `.plan/` from `_template.md`; the goal says what a good run and each failed run look like.
- [x] Open questions are empty and the user locked the requirements.
- [x] Task name chosen (permanent), input and verdicts listed, `version` set.
- [x] Write task: the irreversible step is Send, named; the test account (tripti.verma) and recipient are agreed. The recipient is still to be named by the owner for the live run.

### 2. Lifecycle

- [x] The task assumes a signed-in feed at the start and does not repeat the runner's steps 1 to 4.
- [x] Not an exempt task (it needs an account); follows every lifecycle step.
- [x] Every page the task lands on is checked for the sign-in page; `SIGNED_OUT` is declared and answered.
- [x] Every SUCCEEDED verdict whose own check passed returns `commitSession: true`.
- [x] The browser is left on a normal signed-in page (the window is closed or the profile left as it is, never a half-typed box).
- [ ] Run twice in a row on the test account: the second run started signed in from the saved session and profile; both run folders complete. (not done: waits for the live run)
- [ ] Each run folder holds `timeline.json`, `network.json`, `logs.json`, `screenshots/` (with `final.png`), `video.webm`, `result.json`, `session.json`, `files/input.json`; a failed run also `failure.html`. (not done: waits for the live run)
- [ ] A deliberate failure (a selector that cannot match) was run once and the run folder alone shows why. (not done: waits for the live run)
- [ ] A missing file in a run folder was fixed in the runner or recorder, with a test. (not done: waits for the live run)

### 3. Evidence from the real page

- [x] Real markup of the profile, the InMail window and the sent message captured (this plan: 2026-11-03, tripti.verma).
- [ ] Layout differences looked for: only one account (free, English) was seen; the second layout and a Premium sender are listed as unverified.
- [x] Each selector is plain CSS, lives in `linkedin/markup.ts` with its date and does not rely on generated class names (the profile page's hashed classes are never used).
- [x] Anything not seen is listed as unverified (above and in `MEMORY.md`).

### 4. Tests first

- [x] Fixtures for each page shape and variant; reader tests; task tests (list in step 4 above).
- [x] Write task: nothing typed or pressed before the box and button are confirmed; Send pressed at most once.
- [x] New driver call: none planned (uses `clickSelector`, `typeKeys`, `html`, `watchAnswers`, `scrollOver`, `scrollBy`, `press`); n/a unless one is needed.
- [ ] Real-browser `*.e2e.test.ts` stand-in for the new window shape, if the live run shows one is needed. (not done: waits for the live run)

### 5. Build

- [x] `tasks/linkedinInmail/` exports `TASK_NAME` and `createLinkedinInmail(config)`; one line in `tasks/registry.ts`.
- [x] `defineTask` fields complete: `needs`, `hosts`, `verdicts`, `retryOn` (none: a send is never retried), `budget`, `policy`, `limits`, `recording`.
- [x] `markAttempt()` just before typing; unclear outcome after it is `UNKNOWN`.
- [x] Waits are bounded loops; a slow page is not read as empty.
- [x] Pacing uses `pause`, random gaps, `policy` and `budget`.
- [x] Messages are fixed sentences; no page text, no words the owner wrote, no name, no secrets in the log, result or files.
- [x] A failed run keeps its final page through the runner; the task `attach`es a page only when it needs one from the middle (a banner it cannot read).

### 6. Brain side

- [x] Input and report schemas in `packages/contracts`: n/a for v1 (no brain use yet); the input is validated by the task's own schema.
- [x] `taskHooks.ts` entry: n/a, the task changes no brain data in v1.
- [x] Verdict labels parse in the catalog (`registry.unit.test.ts`).
- [x] `ACCOUNT_ACTION_TASKS` line: `planned` (one line in contracts; block later).
- [ ] The spider worker is restarted so brain sees the task. (not done: waits for the live run)
- [x] Task events: n/a, nothing branches on it yet.

### 7. Verify

- [x] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` pass, no warnings.
- [ ] Devtools run on the test account; result and run folder noted. (not done: waits for the live run)
- [ ] Failed runs read from `logs.json`, `timeline.json`, `files/` and the video, not guessed. (not done: waits for the live run)
- [x] Staging: not planned for v1; written down.

### 8. Close

- [ ] Plan `done`, Outcome filled in. (not yet: the live run is open)
- [x] `MEMORY.md`: markup seen (account, date), gotchas, open items, one changelog line.

## Edge cases and risks

- **A real message to a stranger.** The only irreversible step is Send. `markAttempt()` comes before anything is typed; the banner, recipient and window are confirmed first; Send is pressed once; an unclear outcome is `UNKNOWN`, never a retry. The whole run is recorded (`recording.always`) so an unclear send can be looked at.
- **A credit spent by accident.** v1 sends only under the "Free message" banner. Any other banner text, or none, stops with nothing typed. The credit banner has not been seen, so "anything but Free message" is the safe reading, and a Premium recording must come before a paid path.
- **A wrong window.** A leftover window from an earlier session, two windows, or a window for someone else: the selectors are scoped by the `--inmail` class, exactly one such window is accepted, and its card must link to `/in/<slug>/`. A normal conversation window (a connection) is `NOT_INMAIL`.
- **A profile that cannot be messaged.** No Message link is `NO_MESSAGE_BUTTON`. A link that opens an upgrade dialog or a window with no box is `NO_COMPOSER`. Both leave the final page for reading (`failure.html`); neither has been seen.
- **The wrong send selector.** `SEND_BUTTON` (`msg-form__send-button`) is the conversation's; this window uses `msg-form__send-btn`. Reusing the old one would end in `NO_COMPOSER` with nothing typed (the existing reader needs both box and button), so it fails safe, but the new constant is needed.
- **Confirming the send.** The existing `SEND_REQUEST` waits for `action=createMessage` in the URL; the recorder drops query strings, so it may not match this send. The page itself (window turns into a conversation, newest message ours with the body words) decides first, as for `linkedin-message`; the request is the fallback and gets a looser match (`voyagerMessagingDashMessengerMessages` and POST) if the live run shows the query is missing.
- **Files.** The InMail window lists the same two hidden inputs as a conversation (`accept="image/*"` and the document and video list, recorded 2026-11-03), so the same selectors, scoped to the window, are expected to work. Whether a free message accepts files, and audio (not in the list), are unverified; a refusal is `FAILED / ATTACH` or `UPLOAD` and nothing is sent. Files are fetched into a temporary place and removed in `finally`; their names never reach the log.
- **Subject in the message.** After send the subject is a separate `h3`, so the "newest message holds the words" check compares the body only.
- **Multi-line text and Enter.** If Enter sends in this window, a text with line breaks could send early. The conversation task has the same exposure; the live run must show the behaviour, and until then the plan treats a line break in `text` as unverified (a test refuses nothing; the live check decides).
- **Slow pages.** Through a proxy a profile can take 15 to 30 s and the window a few seconds: bounded looks (20 and 12), never `ERROR` on a first look.
- **Privacy.** Names, subject and message are never logged or put in the result; messages are fixed sentences; fixtures hold structure only. The recorded pages hold a real member's name and photo: they stay in `.devtools-recordings` (ignored by git) and are not copied into fixtures.
- **Compliance.** One member at a time, from the owner's own account, at the owner's choice; no bulk reading of members, no evasion of LinkedIn's limits, and the credit or message limits LinkedIn shows are never worked around. Daily caps belong in brain with the block.
- **Spider restart.** A worker started before the task existed must be restarted or brain answers `TaskUnavailableError`; nothing in brain calls the task until a block exists.
- **Rollback.** Remove the registry line and the contracts `planned` line; nothing else reads them.

## Verification

- Offline: unit tests per verdict with the hands mocked, readers against fixtures, then `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root.
- Real path (needs your go-ahead): devtools `pnpm record` option 2, "Run a task", `linkedin-inmail`, on tripti.verma with a recipient you name; read `result.json`, `timeline.json`, `logs.json`, the video contact sheet and `files/`; then a second run to check the saved session. What was not run live is written in `MEMORY.md`: the paid banner, a profile that cannot be messaged, the second layout.

## Live run 1 (devtools, 2026-11-03, run 96db1845, tripti.verma through a proxy, davidarnoux)

`NO_COMPOSER` after 31 s, nothing typed (as designed). Cause: the second layout. The Message link led to the whole `/messaging/compose/` page (a `div.msg-convo-wrapper.msg-thread` with the same `.msg-inmail-compose-form-v2` form, banner "Free message | Why?", subject, box, send `msg-form__send-btn`), not the window over the profile, and the reader looked only for the window. Fixed: the task works in `.msg-inmail-compose-form-v2` (in both layouts), waits 20 looks, and reads the sent message from the window or from the conversation page. Checked offline against the kept page of that run and the first recording. Still to run live again.

## Live run 2 (devtools, 2026-11-03, run cbfe04bb)

`SENT`, but the words were wrong: the box held "we provide that, if can we" of "we provide that, if can we have a chat later on" right after typing, and the message that went read "we provide that, if we". The editor dropped key presses (typing the whole text in one go, 45 to 115 ms per key, on a slow page) and the task never read the box back. LinkedIn's page did not show the sent words as asked, so the send-request fallback answered `SENT`. Fixed: the words are typed in pieces of about 24 characters with a short pause; the box is read back and must hold the same letters (spaces and line breaks ignored) or it is emptied and typed once more, else `FAILED / TYPING` and Send is not pressed; and when LinkedIn's answer says it went but the conversation shows one message of ours with other words, the verdict is `DIFFERENT_WORDS`. The subject is not read back (the input's value is not in the markup).

## Live run 3 (devtools, 2026-11-03, run 136a8937, walid-boulanouar)

`NOT_INMAIL` after 30 s, nothing typed. The account already had a conversation with this second-degree member (an earlier message of ours is in it), so the Message link opened that conversation, with no box: LinkedIn showed `.msg-s-conversation-blocked-footer` ("Improve your chances of hearing back ... Verify now") in its place and opened a Premium offer (`.modal-upsell`, Dismiss button) over the page. Handled: a new verdict `CONVERSATION_BLOCKED` ("an earlier message may be waiting for a reply"), the Premium offer is closed (best effort, never changes the verdict), `NOT_INMAIL` now means an ordinary conversation that does have a box, and a window with neither box nor notice is `NO_COMPOSER`. The wait no longer runs all 20 looks for these cases. Checked against the kept page of the run. Why LinkedIn blocks the box (a reply is awaited, or the person does not accept free messages) is not proven.

## Owner's reading of run 3 (2026-11-03)

The member is not on Premium (or has not turned on InMail requests) and is not a connection, which is why LinkedIn gave the account no box. The verdict `CONVERSATION_BLOCKED` is therefore `NOT_ACCEPTING_INMAIL` ("Not open to InMail"): a conversation with a notice where the box would be, or LinkedIn's Premium offer opening with no box, means the member does not take messages from this account; nothing is typed and the offer is closed. `NO_MESSAGE_BUTTON` stays (a profile with no Message link), and its sentence now says the member may not take messages from people they are not connected to. The offer alone as a signal (no conversation) was not seen live; it follows the owner's description.

## Outcome

Built and tested offline (2026-11-03); the live run is still open, so the status stays `locked`.

Shipped:

- `tasks/linkedinInmail/` (`index.ts`, `send.ts`, `answer.ts`, `send.unit.test.ts`), one line in `tasks/registry.ts`, and `'linkedin-inmail': { planned: ... }` in contracts (dist rebuilt).
- `linkedin/markup.ts`: `INMAIL_*` selectors (dated 2026-11-03, tripti.verma). `linkedin/messageReader.ts`: `parseInmailWindow`, `parseComposer` takes the send button, `composerHtml` takes a scope. `linkedin/messageBox.ts`: optional `sendInside`. `linkedin/inmailFixture.ts` and `inmailReader.unit.test.ts`; `messagingFixture.ts` messages can carry a subject.
- Verdicts as planned, plus the reason `SUBJECT` under `FAILED` (no subject box, or the subject could not be typed). Gate green: lint, ts:check, 4 packages of unit tests (spider 1388), build.

Deviations: the recipient check needs every card link in the window to be the person's `/in/<slug>/` and at least one; a window that is not for a free message waits the full 12 looks before `NOT_INMAIL`; the "newest message" check starts from an empty window (`before` is empty) because the window for a free message holds no earlier messages.

Not run live (listed in `MEMORY.md`): the banner when a credit is spent (the `other` banner in tests is made up), a profile that cannot be messaged, a second layout, whether a free message takes attachments and audio, whether the send request carries `action=createMessage` (the match is loose and only counts when the page never shows the message), whether Enter inside the box sends, the subject and body limits (200 and 1,900 are the owner's numbers, not seen). Follow-ups: the live run on a recipient the owner names, the Account Actions block and daily caps in brain, restart of the spider worker.
