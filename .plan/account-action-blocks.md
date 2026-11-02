# Account Actions: every spider task as a workflow block

- Status: locked <!-- draft | locked | in progress | done -->
- Created: 2026-11-02
- Locked by user: yes, 2026-11-02 (every answer below, the last three on 2026-11-02: all improvements of Write a post and Reply in a conversation, and no new tasks)

## Goal

Every spider task that works through one of the owner's LinkedIn accounts becomes a block in the "Account Actions" group, so a workflow can read from an account (connections, conversations, requests, a profile, the feed) like an input or collect block, act with an account (message, invite, answer a request, remove a connection, visit, post), and put any block before or after to process what came out. Each block shows a sample of what it takes and what it gives, and the next task that is built becomes a block by the same short recipe.

## What exists today (checked in the code, 2026-11-02)

- Four Account Actions blocks exist (`packages/contracts/src/workflow.ts`): `account.select` (the pool, passes items through), `account.visitProfile`, `account.visitCompany` (executors in `apps/brain/src/worker/engine/visitPages.ts`), `account.writePost` (`writePost.ts`, through `PostPublicationService.publishFromBlock`). A visit block uses the nearest "Select accounts" before it and is refused when there is none; the step asks tasks as accounts free up and gives itself back with `Waiting` (`engine/context.ts`). Each does its own bookkeeping: visits in `LinkedInPageVisit` (`runId`, `nodeId` columns), posts in `PostPublication`.
- Thirteen spider tasks exist (`apps/spider/src/tasks/registry.ts`): `linkedin-login`, `linkedin-browse` (feed), `linkedin-messages` (read the inbox), `linkedin-message` (send a first message), `linkedin-reply`, `linkedin-profile` (read a profile with the account), `linkedin-connections` (read, remove), `linkedin-invitations` (read received requests, accept or ignore), `linkedin-invite` (send, withdraw), `linkedin-post`, `linkedin-view-profile`, `linkedin-view-company`, `browser-detection`. Each has a hook file in `apps/brain/src/database/*.hooks.ts` (`onRequest`, `onResult`) that writes brain's own tables, and its own brain service with its own limits (visits 15 a day and once per 30 days per page; invites planned by `inviteRules.ts`, 20 a day and 100 a week; replies and first messages `REPLY_LIMITS` 40 and 15 a day; posts `POST_LIMITS` 3 a day). The task policy adds a gap per account and one task at a time per account.
- Reads end in brain tables, not in the task result: messages in `LinkedInConversation`, connections in `LinkedInConnection`, requests in `LinkedInInvitation`, invites in `LinkedInInvite`, profile reads in `PersonSnapshot`, feed snapshots as page reads. The My network index (`Person`) is built from them.
- A block's Input tab already shows a made-up sample item of the kind it takes (`SAMPLE_BY_KIND`, `apps/body/src/components/workflows/api-sample.ts`); the Output tab shows what the last run really gave (`block-output.tsx`). Item kinds are `post`, `profile`, `company`, `job`, `ad`. Items a block does not take are turned into what it takes where they can be (posts become their authors); that rule lives with the block definitions in contracts.
- The engine has no "wait for the owner's approval" step (deferred in `MEMORY.md`).
- Not blocks today: sign-in check (the system schedules it) and the browser test (no account).

## Blocks this plan introduces

Eleven new blocks (type ids follow `account.<name>`), and four existing ones that move onto the runner: 15 blocks in the group, 14 of them task blocks.

**Read blocks (collect from an account)**

| # | Block name | Type | Task | Gives |
| --- | --- | --- | --- | --- |
| 1 | Get my connections | `account.getConnections` | `linkedin-connections` | people, with the day they connected |
| 2 | Get my conversations | `account.getConversations` | `linkedin-messages` | **conversations** (new item kind) |
| 3 | Get my connection requests | `account.getRequests` | `linkedin-invitations` (read) | people, with their note and when |
| 4 | Read profile with my account | `account.readProfile` | `linkedin-profile` | people, with header, about, experience, education, skills |
| 5 | Get my feed posts | `account.getFeed` | `linkedin-browse` | posts from the feed |

**Act blocks (take items, give them back with a result)**

| # | Block name | Type | Task | Takes |
| --- | --- | --- | --- | --- |
| 6 | Send connection request | `account.sendInvite` | `linkedin-invite` (send) | people |
| 7 | Withdraw connection request | `account.withdrawInvite` | `linkedin-invite` (withdraw) | people with a pending invite |
| 8 | Answer connection requests | `account.answerRequests` | `linkedin-invitations` (accept or ignore) | people from "Get my connection requests" |
| 9 | Send message | `account.sendMessage` | `linkedin-message` | people (a conversation counts as its person) |
| 10 | Reply in a conversation | `account.replyToConversation` | `linkedin-reply` | conversations |
| 11 | Remove connection | `account.removeConnection` | `linkedin-connections` (remove) | people |

**Existing, moved onto the runner with no change for owners:** Select accounts (`account.select`), Visit profile (`account.visitProfile`), Visit company (`account.visitCompany`), Write a post (`account.writePost`).

**Every spider task has a block, except two the owner left for later (2026-11-02).** The sign-in check (`linkedin-login`) and the browser test (`browser-detection`) are not built now; they go in the guard test's "no block" list with that reason.

| Task | Block or blocks |
| --- | --- |
| `browser-detection` | None for now (left for later by the owner) |
| `linkedin-login` | None for now (left for later by the owner) |
| `linkedin-browse` | Get my feed posts, new |
| `linkedin-messages` | Get my conversations, new |
| `linkedin-profile` | Read profile with my account, new |
| `linkedin-post` | Write a post, existing |
| `linkedin-reply` | Reply in a conversation, new |
| `linkedin-message` | Send message, new |
| `linkedin-invitations` | Get my connection requests and Answer connection requests, new |
| `linkedin-connections` | Get my connections and Remove connection, new |
| `linkedin-invite` | Send connection request and Withdraw connection request, new |
| `linkedin-view-profile` | Visit profile, existing |
| `linkedin-view-company` | Visit company, existing |

Count: 11 tasks have blocks, as 14 task blocks (three tasks both read and act, and a read gives items and takes none while an act takes items and gives them back, so each is two blocks: the owner chose this, 2026-11-02), plus Select accounts, which is not a task: 15 in the group, 11 of them new, 3 task blocks existing (Write a post, Visit profile, Visit company).

## Proposal

### 1. One runner for every task-backed block

A block of this kind is a short definition, not a new executor:

- Contracts: the block entry (as now) plus an `action` description: the task name, whether it **reads** (gives items) or **acts** (takes items), what it takes and gives, and a `sample` (`in` and `out` made-up items, each with the result the block would give).
- Brain: one runner `runAccountAction(ctx, action)` that does what the visit block does today, once, for all: choose the accounts (below), ask the block's own domain service (never the task directly, so every existing limit stays), one call per item (acts) or one per account (reads), `Waiting` until the calls end, the block's time limit, one retry on another account, a preview that asks nothing, Stop honoured. Domain services stay the owners of the rules; the runner only asks and waits.
- One additive table `AccountActionCall` (`runId`, `nodeId`, `slug`, `accountId`, `sessionId`, `state`, `result` JSON, `tries`; unique on `runId, nodeId, slug`) so a repeated tick or a resumed run never asks twice. The visit and post blocks keep `LinkedInPageVisit` and `PostPublication` as their domain records; the runner only drives them.
- Result on the item: an acted-on item leaves the block with a small `result` (`action`, `status` such as SENT, QUEUED, NOT_AVAILABLE, SKIPPED, UNKNOWN, `account`, `at`), shown in the Output tab and the CSV and readable by a block after it (If, Filter), so "message only the ones that were visited" and "go on with the ones that replied" need no new block.

### 2. Accounts: two ways, on every account block

Every account block has a setting **Accounts**: **From "Select accounts" before it** (the nearest one; with none the run is refused with a clear message, as the visit blocks do today) or **One account** (a picker of the owner's accounts). Reads with a pool read each account in turn and merge by person; acts take turns as today. Saved visit and post blocks read as "From Select accounts" so nothing changes for them.

### 3. Time limits on the block

Every account block has **Stop waiting after (hours)**: acts start at 8, reads at 2, between 1 and 48. When it passes, what is not done is left for the next run and the step says how many (the daily and 30 day rules stop repeats).

### 4. A new item kind: `conversation`

- A conversation item: the person (name, slug, headline), the last message (200 characters), when it was, who wrote last (you or them), unread, and the thread's id. No attachments. Kept 90 days like other items, never logged.
- It is a kind of its own in contracts (`ItemKind`), the canvas (port colour, `KIND_WORDS`), the samples (`SAMPLE_BY_KIND`), the CSV and the item panel.
- Conversion rule: a block that takes people and receives conversations uses each conversation's person (the same rule that turns posts into authors), so "Get my conversations" can feed "Visit profile", "Score" or a list. "Reply in a conversation" takes conversations only.

### 5. Samples and results

- Each block's definition carries `sample: { in, out }`, made up (people, companies, posts, conversations that do not exist, never the data supplier's name). The Input tab shows the sample input as now (from the block, not only the kind); the Output tab of a block that has not run shows the sample output marked "Sample", and after a run shows what it really gave.
- Every acted-on item shows its `result` in the Output tab, the CSV and the item panel.
- The estimate says time, not money: items times the task's usual minutes (`budget.estimateS`) over the accounts, with the daily caps ("40 people, 2 accounts: about 70 minutes; at most 30 a day").

### 6. Acting for real is switched on by the owner

Send message, Reply in a conversation, Send connection request and Remove connection (and Answer connection requests, which changes the owner's network) have a setting **Act for real** that starts off. While it is off a run does everything but ask nothing and the step says "Switch on 'Act for real' to let this block send." The owner switches it on after seeing a preview. Changing the words of a message or the action turns it off again. This is the owner's go-ahead for the first live run, kept simple: no new approval step in the engine.

### 7. Rules per block

- Send message: connections only (others skipped and counted); `REPLY_LIMITS` (first messages 15 a day per account); the person's name and company filled in; one send per person, an unsure result is UNKNOWN and never retried.
- Send and Withdraw connection request: through the invite planner (spread over days, 20 a day and 100 a week per account, the monthly note allowance, `INVITES_LIVE`). The step ends when the invites are planned and says so; the My network page shows the sending. (This question was not answered; change it if you want the step to wait for the sending, which takes days.)
- Answer connection requests: setting Accept or Ignore, at most 50 per run.
- Remove connection: conservative cap (10 a day per account, unverified against LinkedIn's own), Act for real off until switched on, UNKNOWN never retried.
- Visit and Write a post: unchanged limits.

### 8. The next tasks become blocks without a plan each

- A guard test in contracts and brain: every task in the spider catalog is either in the table of account actions (with its block type) or in a short "no block" list with a reason (today: `linkedin-login` and `browser-detection`, "left for later by the owner"). A new task fails the test until it has one or the other.
- The `spider-task-writer` skill checklist and `.github/copilot-instructions.md` get one line: a task that uses an account ships with its block definition and sample (or an entry in the "no block" list).

### 9. Safety

- Everything acts as the signed-in owner on the owner's own accounts, inside the limits the domain services already enforce; the runner never raises a limit, never passes `confirmed`, and a pool only adds accounts, each inside its own limits.
- A preview asks nothing and says so. Stop ends the step at once for anything not yet asked.
- Irreversible steps keep `markAttempt` in the task; an unsure outcome is UNKNOWN and is shown, never retried. Do not contact and suppressed people are skipped by every act block, counted, never asked.
- Messages go only to connections and the daily caps are conservative; no block can be used for bulk messages to strangers, in line with the code of conduct.

### 10. Called directly by API

- Today a block that can start a chain says in its `api` description what a call to "When called by API" may feed it, and the API tab shows a sample call (`.plan/api-fed-blocks-and-samples.md`). The account blocks have none: a visit block needs an input block between the trigger and itself.
- Upgrade: every account block gets an `api` description, so it can be the first block after the API trigger. Read blocks need no items; a call may only name the account. Act blocks take what they act on from the call:

| Block | A call may send |
| --- | --- |
| Visit profile, Send message, Send connection request, Withdraw connection request, Answer connection requests, Remove connection | `profiles` (LinkedIn profile links); Send message also `text`, Send connection request also `note`, Answer connection requests also `action` (accept or ignore) |
| Visit company | `companies` (company links) |
| Reply in a conversation | `conversations` (conversation links) and `text` |
| Write a post | `text` |
| Every account block | `account` (one of the owner's accounts, replacing the Accounts setting for that run) |

- A call's values replace the saved settings for that run only, as for the input blocks. A call can never switch Act for real on, never passes a limit, and never reaches an account that is not the owner's.
- The call gets the run's result back (a Give back block, or the run's own result): each item with its `result` (SENT, QUEUED, SKIPPED, UNKNOWN, and why), so the caller learns what happened to each person.
- "Directly" is a workflow with the API trigger and one account block, and (owner's answer, 2026-11-02) a ready-made shortcut: a button on every account block, **Create an API workflow for this block**, that makes and keeps a workflow of the trigger and that block, named after it, and opens its API tab with the sample call. The workflow API stays the only server endpoint; no separate endpoint family per block.

### 11. Posting and replying, improved

Both tasks already exist (`linkedin-post`, `linkedin-reply`) and so does a block for posting, so no new task is built; the blocks get better. The improvements below are what I found missing for use in a workflow, to confirm (questions 15 and 16).

**Write a post** (existing block, task `linkedin-post`):

- Post from a saved draft or idea (Posting page) instead of writing it in the block, so the text is kept in one place.
- Post now (as today), or at a time ("at 09:30" or "after 2 hours"), through the Posting page's planner and its limits (`POST_LIMITS`, 3 a day per account).
- A call may send `text` and files (through an upload), as in section 10.
- The block gives a post item with its link and its result (POSTED, POSTED_NO_LINK, UNKNOWN, FAILED), so a block after it can use the link, for example in a message.
- The one hour wait becomes the block's own time limit setting (section 3).

**Reply in a conversation** (new block over `linkedin-reply`, the same task the Unibox uses):

- The reply may use the person's first name and company (filled in, as invites do).
- Files can be attached (the same attachment rules as the Unibox).
- Guards: reply only where they wrote last (on by default), and never twice to one conversation within 24 hours (settable).
- Keeps `REPLY_LIMITS` (40 a day, 5 queued, 30 s gap per account); what does not fit is left for the next run and counted.
- Gives the conversations back with a result (SENT, UNKNOWN, FAILED, SKIPPED with the reason); each reply also shows in the Unibox as today.

## Requirements

Confirmed (your request, 2026-11-02):

- Every spider task that exists and every one built later becomes a block (Account Actions).
- Each block has a sample input and a sample output result.
- A block can be added before and after to process the data.
- They behave like input and collect blocks.
- A second request the same day: a block for every one of the 13 tasks, and the existing blocks upgraded so they can be called directly with the API.

Answered by the owner on 2026-11-02:

1. A new **`conversation` item kind** (not a person with a message in it).
2. The **result on an item is readable by the next block**.
3. Messaging: connections only, 15 first messages a day per account, and the owner confirms the first live run (done through the "Act for real" setting, section 6).
4. **Reads and the pool: both options** (a pool from "Select accounts", or one account on the block), on every account block.
5. **Remove connection and Accept/Ignore are both built.**
6. Conversation items carry a 200 character excerpt, kept 90 days, no attachments.
7. **Time limits are settable on the block** (acts 8 hours, reads 2 hours by default).
8. **Visit and Write a post move onto the runner now** (phase 1), with no change for owners.
9. **The phase order stays** (reads, safe actions, messaging, then the rest), with the move of the existing blocks first.
10. **Samples are made up.**
11. **Two blocks for each task that both reads and acts** (14 task blocks), not one block with an Action setting.
12. **Called directly with the API:** yes to both the workflow API with the trigger and one account block, and a ready-made shortcut per block (a button that creates that one-block workflow). I read "yes" as both; say so if you meant only the first.
13. **Sign-in check and Browser test:** ignored for now, left for a later plan.
14. **Write a post:** all the improvements in section 11.
15. **Reply in a conversation:** all the improvements in section 11.
16. **No new tasks** for posting and replying: the existing tasks are improved.

Not answered (default taken, say so to change it): invites end the step when they are planned, not when sent.

Open questions: none.

## Scope and non-goals

- In scope: the runner, `AccountActionCall` (additive migration), the `conversation` kind, item `result`, the eleven new blocks and the move of the four existing ones, the improvements of Write a post and Reply in a conversation, the `api` descriptions of every account block and the "Create an API workflow for this block" shortcut, the accounts setting and time limit setting, Act for real, samples in definitions and the Output tab, estimates, the guard test, the skill and instruction lines, tests, `MEMORY.md`.
- Out of scope: the sign-in check and browser test blocks (a later plan), changing any task's behaviour or limits, new tasks (like, follow, comment), changing the Unibox or My network pages, choosing accounts by client, weighting accounts, triggers that start a workflow when something arrives (a new message, a new request), an approval step in the engine, a spider change unless a task cannot give what its block needs (then it is raised here first).

## Approach (one commit per phase, tests first)

- [x] 1. Foundation and the move (done 2026-11-02, with three parts moved to the phases that need them): done are `sample` and the guard table `ACCOUNT_ACTION_TASKS` (spider test), item `result`, the `conversation` kind, the Accounts and time limit settings on Select-accounts users (Visit profile, Visit company, Write a post), the read runner (`runAccountRead`) with `AccountActionCall`, the sample in the Output tab, and the proof block "Get my connections" (with an `account` API field). Moved: the visit loop onto a shared act runner, the `api` descriptions of the existing blocks, the time-based estimate text and "Act for real" go to phase 3 and phase 4, when the first act blocks need them (one more consumer than the visit blocks, so the shared parts are known by then).`action` description and `sample` in contracts, the guard test, item `result`, the `conversation` kind (contracts, canvas, samples), the Accounts and time limit settings, Act for real, the runner with `AccountActionCall`, the Output tab sample and estimate text. Move Select accounts, Visit profile, Visit company and Write a post onto the runner; their existing unit and integration tests pass unchanged. Prove the runner with "Get my connections". Every block added in any phase ships with its `api` description and a sample call.
- [ ] 2. Write a post improved (section 11) on the runner.
- [x] 3. Reads (done 2026-11-02): Get my conversations, Get my connection requests. Conversations become the person in them for a block that wants people. Found while building: `linkedin-profile` reads only the account's own profile, so "Read profile with my account" becomes "Get my profile" (the account's own profile as one person) and stays planned, not built (brain: each import service tells which rows a session touched, so a block gives exactly its run's rows; today a block gives the stored list once its read was stored).
- [x] 4. Safe actions (done 2026-11-02): Answer connection requests (accepts or ignores the waiting requests of the people it gets, "Act for real" off by default, API fields deferred), Send connection request (through the invite planner from the chosen account's client, people not yet in My network join it when their invite is queued, note with {first_name} and {company}, "Act for real" off by default, step ends when planned, each person says when it goes), Withdraw connection request (cancels an invite that had not gone, queues a sent one for the withdraw run, no "Act for real" as the plan lists none).
- [ ] 5. Messaging: Send message, Reply in a conversation (improved as in section 11).
- [ ] 6. Get my feed posts; Remove connection.
- [ ] 7. The "Create an API workflow for this block" shortcut on every account block.
- [ ] 8. Skill and instruction lines, `MEMORY.md`, live check with two test accounts on a short list (your go-ahead before any live action).

## Edge cases and risks

- **Moving live blocks:** the visit and post blocks run today. The move must change nothing: their integration tests run unchanged against the runner, and a saved block reads the same settings (`accounts` mode defaults to the pool, no time limit change beyond today's 8 hours).
- **Reads that end in tables:** the block must give the rows of its own run, not everything stored. Each import service needs to record the session on the rows it touched (or return the slugs); where a task cannot say, the block reads by the session's time window and says so before it is built.
- **Long waits:** acts take minutes per person per account; the runner reuses `Waiting`, the 5 s tick, the one-task-per-account policy and the daily caps; a workflow with many people ends its step after the time limit and the next run continues.
- **Idempotency:** `AccountActionCall` is unique per run, block and person; a retried tick finds the row and does not ask again; UNKNOWN is final.
- **Account state:** signed out, paused, blocked, at its limit or busy accounts are skipped with a stated reason; none usable at start fails the step; a "One account" block whose account is gone fails with a clear message.
- **Do not contact and suppressed:** skipped by every act block and counted.
- **Privacy:** conversation excerpts and request notes are personal data; capped, kept for the item retention only, never logged, never in a shared place; the owner's data only, tested against another owner.
- **Act for real:** off by default on every sending or removing block; a saved workflow never starts sending because of this plan.
- **LinkedIn rules:** every act block stays inside the existing limits and policy; messaging is to connections only; nothing here collects other people's data beyond what the owner's own account already shows them.
- **Dev vs production:** `INVITES_LIVE` is respected; previews never ask; staging needs the spider worker version that has each task (the visit block once waited 7 minutes against an old worker, see `MEMORY.md`).
- **Rollback:** a code revert; the new table stays unused.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests.
- Unit: the guard test (every task has a block or a reason), each block's config and estimate, the runner (pool order, one account, caps, time limit, retry, preview, stop, UNKNOWN never retried, Act for real off), the conversation kind (conversion to people), samples never name the supplier.
- Integration (Postgres): each block against its domain service with a fake task result (reads give exactly the run's rows, acts respect caps, idempotent ticks, another owner's data never shows), and the existing visit and post tests unchanged.
- Real path: a workflow on the canvas with two test accounts: Get my connections into Visit profile, and a read into an If into Send message as a preview, then a live run on your go-ahead.

## Outcome

Filled in when done.
