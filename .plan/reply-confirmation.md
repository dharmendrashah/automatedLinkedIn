# Reply confirmation: a reply that was sent must be reported as sent

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-10-24
- Locked by user: yes, 2026-10-24 (all four proposals accepted; shipped in two changes: first the cause fix, then the rest)

## Goal

When a reply from the Unibox goes out on LinkedIn, the owner is told "Sent", not "Not sure if sent". Today a reply that clearly went (the recording shows the message in the conversation) ends as `UNKNOWN`. "Always" cannot be literal (if LinkedIn neither answers nor shows the message, nobody can know), so the target is: `UNKNOWN` only when every signal is missing, and an unsure reply settles by itself once a later read of the conversation shows its message.

## What happened (staging session `87852d9b`, 2026-10-23 21:45 UTC, account tripti.verma@elitale.com)

- The task typed the words and pressed send (`Pressed send` in the log). 34 seconds into the run LinkedIn's own request `POST voyagerMessagingDashMessengerMessages?action=createMessage` answered 200, and a delivery acknowledgement (204) followed a second later (`network.json`). The video shows the message.
- Right after, the log says `The page could not be read after send` and `Verdict: UNKNOWN`. That warning is written only when something throws after send was pressed (`send.ts`, the `catch` with `pressed` set). The run has no `messages.json`, the file the task hands over after a send.
- Cause (reproduced with a unit test, then removed): `handOver` in `apps/spider/src/tasks/linkedinReply/send.ts` builds `messages.json` from `parseThread(html)` and checks it with `messagesFileSchema.parse` (a strict schema). Since PR #84 the reader gives a picture of a message the address it downloads from (`url`, `messageReader.ts`, `attachmentsOf`). `read.ts` removes that field in `keepPictures`; the reply task does not. This conversation holds a picture sent in a message, so the schema refuses the page, `handOver` throws, and the `catch` turns a confirmed send into `UNKNOWN`. TypeScript cannot see it: the extra field is accepted structurally.
- So this is a regression from my picture fix (PR #84, deployed minutes before this run). It affects every reply in a conversation that holds a received picture; replies in other conversations are not affected. Before PR #84 pictures had no address, which hid the gap.
- Two weaknesses made it worse, found while reading the code:
  1. The verdict depends on the hand-over: `handOver(html)` runs before `return { outcome: 'SENT' }`, so any failure in writing the file changes the verdict.
  2. One failed read of the page ends the confirmation at once (the loop of 6 looks has no `try`), and the answer LinkedIn itself gave to the send request is never used.
- Brain never settles an unsure reply by itself: the hook sets `UNKNOWN`, and the later match of messages to replies (`linkedInConversation.service.ts`, `matchedAt`) only matches replies with files and does not change a state.
- Staging was switched off by the idle shutdown when checked (503), so the reply's row was not read; it stays `UNKNOWN` until something settles it.

## Requirements

Confirmed by the request of 2026-10-24:

- C1 A reply that was sent shows as sent.
- C2 It should always be confirmed (read as: never `UNKNOWN` when LinkedIn accepted it or the page shows it).

Proposed (to confirm, see Open questions):

- P1 Fix the cause: one place turns what the reader found into the contract's messages (no download address, nothing else the schema does not know), used by the read and by the reply task.
- P2 The verdict never depends on writing the hand-over: the message is looked for and decided first; the hand-over is then tried and a failure there is only a warning.
- P3 The confirmation is hardened: a look that fails to read the page counts as a look and the next one is tried; more looks (10, about 20 seconds); and LinkedIn's own answer to the send request is a second signal.
- P4 An unsure reply settles by itself: when a read stores a message of the account in that conversation with the reply's words, stored after the reply was asked for, the reply becomes `SENT`.
- P5 Tests that would have caught it: a reply in a conversation with a received picture that has an address must answer `SENT`, and every file a task hands over is parsed by the contract in its tests with such a page.

Decisions (owner's answers, 2026-10-24):

1. A 2xx answer to the send request with no message to see: `SENT`; a 4xx answer: `FAILED` (not sent). A 5xx or no answer stays `UNKNOWN`.
2. Replies that are `UNKNOWN` today (this session's and any from the last 7 days) are settled when their message is found; a dismissed one is left.
3. After an `UNKNOWN`, one read of that conversation's account is requested at once, so it settles within minutes.
4. First change: the cause fix and its test (P1, P2, P5). Second change: the rest (P3, P4, the read after `UNKNOWN`).

Open questions: none.

## Design (proposed)

- Spider, shared: `toContractMessages(messages)` next to `messageReader.ts` (strips `url`, keeps `kind`, `name`, `key`, `bytes`); `read.ts`'s `keepPictures` and `send.ts`'s `handOver` both use it. A unit test builds every kind of attachment the reader can produce and parses it with `messagesFileSchema`.
- Spider, reply: `confirm()` loops `looks` times; each look is `try { html = await hands.html() } catch { /* next look */ }`; the decision is `SENT` when `newestIsOurs`, or when the observed send request answered 2xx; `FAILED/NOT_SENT` when the box still holds the words or the send request answered 4xx; otherwise `UNKNOWN`. `handOver` runs after the decision inside its own `try`, with a warning on failure. The report says which signal confirmed it ("The message shows in the conversation", "LinkedIn accepted the message").
- Spider, driver: an optional call to observe the page's responses (`method`, a part of the address, status), so the task can ask "did the createMessage request answer, and with what". It must also be forwarded by `RecordedDetectionSession` (gotcha in `MEMORY.md`: a new driver call not forwarded there is invisible to tasks run through the runner), and the status only; never the request or response body.
- Brain: in `LinkedInConversationService.store`, after the new messages are saved, an `UNKNOWN` reply of that conversation whose words equal a stored `ME` message created after the reply's `createdAt` (both are brain's database clock, so no LinkedIn wall-clock comparison) becomes `SENT` with `sentAt` set; matching is one message to one reply, earliest first, so two replies with the same words are settled one each; a dismissed reply is skipped.
- Brain, hook: on `UNKNOWN` (not on `FAILED`) queue one read of the conversation's account through the normal request path, so the answer comes back within minutes (open question 3).
- Body: no new screen. The sentence of an unsure reply says it is being checked while that read is going; "Not sure if sent" remains only after the read ran and found nothing.

## Scope and non-goals

- In scope: the shared contract conversion, the hardened confirmation, the send-request signal, settling unsure replies, tests, `MEMORY.md`.
- Out of scope: sending anything again for an unsure reply (never; a second typing is the one real risk), changing the 40 a day and 30 second limits, files in replies (unchanged), the picture fix itself.

## Approach

- [x] 1. Test first: a reply in a conversation with a received picture that has an address answers `SENT` (it answered `UNKNOWN`, reproduced); the contract test for every attachment shape (`messageReader.contract.unit.test.ts`).
- [x] 2. `toContractMessages` (an allow list of the contract's own fields) used by the reply task's hand-over; the hand-over runs after the decision and a failure there is only a warning (`handOverSafely`). The read needs no change: `keepPictures` already gives the contract's shape.
- [ ] 3. `confirm()`: looks that survive a failed read, 10 looks.
- [ ] 4. Driver call for the send request's status, forwarded by `RecordedDetectionSession`; `SENT` on 2xx, `FAILED` on 4xx; tests with a fake driver and a real-browser test against the stand-in.
- [ ] 5. Brain: settle `UNKNOWN` replies in `store`; read request after `UNKNOWN`; unit and integration tests (one message one reply, dismissed untouched, same words twice).
- [ ] 6. Verify, including a real reply on staging in the conversation that failed, and `MEMORY.md`; set this plan to done.

## Edge cases and risks

- Never type twice: nothing here sends again. A command delivered again after send still answers `UNKNOWN` through `attempt.json` (unchanged).
- A 2xx answer to the send request for a request that is not the reply (the page also posts presence, delivery acknowledgements and conversation actions): the signal matches only `voyagerMessagingDashMessengerMessages` with `action=createMessage`; a test pins that other POSTs are ignored. LinkedIn may rename it: then the signal is missing and the page decides, as today.
- The same words twice in a conversation: the page check already refuses a newest message that was there before (`before`); brain matches one message per reply.
- A message the owner wrote on LinkedIn itself with the same words, stored after the unsure reply, would settle it as `SENT` wrongly. Accepted: same words, same conversation and same account within the window, so the owner sees "Sent" and the message is in the thread anyway.
- Clock: the match compares brain's own timestamps only; LinkedIn's wall-clock times are never compared with the real clock.
- The extra read after `UNKNOWN` costs one browser run on the account (about a minute plus the page); it uses the normal request path, so the rate rules and one task at a time hold.
- Staging asleep: the settled state appears when the worker is up again and a read runs; nothing is lost.
- Rollback: revert; no migration (the state and `sentAt` exist).

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests.
- Real browser against the stand-in thread with a picture, a slow page and a page that cannot be read once.
- On staging: reply in the conversation of this session (it holds a picture): `Sent`, `messages.json` in the run, and the old `UNKNOWN` reply settles after a read.

## Outcome

Filled in when done.
