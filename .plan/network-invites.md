# My network, phase 2: invites, acceptance, withdraw and the full results line

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-10-30
- Locked by user: yes, 2026-10-30 (build offline first, record later; hold an invite whose note is refused; P1 to P5 as proposed)
- Parent: `.plan/network-hub.md` (locked 2026-10-30; sections 3, 4, 5 and phase 2). Branch `feat/network-invites`.

## Goal

From `/network` the owner invites the right people of one client (one row, a selection, or the Needs me list) with an optional
note; each account sends at most 20 a day and 100 a week, spread over office hours; accepted invites are found by a daily read
of the newest connections; invites still pending after 3 weeks are withdrawn; the results line shows Invited, Accepted (%),
Replied and cost per accept by account and by found-by.

## Requirements

Confirmed (from the locked parent plan):

- Limits per account: 20 a day, 100 a week, 30 to 90 s apart, inside office hours and the browsing budget.
- Skipped with a reason: do not contact, already connected, a request pending either way, invited or withdrawn by any account of
  this client in the last 3 weeks.
- Dialog: note up to 300 characters with "Insert first name" and "Insert company"; account choice only with several accounts;
  one sentence "You can safely send 20 today. 120 selected: 20 today, the rest over the next 6 days."; capped at 14 days of the
  client's capacity, the rest refused in that sentence.
- States: Queued, Sent (`invitedAt`), Accepted (`acceptedAt`), Withdrawn, Failed. `markAttempt` before Send, `UNKNOWN` when
  unclear, never retried; `SIGNED_OUT` verdict.
- Acceptance: while the account has pending invites, a daily read of the newest connections, page after page until one already
  known appears.
- Pending after 3 weeks: withdrawn automatically.
- An account that is `SIGNED_OUT`, restricted or failing stops its queue: red chip, a line on the Today bar, an item in the cron
  monitor; nothing retried until it signs in again.
- Results line with 7 / 30 / 90 days: Invited · Accepted (%) · Replied, and a table by account and by found-by with Invited,
  Accepted, Replied, Data spent and Cost per accept ("n/a" with no accepts). Credit goes to the source that led to the invite
  (else the first source).
- Today line gets "Invite N"; nothing to do says "All done for today. N invites are waiting for an answer."

Proposed (to confirm):

- P1. One `linkedin-invite` run sends up to 5 invites, 30 to 90 s apart. The browsing budget keeps 10 minutes between
  sessions, so one invite per session could not reach 20 a day inside office hours.
- P2. The same task also withdraws (input `withdraw`, up to 10 a run, from the Sent tab of "Manage invitations"), so a run can
  do both and no extra task name is needed.
- P3. "Ready to invite" in Needs me = people of the client found by a workflow list or a target profile, fit Strong or Maybe,
  status New, no link to any account of the client (no connection, request, conversation or invite). Strong first.
- P4. The invite queue is planned per day: each queued invite gets a planned day when it is queued (today until the account's
  20 or the week's 100 is used, then the next days), so the dialog sentence and the real sending agree.
- P5. A selection of up to 100 rows is the bulk unit (as in phase 1); "All N matching" stays the follow-up it already is.

Answers (2026-10-30):

1. Build everything offline first; the owner records later. Until a live run passes, the dialog selectors are unverified and
   Invite stays hidden on the page (a flag in body, `INVITES_LIVE`).
2. A refused note holds that invite (`NOTE_REFUSED`, state FAILED with the reason; nothing sent).
3. P1 to P5 locked.

Open questions: none.

The questions as asked:

1. The invite steps after the Connect click were never recorded: the "Add a note / Send without a note" dialog, the note box,
   the pending state after Send, Connect hidden under "More", the email-required and weekly-limit notices, and the Sent tab with
   Withdraw. Seen so far (kept pages, 2026-10-28 and 2026-10-29, accounts dharmendrashaheagle and tripti.verma): the profile's
   Connect is `a[href^="/preload/custom-invite/?vanityName=<slug>"]` with `aria-label="Invite <Name> to connect"` and
   `componentkey="ConnectButtonstate:invitation:urn:li:member:<id>_connect"`. Who records the rest: (a) you record it with
   `dev:record` on a test account (invite one person with a note, one without, withdraw one), or (b) I run it and really send
   invites to people you name?
2. Free accounts get only a few notes a month from LinkedIn. When LinkedIn refuses the note: (a) hold that invite and say why
   (proposed), or (b) send it without the note?
3. Are P1 to P5 right?

## Scope and non-goals

- In scope: spider task `linkedin-invite` (send, withdraw), the connections read stopping at the first known row, brain table
  and queue, limits, jobs (send, acceptance read, withdraw), people index (INVITE link, Contacted, Waiting), `people.invite*`
  procedures, results by period, body Invite button, dialog, bulk, Today line, results table, account red chip.
- Out of scope: "All N matching" background bulk, client log-in (phase 3), invites from a workflow block, follow-up messages
  after an accept, InMail, invites by email.

## Approach

### Brain

- [x] Migration `20261030140000_add_network_invites` (additive, one transaction): `LinkedInInvite` (states `QUEUED`, `SENDING`,
      `SENT`, `ACCEPTED`, `WITHDRAW_QUEUED`, `WITHDRAWING`, `WITHDRAWN`, `FAILED`, `UNKNOWN`, `SKIPPED`, `CANCELLED`; `plannedAt`,
      `tries`, `source`, wait fields), `InviteImport`, `PersonLinkKind.INVITE`, account `invitesStoppedAt/StopReason/StopUntil` and
      `nextAcceptReadAt`, partial unique index `LinkedInInvite_one_live` (one live invite per client and slug), index trigger;
      Needs me priorities moved up by one and every person marked for a rebuild.
- [x] Pure `inviteRules.ts`: skip reasons, `planInvites` (24-hour blocks, 20 a day, 100 over 7 blocks, 14 days), the sentence,
      `fillNote`, outcome to state, `INVITES_LIVE` (false).
- [x] `LinkedInInviteService`: `plan`, `invite`, `cancel`, `ofPerson`, `dispatchNext`, `dispatchWaiting`, `store`,
      `markAccepted`, `newestConnections`, `endStale`.
- [x] Hook `linkedInInvite.hooks.ts`: back to the queue when nothing was pressed, else unsure until the file settles; stops the
      account on `SIGNED_OUT`, `RESTRICTED` (until the next good sign-in) and `LIMIT_REACHED` (a week after the oldest invite of its
      week); queues `InviteImport`.
- [x] Jobs: `invite-send` (every minute: import, withdraw after 21 days, stale runs, dispatch with items); the acceptance read
      is `accept-read` in `account-daily`. Labels in `jobs/describe.ts`.
- [x] People index: INVITE link, "Invited" / "Accepted your invite", Contacted, Waiting while pending, ready to invite (P3).
- [x] Router `people`: `invitePlan`, `invite`, `cancelInvite`, `invites`, `results` with `days`; `today` gains `invites`,
      `waitingInvites`, `invitesLive`, `stopped`.
- [x] Tests: `inviteRules.unit.test.ts`, `linkedInInvite.hooks.unit.test.ts`, `accountDailyJob.unit.test.ts` (accept read),
      `linkedInInvite.service.integration.test.ts`.

### Spider (copy of `.github/skills/spider-task-writer/assets/checklist.md`; ticked as it goes)

#### 1. Plan
- [x] Plan exists; good run = every invite answered SENT (or SKIPPED with a reason) and the account still signed in.
- [x] Open questions empty and locked.
- [x] Name `linkedin-invite`, version 1; input `{ send (max 5), withdraw (max 10) }` (`inviteInputSchema` in contracts);
      outcomes and verdicts in `packages/contracts/src/invites.ts` and `tasks/linkedinInvite/index.ts`.
- [ ] Write task: the irreversible steps are Connect (it may send at once on some layouts), Send and Withdraw; the test account
      and the people invited live are still to agree when the owner records.
#### 2. Lifecycle
- [x] Assumes a signed-in feed; no own sign-in.
- [x] Every profile and the Sent tab are checked (`session.open` / `signedIn`, restriction by `kindOf`); `SIGNED_OUT` declared
      and tested on the first and a later page.
- [x] `commitSession` on DONE and PARTIAL.
- [x] Ends on a normal page (dialogs closed with Escape).
- [ ] Two runs in a row on the test account; complete run folders. (Not run live.)
- [ ] One deliberate failure read from its run folder alone. (Not run live.)
- [x] n/a: no run folder seen yet.
#### 3. Evidence
- [ ] Markup of the dialog, pending state, More menu, notices and the Sent tab captured. (Waits for the owner's recording.)
- [x] Two layouts looked for: the Connect link is the same on both accounts' kept pages.
- [x] Plain CSS selectors in `linkedin/markup.ts` with dates and an UNVERIFIED note.
- [x] Unverified parts listed (markup.ts comment, Outcome, MEMORY).
#### 4. Tests first
- [x] Fixtures `linkedin/inviteFixture.ts` (connect, pending, suggested people, dialog with note, Premium offer, limit, email,
      Sent list). Connect under More: not built (unseen), answered NO_CONNECT with the page kept.
- [x] Reader tests `inviteReader.unit.test.ts`.
- [x] Task tests `run.unit.test.ts`: sent with and without note, no Connect, pending, note refused, unsure after Send, limit,
      twice delivered, `/uas/login` first and later, not a profile, withdraw and not pending.
- [x] Nothing pressed before `markAttempt`, once per run; Send pressed at most once per invite; a run stops at the first unsure.
- [x] n/a: no new driver call.
- [ ] e2e stand-in: not written; the real page shape is unknown.
#### 5. Build
- [x] `tasks/linkedinInvite/`, registry line.
- [x] `defineTask` fields (`budget` ACTION 420 s, `policy.oneAtATime`, 15 min limit, recording always).
- [x] `markAttempt()` before the first press of the run (Connect or Withdraw).
- [x] Bounded waits.
- [x] 30 to 90 s between invites (contract `gapSeconds`).
- [x] Fixed sentences only; the note never in logs or results.
- [x] Failed runs keep their page through the runner; steps that do not show keep up to 6 pages.
#### 6. Brain side
- [x] Contracts schemas, `dist` rebuilt.
- [x] Hook entry tested.
- [x] Catalog parses (`registry.unit.test.ts`).
- [ ] Spider worker restarted (owner, when deploying).
#### 7. Verify
- [x] Definition of done passes.
- [ ] Devtools run on the test account.
- [ ] Failed runs read from the folder.
- [ ] Staging run: not before the recording; Invite stays hidden (`INVITES_LIVE` false).
#### 8. Close
- [ ] Plan done (stays in progress until the live run), MEMORY updated, conventional commit.

### Connections read

- [x] `linkedin-connections` v2 input `stopAtKnown` (newest 50 stored): stops at the first known row; such a read is DONE but
      never `complete`, so nobody unseen is called gone. Brain sends it only to a worker that announced v2.

### Body

- [x] Next step Invite (row and drawer), `InviteDialog` (one or a selection; account only with several; note with Insert first
      name and Insert company; the sentence from brain), bulk Invite, Today "Invite N" and "N invites are waiting for an answer",
      a line per stopped account, red account chips, History lists invites with Cancel for queued ones, results line with
      7/30/90 and a Details table by account and by found-by. All invite parts show only when `invitesLive` is true.

## Edge cases and risks

- Highest LinkedIn risk of the product: caps are checked in the database at queue time and again at dispatch (row lock on the
  account), so two tabs or two clients cannot exceed 20/100. `UNKNOWN` counts toward the caps and is never resent.
- Same person queued by two accounts of a client: refused at queue time (one live invite per client and slug, partial unique
  index).
- Person erased or marked Do not contact after queuing: dispatch re-checks and ends it `SKIPPED`.
- Account moved to another client while invites are queued: they stay with the client they were queued for; dispatch refuses
  them (`SKIPPED`, "The account moved to another client").
- Weekly limit notice from LinkedIn before our 100: queue stops until the week rolls; the owner sees why.
- A note with names: inserted names are filled at dispatch from the person row; the note is not logged anywhere.
- Accept read cost: one session a day per account with pending invites, BACKGROUND class; stops at the first known row.
- A person who accepts and is later removed: acceptance stays (history).
- Rolling deploy: an old worker without the task makes brain answer `TaskUnavailableError`; invites stay queued.
- Migration additive; rollback = hide the Invite button, queued rows stay.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; brain integration tests for the service, hook and index;
  devtools runs of `linkedin-invite` on the test account (send with note, without note, withdraw); the page in a browser if a
  sign-in is available.

## Outcome

Built offline on 2026-10-30 (status stays in progress until the live recording and run):

- Shipped: everything in Approach that is ticked. Brain accepts and plans invites now; the page shows Invite and Needs me lists
  people ready to invite while the brain env `INVITES_LIVE` is true (default true, by the owner on 2026-10-30; `false` hides them;
  the page reads it from `people.today`).
- Deviations: the 3-week rule counts live, ACCEPTED and WITHDRAWN invites made in 21 days, not FAILED ones (a failed invite may
  be asked again). Connect under More is not tried (unseen; answers NO_CONNECT and keeps the page). Withdraw uses the Sent list
  (unseen). Days are 24-hour blocks from now, not calendar days in the account's zone; dispatch checks the real rolling 24 h and
  7 days. A connection read that stops early still moves `connectionsReadAt`.
- Verified: lint, ts:check, unit tests (contracts, spider, brain, body), build; brain integration tests serially (290 of 292;
  `messageBroker` ready count and the task outbox "old enough" test fail locally with a brain dev server running and do not touch
  this code). Migration applied to the local dev and test databases. Not run: any live LinkedIn step, the page in a browser.
- Follow-ups: the recording (Open questions 1), `INVITES_LIVE`, and the four near-copy import services (`InviteImportService`
  is the fourth) could share one helper.

### Recording of an invite without a note (2026-10-30)

- Session `session-2026-10-30T09-22-58-429Z`, account dharmendrashaheagle, a real invite sent to one profile from the feed.
- Seen: the person's Connect link three times in the page (one absolute with `lipi`); the click opens "Add a note to your
  invitation?" with "Add a note" and "Send without a note" inside the open shadow root of `#interop-outlet` (video only: the kept
  snapshots do not include shadow roots); "Send without a note" made `POST voyagerRelationshipsDashMemberRelationships?action=
  verifyQuotaAndCreateV2` (200 at once); the window closed; the top card still showed Connect for about 20 s, then Message and
  Pending.
- Changed: the task tries each copy of the Connect link, finds the window's buttons by their words among every button of the
  page (no container shape assumed), listens for that request before the first press and takes a 2xx as SENT and a 4xx as the new
  outcome REFUSED (FAILED in brain, the run stops), and waits up to about 30 s for Pending otherwise. A Connect that sends with no
  window is told by the same answer.
- Still unseen: the note box and its Send, Connect under More, the email and limit notices, the Pending button's label, the Sent
  list and Withdraw. Next: run the task once through the devtools (Run a task, LinkedIn invites, one person, no note) to confirm.

### Recording of an invite with a note, through More (2026-10-30)

- Session `session-2026-10-30T09-45-48-912Z`, dharmendrashaheagle: a top card with only Follow, Message and More; More opens a
  menu whose Connect is the custom-invite link with `role="menuitem"`; the window is an artdeco modal (`role="dialog"`,
  `send-invite`) with `aria-label`ed "Add a note" and "Send without a note"; the note window (video and the owner's screenshot only)
  shows "2 personalized invitations remaining for this month.", a box counting to 200, Cancel and a Send greyed until there are
  words; the same `verifyQuotaAndCreateV2` request answered 200.
- Changed: when no copy of the Connect link can be pressed, the task opens the profile's own More (an unnamed `button[aria-expanded]`
  saying More; the top bar's named More is left out) and presses the menu's Connect; after typing a note it waits for Send to
  turn on and sends nothing if it stays greyed. Deviation from the locked 300: the note limit is now 200 (`INVITE_LIMITS.noteChars`,
  body `NOTE_CHARS`), what a free account's box takes.
- Still unseen: the note box's markup, a month with no notes left, the email and limit notices, the Sent list and Withdraw.

### Live runs and the withdraw recording (2026-10-30)

- The owner ran `linkedin-invite` through the devtools: an invite without a note and one with a note were both SENT. A withdrawal
  (run `d2cef87e`) answered DONE with "0 of 1 withdrawn": the task looked for a Withdraw button, and the Sent list has a Withdraw
  LINK, so the row read as not pending (brain would have called the invite withdrawn).
- Recording `session-2026-10-30T10-07-21-893Z` (a real withdrawal): rows `[role="listitem"]` in `[data-testid="lazy-column"]`
  with a profile link and `a[aria-label^="Withdraw invitation sent to"]`; the window `dialog[data-testid="dialog"]` "Withdraw
  invitation" with Cancel and a Withdraw button named after the person (the page also holds ad `dialog`s); the press made
  `POST ...server-request?sduiid=com.linkedin.sdui.requests.mynetwork.addaWithdrawInvitation` and the row left.
- Changed: Withdraw is found as a link or a button in the person's row; the list is scrolled until the row shows or stops
  growing before an invite is called not pending (and that page is kept); the confirm is the window's button saying Withdraw;
  LinkedIn's answer to that request decides (2xx withdrawn, 4xx tried again later), else the row leaving the list.
- The owner then ran a withdrawal live with the fixed task, and it worked. Sending with and without a note, Connect through More,
  and withdrawing are now seen live on one account (dharmendrashaheagle); the email and limit notices are still unseen.
