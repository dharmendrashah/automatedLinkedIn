# Read the messages of each LinkedIn account (spider first)

- Status: in progress
- Created: 2026-10-22
- Locked by user: yes, 2026-10-22 (answers to Q1 to Q5 below)

## Goal

For each of the owner's LinkedIn accounts, a spider task reads the account's LinkedIn conversations and messages and hands them to the platform, so the owner can see them in one place. This plan covers phase 1 (the task in the spider worker); the platform side (storage, page) is phase 2 and is only sketched here so phase 1 produces the right shape.

## What exists

- A task is a folder under `apps/spider/src/tasks/<name>` plus one line in `tasks/registry.ts`; the runner opens the account's saved session, takes the account lease, records the run, and publishes a `TaskResult` (`verdict`, one sentence, optional `report`, `artifacts`).
- `report` is for text the owner reads (a headline and up to 20 sections of up to 100 label/value items, 500 characters each): too small for a mailbox. A `file` artifact (kind `file`, `sensitive` flag) can carry any size; brain serves it by a signed link in `/sessions`.
- The reusable browsing toolkit from `.plan/linkedin-browse-refactor.md`: `browsing/hands` (inspect, clickLink, clickInside, clickSelector, back, scroll), `reader` (human pacing), `overlay`, `targets` (budget and failure loop), `snapshot`, and `linkedin/session` (signed-out detection, the feed).
- The devtools recorder (`dev:record`, Run a task, `snapshots`) captures the real page markup, which is how the daily visit was built.
- Brain applies a task's result in a hook (`database/taskHooks.ts`, `onResult` in the finishing transaction) and keeps a run as a `SpiderSession`.

## Proposal

Phase 1, spider (this plan's build scope):

1. **Capture first.** A local run of a capture step opens `/messaging/`, keeps the list and one conversation as `snapshots` (HTML plus `inspect.json`), so the selectors come from the real page, not from guesses. The user runs it locally and shares the recording, as with the daily visit.
2. **Task `linkedin-messages`** (`apps/spider/src/tasks/linkedinMessages/`), account required, proxy required, one at a time per account:
   - Open `/messaging/`, read the conversation list down its own scroll container, human-paced.
   - For each conversation it should read (see Q1 and Q3), open it by a real click, scroll up through its history until the oldest message is loaded or a stop point is reached, read the messages.
   - Output a `file` artifact `messages.json` (`sensitive: true`) and a short `report` (counts only: conversations, messages, new since last run).
   - Verdicts: `DONE` (everything it set out to read), `PARTIAL` (stopped at its budget; the next run continues), `SIGNED_OUT`, `ERROR`.
3. **Incremental by design.** The task input carries a `since` cursor per conversation (the newest message id or time it already has); phase 1 takes it as input, phase 2 stores it. Without it the run is a first full sync, limited by the budget (Q2).
4. **Message shape** (the contract phase 2 stores): conversation `{ id, title, participants[{ name, profileUrl? }], kind: 'DIRECT' | 'GROUP' | 'REQUEST', unread, lastMessageAt }`; message `{ id, sentAt, sender: 'ME' | 'THEM' | name, text, attachments[{ kind, name? }] }`. Contract added in `packages/contracts` so brain and body share it.
5. **Reusable pieces.** The conversation list and thread reading go to `linkedin/messaging.ts` (markup selectors in `linkedin/markup.ts`, parsing as pure functions with fixtures from the capture), the task only wires them, as the walk does.

Phase 2 (not built here, no decisions needed yet beyond Q4): brain tables `LinkedInConversation` and `LinkedInMessage` (owner-scoped, unique by account and LinkedIn id), a hook that imports `messages.json` on `onResult`, a tRPC router and a `/messages` page with a per-account filter and search, a run button and schedule on `/accounts`.

## Requirements

Confirmed:

- Read the messages of each account through the spider worker first.
- The platform gets them afterwards ("show it to the platform").

Answered by the owner on 2026-10-22:

- Q1. Open everything, unread ones too. They become read and the sender sees "seen"; this is accepted.
- Q2. Up to 50 conversations per run, about 20 minutes (task limit 25 minutes). Newest activity first; the cursor lets the next run continue.
- Q3. Direct, group, message requests and sponsored/InMail conversations; attachments only as placeholders (type and name, nothing downloaded). Nothing inside a sponsored message is ever clicked (links and buttons stay in `NEVER_CLICK`).
- Q4. Recordings like other tasks (video and screenshots kept 7 days). They will show the messages; the owner accepted that. The task's own logs and `report` still carry no message text, only counts. Messages are kept until the owner deletes them (phase 2).
- Q5. A `messages.json` file artifact plus counts in the report.

Open questions: none.

## Scope and non-goals

- In scope (phase 1): the capture step, the task, its parsing with fixtures, the contract, unit and real-browser tests (stand-in messaging pages), the devtools run, `MEMORY.md`.
- Out of scope: sending, replying, deleting or archiving messages (read only); downloading attachments; brain tables, page and schedule (phase 2); notifications; any other site.

## Approach

- [x] 1. Lock this plan (answer Q1 to Q5).
- [x] 2. Capture step (two local runs; its code was replaced by the reading). Findings are in `MEMORY.md`: the page is a classic Ember app with stable `msg-*` classes, rows are divs without a link, `/messaging/` opens the newest conversation by itself, the head of the page filled the snapshot cap.
- [x] 3. Contract `packages/contracts/src/messages.ts`: `messagesFileSchema` (parts of `messages.json`), conversation and message with `id` (LinkedIn's `data-event-urn`), sender, direction, `date`/`time`/`when`, text, attachment placeholders.
- [x] 4. Readers from the real markup, tests first: `linkedin/messageReader.ts` (`parseInbox`, `parseThread`, with `messagingFixture.ts`), `linkedin/when.ts` (English days and times), selectors in `linkedin/markup.ts`.
- [x] 5. Driver: `clickNth(selector, index, avoid)` and `scrollOver(selector, pixels)` (the list and the conversation scroll on their own), `Hands.html`. Task `linkedin-messages` v2 (`read.ts`, `messagesFile.ts`, `answer.ts`): opens rows newest first by a click, scrolls the conversation up until its first message loads, hands over `messages.json` (`messages-N.json` past 900,000 characters), input `limit` (1 to 50, default 50), `skip` (to go on where a run stopped, until phase 2 stores a cursor) and `snapshots`. Unit tests with a stateful fake page and a real-browser test against a stand-in page.
- [x] 6. Logging rule: names and words of messages never reach the log, a warning or the report (a test checks it); the report has counts only.
- [ ] 7. Local run with the devtools on a real account, read `messages.json`, fix what the real page shows; `MEMORY.md`, Outcome.

Not in this version (needs its own capture): the other views of the inbox (message requests, InMail, sponsored, the Jobs, Unread, Connections and Starred filters) and attachments other than images; the task reads the default Inbox list. Group conversations are read the same way, but their header markup was not seen.

## Edge cases and risks

- **Read receipts and unread state (Q1):** opening a thread changes the account's state and tells the sender, including strangers in message requests and sponsored messages (opening those can count as engagement with an ad). This is the main side effect of the whole feature and was accepted by the owner.
- **Markup unknown:** the messaging page is a separate part of the flagship app; nothing is known about its ids, lazy loading or scroll containers until the capture (step 2). The messaging tray overlay on every page is a known click trap in the feed and must be avoided there.
- **Lazy lists:** the conversation list and each thread load older items as the container scrolls up or down; a stop is when nothing new arrives after a few scrolls, never an endless loop (cap per thread and per run).
- **No stable message id:** if the page shows none, a message is keyed by conversation, time and a hash of the sender and text; day separators and relative times ("Mon", "10:42") are turned into dates from the page's own separators, with the account's time zone.
- **Edits, deletions, reactions:** a later run may see a message changed or gone; phase 1 reports what it sees and does not merge.
- **Volume and detection:** many threads opened in a row is not how a person reads. A per-run budget, human pacing and a daily cap keep it near a person's use; a first full sync is spread over days.
- **Privacy:** messages never go to logs and never to `report` text beyond counts. Video and screenshots do show them (Q4, accepted) and live 7 days. The `messages.json` artifact is `sensitive`, owner-only, behind a signed link.
- **Signed out mid-run:** `SIGNED_OUT`, partial data is still returned and marked `PARTIAL`.
- **Large output:** `messages.json` is capped; past the cap the run is `PARTIAL` and the next run continues from the cursor.
- **Concurrency:** one run per account at a time (existing lease); the daily visit and this task must not overlap on one account.
- **Compliance:** this reads the signed-in user's own account only, inside LinkedIn's own interface at a human pace, read only. It sends nothing and stores nothing of anyone but the account's own conversations.
- **Rollback:** a new task and a new contract file; remove the registry line. No migration in phase 1.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Real-browser test against a stand-in messaging page (list, threads, lazy history, an unread thread, a thread with an attachment).
- A local run with `pnpm --filter @automatedLinkedIn/spider dev:record` on a real account, then read `messages.json` and the log.

## Outcome

Filled in when done.
