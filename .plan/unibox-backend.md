# Unibox backend: store the messages, serve them, reply from the page

- Status: done
- Created: 2026-10-23
- Locked by user: yes, 2026-10-23 (answers Q1 to Q6 below)

## Goal

Replace the Unibox's sample data with the owner's real conversations. The `linkedin-messages` task already reads an account's conversations into `messages.json`; brain does not store them yet. This plan adds the storage, the import, the API the page calls (`UniboxSource` over tRPC) and, as a second phase, replying from the page through the account's own browser. Phase 2 of `.plan/linkedin-messages.md` and `.plan/unibox.md` ("Parked, not UI-only").

## What exists

- Spider: task `linkedin-messages` hands over `messages.json` (contract `packages/contracts/src/messages.ts`: conversations with LinkedIn's own ids, participants with profile link and picture address, messages with sender, direction, day and time, text, attachment placeholders, `account` name and picture). Files sit in the bucket under `runs/linkedin-messages/<user>/<yyyy>/<mm>/<dd>/<task id>/`; brain saves a `SpiderSession` with its `SpiderSessionArtifact` rows (path, bytes) and never reads a file: it only signs links (`core/recordingLinks.ts`).
- Brain: tasks go through `TaskService.request` (outbox, hooks in `database/taskHooks.ts`: `onRequest` and `onResult` run in a transaction and may not make a network call), the worker runs consumers and jobs (`defineConsumer`, `defineJob`), routers are owner-scoped (`ownerProcedure`), services are static classes in `database/`. Account daily visit pattern: `LinkedInAccount.nextBrowseAt` and `accountDailyJob`.
- Body: the Unibox page works on `UniboxSource` (`load`, `send`) with a sample implementation; read, done and draft state live in the page, drafts on the device.
- Not there: any table for conversations or messages, an importer, a router, a task that sends.

## Proposal

### Phase A: read side (tables, import, API, page on real data)

1. **Tables** (additive migration `add_unibox_messages`):
   - `LinkedInConversation`: `id`, `userId`, `accountId` (to `LinkedInAccount`, cascade), `linkedInId` (the thread id), `title`, `kind` (`DIRECT`/`GROUP`), `participants` Json (name, profileUrl, imageUrl), `contactProfileUrl` (for "same person in other accounts"), `unread`, `complete`, `lastMessageAt`, `lastDirection` (`ME`/`THEM`), `waitingSince`, `lastPreview` (first 200 characters), `readAt` and `doneAt` (set by the owner in the Unibox), `importedAt`. Unique `(accountId, linkedInId)`; indexes `(userId, lastMessageAt)`, `(userId, lastDirection, waitingSince)`, `(userId, contactProfileUrl)`.
   - `LinkedInMessage`: `id`, `conversationId` (cascade), `linkedInId` (message urn, or the stable fallback the reader makes), `direction`, `senderName`, `senderProfileUrl`, `sentAt` (nullable: LinkedIn showed none), `whenText`, `text`, `attachments` Json. Unique `(conversationId, linkedInId)`, index `(conversationId, sentAt)`.
   - `LinkedInAccount`: add `displayName` and `imageUrl` (from `messages.json` `account`), `messagesReadAt` and `nextMessagesAt` (the daily automatic read).
   - Needs reply is derived, not stored: last message is theirs and `doneAt` is empty or older than it (so a new message reopens a done conversation, as the page does today).
2. **Import**: a hook `onResult` for `linkedin-messages` records, in the finishing transaction, a `MessageImport` row (session id, state, attempts; no network). A worker job `message-import` claims rows, reads the `messages.json` parts of that run from the bucket, validates them with `messagesFileSchema`, and upserts conversations and messages in one transaction per conversation. Idempotent by the unique keys: a redelivered or repeated import changes nothing. A row that keeps failing ends `FAILED` with a fixed reason (never message text) and shows on the session.
3. **API** (router `unibox`, `ownerProcedure`, every query scoped to `ctx.user.id`): `accounts` (with unread and needs-reply counts), `conversations` (the owner's newest N with last-message preview and the filter/sort the page needs), `conversation` (all messages, paged from the newest), `setRead`, `setDone` (ids, with the same undo the page has: the inverse call), `refresh` (starts `linkedin-messages` for the chosen accounts through `TaskService.request`, limit 50).
4. **Page**: a tRPC `UniboxSource`; the page's logic is unchanged for what it holds in memory (the newest N conversations with their latest messages), the full history of one conversation loads when it opens. The sample source stays for development and tests.

### Phase B: reply from the page (separate task, only after Phase A is used)

- A spider task `linkedin-reply` (input: conversation id, text) opens the conversation in the account's own browser and types and sends the text at a human pace; it returns `SENT`, `FAILED` or `UNKNOWN` (the click happened but nothing could be confirmed).
- Brain: table `LinkedInReply` (conversation, text, attachments as names only, state `HELD` → `SENDING` → `SENT`/`FAILED`/`UNKNOWN`, `sendAfter` = now + 5 s for the Undo), a job that starts the task when `sendAfter` has passed, `send`, `undoSend` (only while `HELD`), `retry` (only from `FAILED`, never from `UNKNOWN`).
- Limits: one reply at a time per account (the account lease already serialises tasks), a daily cap per account, an `ACTIVE` account only, no bulk or automatic replies. Text only first; attachments need their own plan (the spider would have to upload files).

### Not in this plan

Notifications, snooze, assigning to teammates, translating, link previews, search across all history with a text index (see risks), sending attachments, reading LinkedIn message requests and InMail beyond what the reader already reads.

## Requirements

Confirmed (from earlier decisions):

- Only the owner reads and replies; no teammates (`unibox.md` Q1). Opening a conversation marks it read in the Unibox only, not on LinkedIn (`unibox.md` Q6). Messages are kept until the owner deletes them (`linkedin-messages.md` Q4). Reading accepts that LinkedIn shows "seen" to the sender (`linkedin-messages.md` Q1).

Answered by the owner on 2026-10-23:

- Q1. Phase A now; sending (Phase B) is planned separately afterwards.
- Q2. The brain worker reads `messages.json` from the bucket (a read permission for brain's service account on `runs/`, an operator step in `deploy/gcp-setup.md`; none locally).
- Q3. Refresh by the owner **and** a daily automatic read per account. Reads open conversations on LinkedIn, so the other people see "seen"; the owner accepts this for the daily read too. The daily read follows the existing daily pattern (a random time of the account's day, `nextMessagesAt`, an `ACTIVE` account only) and reads the newest conversations only (limit 20), so a day's run is short.
- Q4. About 3,000 newest conversations in the page with their latest 20 messages each; older ones by search later.
- Q5. No "Delete conversation" now. Removing an account still deletes its conversations by cascade.
- Q6. Accept the staging database having no TLS for now (the risk stays listed below and in `MEMORY.md`). No feature gate.

Open questions: none.

## Scope and non-goals

- In scope (Phase A): migration, importer and its hook, `unibox` router, `UniboxSource` over tRPC, owner-only access, deletes, tests, `MEMORY.md`.
- Out of scope: Phase B (sending), deleting a conversation, attachments, text search index, teammates.

## Approach

- [x] 1. Lock the questions above.
- [x] 2. Contract: nothing new for Phase A (`messagesFileSchema` is the input); add the `unibox` request and answer schemas to `packages/contracts` only if the body needs them (it imports `AppRouter` types, so likely none).
- [x] 3. Prisma: models, enums, migration `add_unibox_messages` (additive, no data touched), generate.
- [x] 4. `database/linkedInConversation.service.ts` (upsert, list, counts, setRead, setDone, remove) with unit tests and an integration test on real PostgreSQL; derived status in one place (`needsReply` helper shared by the list and the counts).
- [x] 5. `database/messageImport.ts` + `linkedInMessages.hooks.ts` (`onResult` creates the row), worker job `message-import` registered in `worker/jobs/registry.ts`, bucket reader in `core/` (read only, `runs/` prefix and the run's own folder only, size cap), tests with a fake reader.
- [x] 6. Router `unibox` (`resolvers/unibox/unibox.ts` + tests): owner scoping, `NOT_FOUND` for a foreign id, input limits (page size, ids per call).
- [x] 7. Body: `trpcSource` implementing `UniboxSource`, page switched by a flag (sample when the dev file is present, real otherwise), loading and error states, Refresh button per account.
- [x] 8. Verify end to end: a run's `messages.json` (the recorded one) imported twice gives the same rows; the page lists it; mark read and done survive a reload; a second user sees nothing. Done for the importer and the router on PostgreSQL (the recorded file, twice, then through the router as two users); the page on real data was not seen, because it needs a signed-in session.
- [x] 9. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, integration tests, `MEMORY.md`, Outcome.

## Edge cases and risks

- **Other people's words are stored.** This is personal data of third parties. Kept only for the owner who read it; cascade on account and user delete; a delete for one conversation; logs and reports carry counts only, never text (already true in the spider). Messages never reach the build or the sample bundle.
- **Staging database has no TLS** (see Q6): message content would cross the public internet in clear. This is the main risk of the whole plan.
- **Repeated and overlapping imports**: unique keys and upserts make an import idempotent; two runs for one account at once are already refused by the account lease; the importer takes a claim on the row (database clock, like `TaskDispatch`) so two workers never import the same run.
- **Run reads part of a conversation**: `complete` false means older messages are missing; a later full read fills them in without duplicates; a message the reader keyed by the fallback (no urn) can duplicate if its text or time changes, which is accepted and noted.
- **Messages without a date** (`sentAt` null): ordered by their order in the file; the conversation's `lastMessageAt` falls back to the import time, so it is never lost from the list.
- **The daily read** runs only for an `ACTIVE` account with a proxy, at a random time of the account's own day (like the daily visit), never while another task of the account runs (the lease), and a refused or failed run does not retry the same day; the first read of an account is a full one (limit 50), later ones read the newest 20.
- **Reading changes LinkedIn's unread state**: the stored `unread` is the state before the run opened it; the Unibox's own read mark is separate (`readAt`), as decided.
- **Large files**: a run keeps up to 20 parts of at most 900,000 characters; the reader streams one part at a time and refuses a file over the cap; a part that fails validation fails the import (nothing partial is committed for that conversation).
- **Foreign or forged paths**: the reader only takes the artifact paths brain already checked against the run's own folder; the owner id comes from the session row, never from the file.
- **Search**: plain `ILIKE` on titles and message text for now. A trigram index needs `CREATE EXTENSION`, which the staging role cannot do today; the page's own in-memory search covers the loaded window. A real text index is a follow-up.
- **Counts** are computed in one grouped query from the same helper the list uses, so the badge, the rail and the list cannot disagree.
- **Rollback**: new tables and a new router; the page falls back to the sample source; dropping the tables loses only imported copies, the runs' files stay in the bucket.
- **Phase B** (sending) carries the real compliance risk: acting as the owner's own account, human pace, a daily cap, no bulk or automatic replies; an `UNKNOWN` result is never retried by itself, so a reply is never sent twice.

## Verification

- Unit tests for the status helper, the importer (idempotence, partial file, bad part), the router (scoping) and the hook; an integration test of the service and the importer on PostgreSQL; the page against a fake `UniboxSource`.
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, `pnpm test:integration:run` with Postgres.
- A real import of the recorded `messages.json` through the job and the page on the local stack, if it is up (sign-in is needed); say so if it cannot be run.

## Outcome

Shipped (Phase A, 2026-10-23):

- Migrations `add_unibox_messages` and `add_conversation_done_count` (additive): `LinkedInConversation`, `LinkedInMessage`, `MessageImport`, and `displayName`, `imageUrl`, `messagesReadAt`, `nextMessagesAt` on `LinkedInAccount`.
- A hook for `linkedin-messages` (`database/linkedInMessages.hooks.ts`): `onRequest` refuses an account that is not signed in, `onResult` queues the run's files (`MessageImport`) for a run that read something, and asks for a sign-in check when the account was found signed out.
- The importer (`messageImport.service.ts`, job `message-import` every 30 s): claims due rows with the database clock and `SKIP LOCKED`, reads the run's `messages*.json` through `core/messageFiles.ts` (read only, `runs/` only, 2 MB cap), validates with `messagesFileSchema`, stores through `LinkedInConversationService.store` (idempotent; owner and account from the session row), retries with a back-off and ends `FAILED` after 5 attempts, writing only the error class.
- `LinkedInConversationService`: list (3,000 newest, latest 3 messages each), get (newest 500), setUnread, setDone, accounts with unread counts; "done" is the message count when it was closed, so a new message reopens it without comparing clocks.
- The daily automatic read in `AccountDailyJob` (`nextMessagesAt`, first read limit 50, later 20) and the owner's refresh (`MessagesRefresh`), sharing `messagesInput`.
- Router `unibox` (`accounts`, `conversations`, `conversation`, `setUnread`, `setDone`, `refresh`), owner-scoped, tested over the real services in `unibox.integration.test.ts`.
- Body: `createTrpcSource` (a real `UniboxSource`), `withDevFile` (the dev file in `public/` wins in development, everything else is real), marks kept through the hook, the whole conversation loaded when opened, More menu "Read the messages again" and "Reload the list", the empty state offers the first read, the composer says that sending is not available yet and keeps the draft. Status rules use the server's `waitingSince` and `lastReplyAt` while only the latest messages are held.
- Deploy: the brain worker runs as the `brain` ServiceAccount, which is already bound to the service account that may read `runs/` (no new cloud permission).

Deviations and notes:

- Message times are the account's wall-clock kept as if UTC (the spider cannot give the zone). Only their order and time of day are true, so nothing compares them with the real clock; "done" uses the message count for that reason. "Waiting 12m" style ages are therefore approximate.
- Search is the page's own over what it holds (titles, accounts, the latest messages); a text index is a follow-up.
- The list sends the latest 3 messages per conversation (not 20) to keep the payload small; the whole conversation loads on open.
- Staging database TLS was accepted as it is (Q6): message content now crosses the cloud boundary in clear until that is fixed.

Follow-ups: Phase B (sending), a text index for search over all history, delete a conversation and erase a person, TLS to the staging database, an unread badge on the sidebar entry, a live run of the whole path (task, bucket, import, page) on a real account (only the parts were run here: the importer and router on PostgreSQL, the page on sample data).
