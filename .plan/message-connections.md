# Message connections: start a conversation, or continue one, from the Unibox, the Connections page and a workflow block

- Status: locked, in progress (UI and UX first, on the sample source; brain, task and block follow)
- Created: 2026-10-29
- Locked by user: yes, 2026-10-29 ("lock it and start working on the UI and UX"; the assumed answers 5, 7 and 9 stand; the two people for the recording and the live-send agreement are still needed before steps 0 and 7)

## Goal

The owner can write to a first-degree connection of one of their accounts in two ways: start a new conversation with a person the account has not talked to, or continue one that exists. It works from the Unibox (a New message view), from the Connections page (the Message button), and from a workflow block that messages the people reaching it. Every message is typed into the account's own LinkedIn page at a human pace, once, inside limits, and a message that may have gone is never sent twice.

A good run: the message is typed and sent, LinkedIn shows it, the conversation appears in the Unibox with the real message, and the owner sees "Sent". A bad run says plainly what did not happen (signed out, not a connection, already talking, the account is resting, LinkedIn refused, not sure) and sends nothing twice.

## What exists (read from the code, 2026-10-29)

- Continuing a conversation is built: Unibox composer, `unibox.send`, `LinkedInReplyService` (queue, 40 a day, 30 s gap, wait reasons, sweep, dismiss), spider task `linkedin-reply` (opens `/messaging/thread/<id>/`, checks the name, types, presses send, confirms, hands the page over as `messages.json`), hook `linkedInReply.hooks.ts`, importer `message-import`. Files in replies are built too.
- Connections: `LinkedInConnection` rows per account (slug, name, headline, photo, `messageUrn`), read on demand by `linkedin-connections`; the page's Message button opens the Unibox conversation when one exists, otherwise LinkedIn's own message window in a new tab (nothing automated).
- Nothing opens `/messaging/compose/?profileUrn=...` in the spider. That page was never recorded; on the connections list the Message link only opened a bubble inside a shadow root.
- Workflow blocks that act on LinkedIn: `account.select` (pool), `account.visitProfile`, `account.visitCompany`, `account.writePost`. The visit blocks hand each person to the pool account that went longest without a visit and wait; `writePost` makes one `PostPublication` per run and waits up to one hour.

## Design

### Reuse, do not duplicate

- Table: extend `LinkedInReply` (queue, limits, gap, wait, dismiss, polling, sweep all work on it) instead of a second table. Migration, additive: `conversationId` becomes nullable, plus nullable `recipientSlug`, `recipientUrn`, `recipientName` (first name is enough for the check; full name kept for the page), `source` (`UNIBOX` default, `WORKFLOW`), `runId`, `nodeId`. A row with no `conversationId` is a first message; the importer fills `conversationId` once the new thread is stored (it knows the row by `sessionId`, and the run's `messages.json` holds exactly one conversation).
- Spider: a new task `linkedin-message` for the first message. The box, typing, send, confirm and hand-over code in `tasks/linkedinReply/send.ts` is moved into a shared module (`linkedin/messageBox.ts`) with its tests passing first, then used by both tasks. `linkedin-reply` keeps its name and input.
- Brain: `LinkedInReplyService.dispatchNext` picks the task by the row (`conversationId` set: `linkedin-reply`; else `linkedin-message`). One hook object serves both task names.
- Body: the Unibox composer, account picker, sending bubble and wait text are reused for the new view.

### Who can be messaged

First-degree connections only: a person who is a `CONNECTED` row of the chosen account in `LinkedInConnection` with a `messageUrn`. No free-text recipient, no profile that is not a connection, no InMail, no connection request with a note. Never a person on the owner's do-not-contact list (`Suppression`), in the app or in a block.

### Limits (constants in one place, unverified against LinkedIn's own)

- New conversations: at most 15 per account in 24 hours. Replies keep 40 a day. Both share the 30 s gap, the one-sending-per-account rule and the browsing budget (`BrowseBudgetError` keeps the message queued with its wait reason, as for replies).
- Text only, at most 4,000 characters (`REPLY_LIMITS.maxChars`).
- A workflow block messages at most 20 people per run per block (setting, default 10).

## UI/UX

Entry points:

1. Unibox toolbar: a "New message" button (key `C`, also in the palette). It opens a view in the right pane at `/unibox/new` (address may carry `?account=<id>&to=<slug>`), not a modal, so it keeps the Unibox layout (the empty pane today says "Pick a conversation").
2. Connections page: the row's Message button always goes to the Unibox: to `/unibox/<conversationId>` when a conversation exists, otherwise to `/unibox/new?account=<id>&to=<slug>`. "Open in LinkedIn" stays as a secondary menu item.
3. Unibox thread: unchanged composer (continuing).

New message view:

- From: the account (only ACTIVE accounts can be chosen; the others are listed grey with the reason). With one account it is preselected.
- To: a search box over that account's connections (name, headline, photo; 20 results at a time; keyboard: type, arrows, Enter). A person with a conversation shows "Already talking" and choosing them opens the thread instead. A person who is not a connection is not offered; the empty state says "Only people connected to this account can be messaged. Read the account's connections first" with a link to the Connections page. A person on the do-not-contact list shows disabled with the reason.
- Message: the same composer as replies, text only (Attach is hidden here, with a line saying why), counter 4,000, Cmd/Ctrl+Enter sends, Enter is a new line, draft kept on the device per account and person.
- Send holds 5 s with Undo, as replies do. Then the pane shows the person's header and the sending bubble ("Waiting for LinkedIn", wait reason and time when the account is resting, "Queued. You do not need to send it again."), and a placeholder row at the top of the list. When brain says the thread is stored, the pane moves to `/unibox/<id>` without a reload.
- Failed: the card with the sentence and Retry (a new message, same person) and Dismiss. Unsure: "It may have been sent. Check on LinkedIn first. Send again?" as replies do. Already talking (LinkedIn opened an existing thread): "You already have a conversation with X" and a button to open it, with the words kept as a draft in its composer; nothing is sent automatically.
- The tab title stays "Unibox" (no names in history). Labels on every field, focus moves to the message box after choosing a person, status changes are in a polite live region, the view works at phone width.

Workflow block form (see below): a message field with `{{firstName}}` and `{{name}}` chips, a live preview using a sample person, the character count, "If you already talk" (Skip or Continue the conversation), "At most N people per run". A preview run messages nobody and says how many would be messaged and why the others are skipped.

## Contracts (`packages/contracts`)

- `src/outreach.ts` (new): `MESSAGE_LIMITS` (new per day 15, max chars 4,000, per run 20), `messageTaskInputSchema` (`profileUrn`, `slug`, `name`, `text`) shared by brain's command and the spider's input, the verdict list of the task, `renderMessage(template, person)` (pure: `{{firstName}}`, `{{name}}`; unknown field or empty value returns a refusal, so nothing is sent with a hole in it) used by the body preview, the block validator and the engine.
- `src/workflow.ts`: block type `account.sendMessage` in `BLOCK_TYPES`, `BLOCKS` spec (group Account Actions, input `profile`, output `profile`, config `message`, `ifTalking` `SKIP|CONTINUE`, `perRun`), added to `POOL_BLOCKS` (needs "Select accounts" before it; the validator already refuses without one) and to the validator's checks (message renders for a sample person, not empty, within the length).
- A message from the page: `unibox.start` input in brain's router only (zod there); the page's types come from the router.
- Rebuild `dist` after a change (`pnpm --filter @automatedLinkedIn/contracts build:lib`).

## Brain (`apps/brain`)

- Migration `<later stamp>_add_first_message` (additive; the folder must sort after the existing ones, see `MEMORY.md`). Partial unique index kept (one `SENDING` per account). Index `(accountId, recipientSlug)` for the already-messaged check.
- `LinkedInReplyService.start(userId, { accountId, slug, text, source, runId, nodeId })`: the person must be a `CONNECTED` row of that account of that owner; refuse when suppressed; when a conversation exists (`contactProfileUrl` matched on the decoded, lower-case slug as the connections service does), answer `{ existing: conversationId }` and create nothing (the caller continues it); the account must be ACTIVE; new-conversation limit and the shared checks; create the row `QUEUED`; `dispatchNext`. Throws `TaskRefusedError` with a sentence like every other refusal.
- `dispatchNext` builds `linkedin-message` input from the row when `conversationId` is null.
- Hook `linkedInMessage` (same code as the reply hook, one set of verdicts): `SENT`, `UNKNOWN`, the not-sent set; new verdicts `WRONG_RECIPIENT`, `NOT_A_CONNECTION`, `ALREADY_TALKING` count as not sent. A message import is queued for every non-failed result, and also for `ALREADY_TALKING`, so the existing thread is stored. The importer links the row to the stored conversation (`conversationId`, by `sessionId`).
- Router `unibox`: `start` (above), `recipients({ accountId, query })` (owner scoped, searches stored connections by name, headline and slug; returns `conversationId` and `suppressed` flags; 20 rows), and `reply` returns `conversationId` once linked so the page can move to the thread.
- Settle: `settleUnsureReplies` already runs for a stored conversation; it must see a first message after the link.
- Workflow executor `worker/engine/sendMessage.ts`, next to `writePost.ts` and `visitPages.ts`, one line in `EXECUTORS`. For each person item (`peopleOf`, deduped by slug) that is not done: skip with a counted reason when suppressed, when no chosen account has them as a connection, when a workflow from any chosen account messaged them in the last 90 days (`SENT` or `UNKNOWN`, by `recipientSlug`), when talking already and `ifTalking` is `SKIP`; otherwise ask the pool account that has them as a connection and went longest without a message (`idleFirst`); a refusal that waiting fixes (busy, resting, limit of the day) leaves the person for the next tick or the next run, as the visit blocks do. One try per person per step plus `retriesOf` tries from a Retry after a block; an `UNKNOWN` message is never made again. The step waits for the rows to end with the visit blocks' time limit rules and passes on the people messaged (the rest stay under `<id>~else` only if the owner asks later; not now, YAGNI). Preview sends nothing.
- Wait, Task result, Retry and Else stay generic: the new block is a working block, so they look at it with no branch of their own (`workingBlockBefore`). No per-block-type code is added to them; a test shows Wait, Task result and Retry after `account.sendMessage` work.
- Per-person state for the block is read from `LinkedInReply` rows with `runId`, `nodeId`, `recipientSlug`; no new table.
- Brain tests that import `core` must mock it (see `MEMORY.md` gotchas); a file reachable from `taskHooks.ts` must not import the `core` barrel.

## Spider task `linkedin-message` (version 1)

- Input: `profileUrn`, `slug`, `name` (the person's name as stored, for the check), `text` (1 to 4,000 after trimming). Needs a proxy and an account, `oneAtATime: 'account'`, no cooldown of its own (brain limits), limit 5 minutes, `budget` ACTION class like `linkedin-reply`.
- Steps: runner has the signed-in feed open. Open `/messaging/compose/?profileUrn=<urn>` through `session.open` (the sign-in check and consent as the reply task does). Settle at a human pace. Possible landings, to be fixed by the recording:
  1. The compose page with the recipient chip: check the chip names the person (first name must match `name`), else `WRONG_RECIPIENT` with nothing typed.
  2. LinkedIn moved to `/messaging/thread/<id>/` (a conversation exists): `ALREADY_TALKING`, nothing typed, the thread handed over as `messages.json`.
  3. No box, or LinkedIn offers a connect or premium prompt: `NOT_A_CONNECTION` or `NO_COMPOSER`.
- Then the shared sending code: click the box, type with `typeKeys`, wait for the send button, `markAttempt()` just before the press, press the button (never Enter), confirm by the address moving to `/messaging/thread/<id>/` and the account's newest message holding the text, or LinkedIn's own `createMessage` answer (`watchAnswers`); hand the thread over as `messages.json` (the conversation id is the new thread id).
- Verdicts: `SENT`, `UNKNOWN`, `FAILED`, `NO_COMPOSER`, `WRONG_RECIPIENT`, `NOT_A_CONNECTION`, `ALREADY_TALKING`, `SIGNED_OUT`, `ERROR`. Messages are fixed sentences; the words and the name never reach a log, report or the dead-letter copy.
- A command delivered again after the send may have been pressed answers `UNKNOWN` without typing (the attempt marker, as for replies).
- The reply task keeps working untouched in behaviour; its tests run before and after the extraction.

## Requirements

Confirmed (from the request, 2026-10-29):

- Write a new message to connections, whether starting a conversation or continuing one.
- A plan for UI/UX, brain, contracts, task and workflow node.

Answered by the owner, 2026-10-29:

1. Recipients: only stored first-degree connections of the chosen account.
2. Table: extend `LinkedInReply` (nullable `conversationId` plus recipient fields).
3. Task: a new `linkedin-message` that shares extracted send code with `linkedin-reply`.
4. Limits: new conversations 15 per account per day, replies stay 40, 20 people per run per block (all unverified against LinkedIn).
6. Workflow "If already talking": Skip (default) or Continue.
8. Workflow repeat rule: no repeat by any workflow from the same account within 90 days.
10. Unibox entry: a view in the right pane at `/unibox/new`, key `C`.
11. Test account for the recording and first live send: `dharmendrashaheagle+linkedin@gmail.com`.

Not asked, assumed as recommended (say if you disagree):

5. Text only for the first message in v1 (the compose page's file inputs are not recorded). Files in replies stay as built.
7. Personalisation: `{{firstName}}` and `{{name}}` only, a missing value skips the person, no random variants or spinning.
9. The block never reads connections itself: if the chosen accounts have no stored connections it fails with "Read the connections first".

Open questions (none block the UI work):

- Which two people of that account (one with a thread, one without) may be used for the recording and the first live send, and do you agree to each real send? Step 0 and step 7 wait for this; steps 2 to 6 do not.

## Scope and non-goals

- In scope: the Unibox New message view, the Connections page Message change, brain start/recipients/link, the migration, the contracts, the `linkedin-message` task, the shared send module, the `account.sendMessage` block (contract, executor, form, icon), tests, `MEMORY.md`.
- Out of scope: InMail, connection requests with notes, messaging non-connections, files in a first message, scheduled or follow-up sequences, auto-reply, templates library, bulk send from the Connections page, A/B variants or spinning, an all-accounts compose, reply detection to stop a sequence (no sequences exist).

## Approach

- [ ] 0. Record the real page first (devtools "Record a session" with the test account, `s` for snapshots): open the Message link of a person with no thread as a page address; the same for a person with a thread; type, and stop before send. Write down account, date, layout, whether the address stays on `/messaging/compose/`, what the recipient chip looks like, what appears for an existing thread. If the compose page is a bubble inside a shadow root instead, the fallback is to open the person's profile and press its Message button; the plan is updated and re-locked before step 2.
- [x] 1. Questions 1 to 4, 6, 8, 10 and 11 (account) answered; 5, 7 and 9 assumed; the people for the recording and the live-send agreement are still open.
- [ ] 2. Contracts: `outreach.ts` with tests (`renderMessage` cases: present, missing, empty, too long), `workflow.ts` block and validator checks with tests, rebuild `dist`.
- [ ] 3. Spider, tests first: reader for the compose page (fixture from the recording, each layout seen), extraction of `messageBox` from `send.ts` with the reply tests green before and after, task `linkedin-message`, registry line, unit tests per verdict, `SIGNED_OUT` on `/uas/login` (first page and a later one), delivered twice, nothing typed before box and button are confirmed, send pressed once.
- [ ] 4. Brain, tests first: migration; `start`, `recipients`, dispatch by row, hook, importer link; unit and integration tests (not a connection, suppressed, existing conversation, limit of the day, busy and resting keep it queued, owner scoping, unsure never repeats, link after import). Done 2026-10-29 (option 2, the owner's choice): `unibox.recipients({ query })` → `LinkedInConnectionService.recipients` (stored connections of all the owner's accounts, not removed or gone, every word in name, title or slug, at most 200, with the account's conversation and the do-not-contact mark), tested on PostgreSQL; the real source lists them and New message shows on real data, but `canStart` stays false, so people never written to are shown and cannot be picked ("New conversations coming soon"). Still to do: `start`, the migration, dispatch, hook, importer link.
- [ ] 5. Body, tests first for the pure parts (recipient search state, draft key, address parsing, placeholder row, `messageAction` change): New message view, toolbar button and key, Connections page change, polling and move to the thread. Built on the sample source (2026-10-29, not seen in a browser): address `/unibox/new?account=&to=`, key `C`, palette entry, an icon button in the toolbar, a `NewMessage` dialog (redone on 2026-10-29 at the owner's request: no From and To lines, only a search over the connections of ALL accounts; each row shows the photo with the account's on its corner, name, title, the account chip, the last message and its time when they talked, and a state chip Needs reply, Waiting for their reply, Done, New conversation or Do not contact; picking a person opens their conversation, or a new empty one (`draftConversation`, id `new:<account>:<slug>`) where the first message is written in the normal composer and sent like a reply; an empty one is dropped from the list when left; `unibox.recipients` must therefore search all the owner's accounts and return `accountId` per person), the 5 s hold with Undo that returns to the view with the words, the stand-in conversation (`placeholderId`, `placeholderOf`) that is replaced by the stored one, an already-talking person opening their conversation with the words carried over. The view shows only when the source can start (`canStart`; the tRPC source answers false until brain has `unibox.start`). Not done: the Connections page Message change (it would link to a view that does not work until brain is built, so it waits for step 4) and the `trpcSource` calls.
- [ ] 6. Workflow block: executor with tests (skips, idle-first choice, deferral, one try, unsure never repeated, preview, stop request), Wait and Retry and Task result after it, form fields and preview, icon in `BLOCK_ICONS`, entry in the block catalog the body shows.
- [ ] 7. Live, on the test account only and with your agreement for each real send: a first message to a person with no thread; an `ALREADY_TALKING` landing; a continued conversation from the new view; the workflow block with one person; the page in a browser (not seen behind sign-in so far for similar pages).
- [ ] 8. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` with no warnings; brain integration tests with the migration applied; update `MEMORY.md` and fill Outcome.

Spider task checklist (`.github/skills/spider-task-writer/assets/checklist.md`), to be ticked as steps 0 to 7 happen:

- [ ] Plan, goal, locked requirements, name `linkedin-message`, input and verdicts as above, `version` 1; the irreversible step is the press of send; test account and who the live message goes to are agreed (question 11).
- [ ] Lifecycle: the task assumes a signed-in feed and repeats no sign-in; every landed page is checked for the sign-in page and `SIGNED_OUT` is declared and tested; every SUCCEEDED run returns `commitSession`; the run ends on a normal signed-in page (the new thread); two runs in a row on the test account start signed in; a deliberate failure is readable from the run folder.
- [ ] Evidence: the compose page and the existing-thread landing recorded (step 0) on at least one account, date written here; layout differences looked for, or this plan says only one account was seen; selectors are plain CSS in `linkedin/markup.ts` with their date; everything not seen is listed as unverified here.
- [ ] Tests first: fixtures per layout, reader tests, a unit test per verdict, nothing typed before the box and send button are confirmed, send pressed at most once, a command delivered twice; no new driver call is planned (typing, click, press, `watchAnswers`, `pageHtml` exist and are forwarded); if the recording shows one is needed, forward it in `recordedDetectionSession.ts` and add an e2e test.
- [ ] Build: folder `tasks/linkedinMessage/`, one line in `tasks/registry.ts`, `defineTask` fields complete, `markAttempt()` just before the press, bounded waits for a slow page, pacing, fixed sentences only.
- [ ] Brain side: schemas in contracts, hook entry for the task name, catalog parses, worker restarted so brain sees the task.
- [ ] Verify and close: devtools run on the test account noted here, failed runs read from the run folder, staging run or a note why not, plan `done`, `MEMORY.md` updated.

## Edge cases and risks

- A message sent twice is the worst failure: attempt marker before the press; no automatic retry (spider redelivery answers `UNKNOWN`; brain never retries a row; a block never remakes an `UNKNOWN` one); one `SENDING` per account (partial unique index); a person already messaged in the window is skipped; two tabs sending to the same person are stopped by the one-sending rule and the already-messaged check.
- Wrong person: the recipient chip must name the person (first name) before anything is typed; two people with the same name are told apart by `profileUrn` in the address. A mismatch types nothing.
- Already talking but the Unibox does not know (older than the read depth): the task detects the redirect to a thread and sends nothing; brain stores that thread and the page offers the thread with the draft kept.
- Person is no longer a connection (removed on the phone, or by them): the compose page offers a connect or premium prompt; `NOT_A_CONNECTION`, nothing sent. The stored list can be stale until the next read; the page shows "Last read" on the To list.
- Do-not-contact: checked in brain on every start and in the block, never only in the page. A person added to the list after a row is queued and before it starts is checked again at dispatch.
- Template with a hole: `renderMessage` refuses an unknown or empty field, so the person is skipped with a counted reason, never sent "Hi ,".
- Duplicate people in the block's input: deduped by slug; the same person reaching the block through two lines is one message.
- Account resting, outside hours, out of browsing time, signed out, paused, or busy: same behaviour as replies (queued with a reason, or refused with a sentence, or a sign-in check is asked for). A queued first message that waited 15 minutes past its time ends FAILED "It could not start in time. Nothing was sent."
- Existing code assumes a reply has a conversation (`conversationReply.ts`, `replySettle.ts`, `linkedInConversation.service.ts` read `conversationId`): each is read and given a null path with a test before the column is made nullable. The row with no conversation must not appear as a failed reply on a conversation list; the page shows it only through its own placeholder.
- Compliance: the tool acts on the owner's own account at a human pace to people already connected, inside rate limits, honouring the do-not-contact list; no bulk send from a list that is not connections, no spinning, no evasion. A block that messages many people is the nearest thing to bulk messaging in the product: the per-day, per-run and 90-day limits are the guard, and the block says so in its hint. Mass messaging can still breach LinkedIn's terms; the limits are unverified and are noted in `MEMORY.md`.
- Privacy: the text and the person's name are stored on the row for the owner and deleted with the account (cascade); never in logs, reports, run items or the dead-letter queue as text. The run's recording keeps what the page showed for 7 days, as for replies.
- Existing data and migration: additive only (a nullable column and new nullable columns); existing rows are replies and keep working; rollback is to stop offering the new view and block (the columns can stay empty).
- Deploy: the new task must be announced by the spider worker (restart it) or brain answers `TaskUnavailableError` and the message stays queued; during a rolling deploy an old brain does not know `linkedin-message`, so the Unibox view is hidden until the router answers (the page checks the capability).
- Dev vs production: the sample Unibox source answers the new send with a sample result, as it does for replies; no flag, the compose page is real from the start (as `.plan/unibox-send.md` decided), so the first live message is the first real use.
- Unverified until step 0: the compose page address as a page, the recipient chip, the existing-thread redirect, the send confirmation by address, non-English accounts, a second layout. Selectors are not written before the recording.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root, no warnings; `pnpm --filter @automatedLinkedIn/brain test:integration --run --no-file-parallelism` with the migration applied (stop a local brain worker first).
- Spider: unit tests per verdict; a real-Camoufox stand-in e2e only if the recording shows a new page shape.
- Live (needs you): steps 0 and 7. Until then it is stated as not run on LinkedIn.

## Outcome

Filled in when done.
