# Unibox Phase B: reply from the page through the account's own browser

- Status: done
- Created: 2026-10-23
- Locked by user: yes, 2026-10-23 (answers Q1 to Q4 below)

## Goal

The composer of the Unibox sends a text reply to the conversation that is open, as the LinkedIn account the conversation belongs to, by typing it in that account's own LinkedIn page at a human pace. Phase A (`.plan/unibox-backend.md`) stores and serves the messages; this plan adds the spider task that sends, the brain side that asks for it and keeps the outcome, and the page changes that use it. Sending acts only on the signed-in owner's own account, one message at a time, typed by the owner: no bulk or automatic replies.

## What exists

- Phase A: tables `LinkedInConversation` (has `linkedInId`, the thread id in `/messaging/thread/<id>/`), `LinkedInMessage`, the importer job, router `unibox`, a real `UniboxSource` whose `send` answers "not available yet", composer disabled with `canSend: false`.
- Page: a reply is held 5 seconds on the page (Undo), then `source.send` is awaited; the page then shows the message as sent or as failed with a Retry. It has `SEND`, `UNDO_SEND`, `SENT`, `FAIL` states in `components/unibox/store.ts`.
- Spider: task framework (`defineTask`, one account at a time through the account lease, session restored from the vault, proxy required), `handsOf` (click, click Nth, scroll over, press, html), driver `fill(selector, value)` that types with a delay of 50 ms per key (`pressSequentially`), the messages reader (`parseThread`, `parseOwner`) and `linkedin/pace.ts`. The runner writes `<runPrefix>/done.json` after a result is published and skips a command whose marker exists (a task that crashed before that is run again).
- The recorded thread page (run `48b9baa8`, 2026-10-22) holds the real composer: `form.msg-form`, a `div.msg-form__contenteditable[role=textbox]` named "Write a message…", a `button.msg-form__send-button` that is `disabled` until there is text, file inputs for images and documents. Nothing has been typed or sent on live LinkedIn yet.

## Proposal

### Spider: task `linkedin-reply` (version 1)

- Input: `thread` (the thread id, same pattern as the reader's `THREAD_ID`), `text` (1 to 8,000 characters after trimming), `title` (the contact's name as the page showed it, to check we are in the right conversation), `reply_id` (brain's id, for the logs only).
- Needs a proxy and an account, `oneAtATime: 'account'`, no cooldown (brain limits the rate), limit 5 minutes.
- Steps: open the messaging page and the thread (`/messaging/thread/<id>/`, through the same `session.open`, consent and sign-in checks as the reader); wait for the page to settle at a human pace; check the conversation header shows `title` (else `WRONG_THREAD`, nothing typed); click the composer, type the text with delays (new driver call `typeInto(selector, text)` using `pressSequentially`, one line break as Shift+Enter), pause, click the send button (never Enter, so a stray key cannot send half a text); then read the page: the newest message of the account must carry the text.
- Verdicts: `SENT` (the new message is on the page), `FAILED` (not sent for a reason known before the click: not signed in, no composer, send button stays disabled, the page shows an error), `UNKNOWN` (the click happened but the message could not be confirmed), `SIGNED_OUT`, `WRONG_THREAD`, `NOT_ALLOWED` (LinkedIn offers no composer, for example a request that must be accepted first).
- **Never twice.** Before the click the task writes an attempt marker (`<runPrefix>/attempt.json`, `store.create`, new `context.markAttempt()` in the runner). A command that is delivered again and finds the marker answers `UNKNOWN` without typing. This closes the gap between "clicked" and "result published", where the runner's `done.json` is not there yet.
- After a `SENT` or `UNKNOWN`, the task reads the conversation from the page with the existing reader and attaches it as `messages.json` (contract as in Phase A, `complete: false`). Brain imports it through the same importer, so the real message arrives with LinkedIn's own id and time and nothing is invented on our side.
- Text, names and the page's content are never written to the logs or the report, only counts and fixed sentences (the recording of the run keeps what the page showed for 7 days, like other tasks; the owner accepted that for the messages).

### Brain

- Table `LinkedInReply` (migration `add_linkedin_reply`, additive): `id`, `userId`, `conversationId`, `accountId`, `text`, `state` (`QUEUED`, `SENDING`, `SENT`, `FAILED`, `UNKNOWN`), `failure` (a fixed sentence), `sessionId` (the spider session), `createdAt`, `sentAt`. One open reply (`QUEUED` or `SENDING`) per conversation, checked in the transaction.
- Router: `unibox.send({ conversationId, text })` creates the reply, checks the limits, starts the task through `TaskService.request` (hook `onRequest` refuses an account that is not `ACTIVE`; the outbox publishes it) and answers `{ replyId }` at once; `unibox.reply({ id })` answers the state (the page polls it); brain never retries a reply by itself, a new reply exists only when the owner sends again.
- Hook for `linkedin-reply` (`onResult`, in the finishing transaction): sets the reply state from the verdict, queues a `MessageImport` when `messages.json` came with it, asks for a sign-in check when the verdict is `SIGNED_OUT`.
- Limits (constants first, unverified against LinkedIn's own, in one place): at most N replies per account in 24 hours and at least G seconds between two sends of one account (a reply asked for sooner waits in `QUEUED` and is started by a job, `reply-send`, every few seconds, ending `FAILED` "Too many replies for now" past a minute).
- A reply that stays `SENDING` past the task's own limit plus a margin is ended as `UNKNOWN` by a job (the spider never answered).

### Page

- `canSend` is true for the real source when sending is enabled; `source.send` calls `unibox.send`, then polls `unibox.reply` (every 2 seconds, up to 3 minutes) and answers `{ ok: true }` for `SENT`, or `{ ok: false, reason, retry }` for the rest. `SendResult` failure gets `unsure: boolean`: `true` for `UNKNOWN`, so the page's Retry first asks "It may have been sent. Check on LinkedIn first. Send again?" before it sends a second copy.
- After `SENT` the page loads the conversation again from brain (the imported message replaces the local one).
- The 5 second Undo stays on the page: a reply is held in the browser, and brain only hears of it when the hold ends. A tab closed during the hold loses the reply (the draft is kept on the device).
- Text only: while attachments are on the reply, Send says "Attachments cannot be sent yet" and nothing is sent. The Attach menu still prepares them for later.
- Composer: shows the account, the limit counter (8,000), and the reason when an account is not active or the daily limit is reached.

### Not in this plan

Attachments (the spider would have to upload files), scheduled or automatic replies, bulk reply, editing or deleting a sent message, reactions, message requests that must be accepted, voice and video notes.

## Requirements

Confirmed:

- Sending only as a reply to a conversation the owner has open, one at a time, typed by the owner; only the account's own LinkedIn interface at a human pace (the project rule); no bulk or automatic sending.
- Phase A decisions stand: the owner's marks live in the Unibox only; messages are stored for the owner until the account is removed.

Answered by the owner on 2026-10-23:

- Q1. Text only now; attachments get their own plan later.
- Q2. At most 40 replies per account in 24 hours and at least 30 seconds between two sends of one account (constants).
- Q3. After an unsure result (`UNKNOWN`) the owner may send again **after a warning** ("It may have been sent. Check on LinkedIn first. Send again?"). This differs from the recommendation; the automatic guards stay: the spider never types again on a redelivery (the attempt marker answers `UNKNOWN`), brain never retries by itself, and only the owner's own confirmed action creates a new reply.
- Q4. No feature flag: sending is on from the start. The first live test reply is therefore the first real use; it will be reported as not verified until the owner has done one and checked the recording.

Open questions: none.

## Scope and non-goals

- In scope: spider task `linkedin-reply` and its driver call, runner attempt marker, brain table, router, hook and jobs, page send flow, tests, `MEMORY.md`.
- Out of scope: see "Not in this plan".

## Approach

- [x] 1. Lock the questions above.
- [x] 2. Spider tests first (reader helpers, confirmation rule, stateful fake browser task test in `tasks/linkedinReply/send.unit.test.ts`).
- [x] 3. Driver `typeKeys` (not `typeInto`: the task clicks the box itself), runner `markAttempt`, task `linkedin-reply` registered. Deviations: verdict `NO_COMPOSER` (not `NOT_ALLOWED`, which the runner owns); no `reply_id` in the input; the text is limited to 4,000 characters (`MAX_REPLY_CHARS`) so the command stays under brain's 8 KB input limit.
- [x] 4. Prisma `LinkedInReply` and migration (with a partial unique index: one `SENDING` reply per account), service `database/linkedInReply.service.ts`, hook `linkedInReply.hooks.ts`, job `reply-sweep`, unit and integration tests. Deviation: a reply asked for too soon is refused at once with a sentence, not queued; no `QUEUED` state, no `reply-send` job.
- [x] 5. Router `unibox.send` and `unibox.reply` (owner scoped), unit tests.
- [x] 6. Page: `trpcSource.send` with polling, `SendResult.unsure` and the "Send again" confirmation, attachments refused, `canSend` true; unit tests. Deviation: no reload of the conversation after `SENT` (the importer runs up to 30 s later and would drop the local message); a later open shows the stored one. The text limit is 4,000, not 8,000.
- [x] 7. Verify (see Outcome). The live test reply by the owner (Q4) is NOT done.
- [x] 8. `MEMORY.md`, Outcome.

## Edge cases and risks

- **A message sent twice** is the worst failure. Guards: the attempt marker before the click; no automatic retry anywhere (spider redelivery answers `UNKNOWN`, brain never retries); a Retry after `UNKNOWN` asks first; one open reply per conversation; the page's Send is locked while a reply is open (the existing rule).
- **Wrong conversation**: the thread id and the contact's name are both checked before typing; a mismatch types nothing. Two conversations with the same name are told apart by the id.
- **The text is mangled** (emoji, line breaks, very long text, a leading `/` command): the reader confirms the sent message holds the text (compared after the same cleaning the reader applies); a difference ends `UNKNOWN`, not `SENT`. Line breaks are typed as Shift+Enter. Text over 8,000 characters is refused in brain before anything starts.
- **LinkedIn markup changes**: the composer and send selectors come from one recording; a missing composer gives `FAILED` "LinkedIn did not show a place to write". Selectors live in `linkedin/markup.ts` next to the others and are covered by the fixture.
- **Not allowed**: a conversation that is a message request not yet accepted, a connection that was removed, a restricted account: no composer or a disabled one gives `NOT_ALLOWED` with a fixed sentence.
- **The account is busy, signed out or paused**: `onRequest` refuses a paused or signed-out account; a busy account (another task holds the lease) makes the reply wait in `QUEUED` until the gap and the lease allow it, up to a minute, then `FAILED`.
- **The worker or spider dies mid-send**: the reply stays `SENDING` until the sweep ends it as `UNKNOWN` (never `FAILED`, since it may have gone). The spider's redelivery finds the marker.
- **Rate**: the limits above; every reply is typed by the owner, so the real rate is human. A very fast stream of replies from one account would still be refused by the gap.
- **Privacy**: reply text is stored in brain (`LinkedInReply.text`) for the owner and deleted with the account; it never goes to logs, reports or the dead-letter queue as text (the command carries `input.text`; the queue copy lives only as long as the task, and the runner already redacts typed values in recordings).
- **Dev vs production**: no flag (Q4); the sample source keeps working as it does today.
- **Rollback**: set `canSend` back to false in the source (a one-line change) and redeploy; the new table can stay empty; no data of Phase A is touched.
- **Docker, CI, deploy**: no new service or permission; one new migration; the spider needs the new task in the catalog (announced by the worker like others).

## Verification

- Unit tests as listed in step 2 and 4 to 6; an integration test of the reply service and hook on PostgreSQL; the page's source against a fake client.
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, `pnpm test:integration:run`.
- What cannot be run without you: the live test reply (Q4, now the first real use). It will be stated as not verified until you have done it.

## Outcome

Shipped: the spider task `linkedin-reply`, the `typeKeys` driver call and `markAttempt` in the runner; the brain table, service, hook, sweep job and router calls; the page's real send with polling and the unsure confirmation. Checks run: spider unit tests (reply task with a stateful fake browser, reader helpers, runner marker, registry), the `typeKeys` e2e in real Camoufox against a local page, brain unit and integration tests on PostgreSQL (reply service, limits, verdict mapping, partial unique index, sweep), body unit tests.

Deviations: verdict `NO_COMPOSER` (the runner owns `NOT_ALLOWED`); no `reply_id` in the task input; text limit 4,000 characters; refused instead of queued when the gap or the daily limit applies; no reload after `SENT`.

Live: on 2026-10-23 the owner ran the task from the spider devtools on a real account and it sent a reply (`SENT`); an earlier run failed because `typeKeys` was not forwarded by the recording wrapper (fixed). Not verified live: the app's Send button through brain and the worker, the `LinkedInReply` row and its limits, the import of the sent message back into the Unibox, and the unsure and failure paths. Follow-up: one test reply from the Unibox itself; attachments in replies.
