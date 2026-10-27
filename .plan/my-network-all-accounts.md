# My network: all accounts at once, and a button to read several accounts

- Status: done 2026-10-27 (built and tested; the combined page looked at in a browser on the sample views; not run against real accounts)
- Created: 2026-10-27
- Locked by user: yes, 2026-10-27
- Builds on: `.plan/my-network-invitations.md` (the page, the task, brain). That plan listed "an all-accounts view" as out of scope; this one adds it on the owner's request of 2026-10-27.

## Goal

On `/network` the owner sees the connection requests of all their signed-in accounts in one list (each row says which account it is for), and can start a read for the accounts they pick or for all of them with one button, without opening the accounts one by one.

## What the code does today (checked 2026-10-27)

- The page shows one account at a time (`Network.tsx`: `useParams` account id, `AccountPicker` select, `useNetwork(source, accountId)`); an account that is not signed in is greyed and cannot be picked. The screenshot from the owner's local machine shows "No account is signed in": none of the local accounts is ACTIVE (they are PENDING or ERROR), so the page has nothing to show there until Test login makes one ACTIVE.
- Brain has `network.waiting` (counts for many accounts), `network.list` (one account), `network.refresh` (one account), `network.answer` (one account, at most 10, 50 a day per account). `TaskService.request` takes one account and the policy allows one run per account at a time.
- The spider consumer takes one task at a time (`channel.prefetch(1)`): a read of many accounts is a queue, about 30 to 45 s per account on one worker, so 20 accounts take 10 to 15 minutes unless there are more workers.
- The page holds an answer 5 s in the browser (Undo) and then calls `source.answer(accountId, asks)`; the budget refusal opens Start anyway for one account.

## Requirements

Confirmed by the owner, 2026-10-27 (all four recommendations):

- `/network` shows all signed-in accounts together; the picker narrows to one or several (`?accounts=a,b`); `/network/:accountId` stays as one account.
- Answering from the combined list is allowed; the page groups the chosen rows by account and asks one run per account, with the 5 s Undo for the whole batch; limits stay per account.
- One Read click starts every picked account (all signed-in ones when none is narrowed), queued, with per-account progress.
- Accounts that are not signed in or refused by the browse budget are skipped with their reason in a short result, and Start anyway is offered for the budget ones.

Open questions: none.

## Scope and non-goals

- In scope: the combined list, a multi-account picker, a Read button for the picked accounts or all, per-account progress and result, answers grouped per account, tests, the sample preview for the combined view.
- Out of scope: reading more often than on demand (the daily read is its own plan, `.plan/my-network-daily-read.md`), a per-account schedule, answering in bulk across more than the per-account limits, merging the same person who asked several of the accounts into one row.

## Approach

- [ ] 1. Brain `LinkedInInvitationService.listMany(userId, accountIds)`: one call for many accounts, scoped to the owner (a foreign id is dropped; none left answers NOT_FOUND). It returns `accounts` (per account: id, `readAt`, `total`, `reading`, `answeredToday`, `problem`) and one flat `requests` list in each account's LinkedIn order, each request carrying its `accountId`. It is capped (1,000 open and 200 over in all) and says when it cut, so a poll every 1.5 s stays small.
- [ ] 2. Brain `refreshMany(userId, accountIds, startAnyway)`: asks a read for each account the owner owns and that is signed in, one at a time so one refusal never stops the others; answers `{ started: [...], skipped: [{ accountId, reason, budget }] }`. A budget refusal is marked so the page can offer Start anyway for just those accounts.
- [ ] 3. tRPC: `network.list` and `network.refresh` take `accountIds` (up to 100) and replace their one-account forms (one account is the case of one id; no duplicate calls kept); `waiting` and `answer` stay as they are. Tested like the other calls.
- [ ] 4. Body source: `NetworkSource` gains `loadMany` and `refreshMany`; `createTrpcSource` calls them; the sample source implements both over its per-account stores.
- [ ] 5. Body hook: `useNetwork` takes `accountIds[]`; the query is the combined one; `read` asks `refreshMany` and keeps the per-account result; `answer(asks)` groups the asks by account, holds the whole batch 5 s (one Undo for the batch), then asks `source.answer` for each account in turn; a budget refusal for some accounts opens Start anyway naming how many.
- [ ] 6. Pure modules (tested): `selection.ts` keeps the cap per account (10 a run, and what each account's day has left) instead of one cap; `rows.ts` keeps filter and search and adds a filter by account; a small `accounts-state.ts` says per account whether it is reading, when it was last read, and a one-line summary of a read ("Reading 3 of 8 accounts").
- [ ] 7. Page: the account `Select` becomes a multi-select popover (All signed-in accounts, each with its waiting count and last read; not-signed-in accounts greyed with the reason, as now); the header button reads "Read N accounts" (all when none is narrowed) with a result line after it; each row shows the account (mark and name, small) when more than one account is shown; the header of the list shows "3 chosen on 2 accounts"; `?accounts=` keeps the picked accounts in the address.
- [ ] 8. Tests first: brain unit and the Postgres integration case for `listMany` (scoping, order, cap) and `refreshMany` (skips, one refusal does not stop the others); body unit tests for the grouped answer, the per-account cap, the account filter and the read summary; the page is looked at in a browser with the sample views (many accounts, one reading, one refused).
- [ ] 9. Gate (`pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`); a real run on staging with two accounts; plan `done`, Outcome, `MEMORY.md`.

## Edge cases and risks

- Worker throughput: with one spider worker the reads of many accounts run one after the other (about 30 to 45 s each), so "Read all" on 20 accounts takes 10 to 15 minutes. The page must show per account that it is waiting, reading or done, and must not call a slow read a failure. More workers shorten it; nothing here raises the concurrency.
- Poll size: the combined poll every 1.5 s while anything is busy must stay small (the cap above, and polling only while an account is reading or an answer is queued).
- Different `readAt` per account: the header shows the oldest ("some accounts last read 2 days ago") rather than one time that is wrong for some.
- Answering across accounts: a batch can touch several accounts; each account's run is separate, so one can be refused (day limit, busy, budget) while the others start. The result names which, and the rows of the refused ones return to waiting. Undo cancels the whole batch while it is held.
- Daily limit per account: the selection cap must use each account's own `answeredToday`; a row of an account that has used its day cannot be chosen, with the reason.
- The same person may have asked several accounts: they are separate rows with their own account; no merge (out of scope).
- Account state changes while the page is open (an account is paused or signed out): the next poll marks it with its reason and removes its rows from the choosable set.
- URL tampering: `?accounts=` ids that are not the owner's are dropped; none left shows the empty state; the server answers NOT_FOUND for foreign ids in any case.
- Start anyway for many accounts: one dialog that says how many accounts are outside their hours and asks once; it asks again only for those.
- Existing data and migrations: none; this adds calls and UI only.
- Security: every call is scoped to `ctx.user.id`; no request id of LinkedIn leaves brain.
- Rollback: removing the combined view is a revert of this change; nothing is stored differently.
- Local machine: the owner's local accounts are not ACTIVE (screenshot), so the page shows "No account is signed in" there; use Test login or the sample view (`?sample=`) to see the combined list locally.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- `pnpm --filter @automatedLinkedIn/brain exec vitest run src/database/linkedInInvitation.service.integration.test.ts` (needs Postgres).
- In a browser with `?sample=` (several accounts, one reading, one refused) and on staging with two real accounts: Read all, watch each account go reading then done, answer one request on each account in one batch.

## Outcome

Built 2026-10-27, gate green, Postgres service test passes (list of several accounts, skipped and budget-refused accounts), the page seen in a browser through a throwaway harness (deleted) on the sample views: 3 accounts in one list of 24, "To <account>" on each row, "24 chosen on 3 accounts", the multi-select, and one Start anyway dialog for three accounts refused by the budget. NOT run on real accounts. Brain: `network.list({ accountIds })` and `network.refresh({ accountIds, startAnyway })` replace the one-account forms (`LinkedInInvitationService.list` batches its queries: one for the accounts, the waiting and the over rows, the day's count and the latest run per account; the answer is cut at 1,000 open and 200 over and says so); `refresh` asks the accounts one by one, a refused account is skipped with its sentence and `budget`, one that is busy counts as asked. `waiting` and `answer` are unchanged (answers stay per account). Body: `NetworkSource.load/refresh` take account ids, `NetworkRequest` carries `accountId`, the snapshot is `{ requests, accounts, cut }`; `useNetwork(source, ids)` groups a batch by account (`answersByAccount`), holds it 5 s for one Undo and then asks each account in turn, and a budget refusal opens one Start anyway dialog for the accounts it touched; `selection.ts` keeps the cap per account (`CapOf`); `accounts-pick.ts` holds the `?accounts=` rules; `AccountPicker` is a multi-select popover; rows say which account they are for when more than one is shown; the header says "N chosen on K accounts". The sample source makes every account of the preview a person list of its own. Deviations: (1) `rows.ts` has no account filter (the picked accounts are asked for server side, so the list only holds them); (2) the same cap of 1,000 open rows applies to all accounts together, so very many accounts with long lists show "Too many to show at once"; (3) one Read click asks every shown account at once and the spider worker runs them one after the other, so many accounts take minutes (progress is per account in the header: "Reading 2 of 8 accounts"). Follow-ups: nothing stops a very long queue of reads; no per-account result list after a read beyond a short toast.

Filled in when done.
