# Run the daily visit from the accounts page, with its last and next time

- Status: done
- Created: 2026-10-19
- Locked by user: yes, 2026-10-19

## Goal

The owner can start the `linkedin-browse` task (the daily visit) for an account from `/accounts`, and sees on each row when it last ran and with what result, and when it runs next.

## What exists (2026-10-19)

- `linkedin-browse` (spider) and its brain hook; the job `account-daily` sends it once a day per ACTIVE account with a good sign-in in the last 24 h (`AccountDailyJob`, `.plan/account-daily-check.md`). The next time is `LinkedInAccount.nextBrowseAt` (not returned by `linkedInAccount.list` today; null until the first job pass draws it).
- A run is a `SpiderSession` row (`task = 'linkedin-browse'`, `status`, `verdict`, `message`, `startedAt`, `finishedAt`, `trigger`), indexed by `(linkedInAccountId, startedAt)`.
- `/accounts` already starts a task by hand: `trpc.task.run` with `LOGIN_TASK` through `TestButton` ("Test login"), blocked by `loginTestBlocker`. The server refuses with a sentence when a run is in progress or no proxy works.
- Result labels and colours come from the task catalog (`SessionStatusBadge`, `resultOf`, `useTaskCatalog`).
- The task's policy has `cooldownMs: 0`, so a manual run is only limited by "one at a time per account".

## Proposal

1. **Brain, data for the row.** `linkedInAccount.list` also returns:
   - `nextBrowseAt` (added to `metadataSelect`; not secret).
   - `lastVisit`: the newest `linkedin-browse` session of the account (`id`, `status`, `verdict`, `message`, `trigger`, `startedAt`, `finishedAt`), or null. One extra query for all the owner's accounts (`findMany` with `distinct: ['linkedInAccountId']`, ordered by `startedAt` desc), in `LinkedInAccountService`, not one query per row.
2. **Brain, start it.** No new endpoint: `task.run` with `task: 'linkedin-browse'` and the account id, as "Test login" does. Same ownership, proxy and one-at-a-time checks.
3. **Body, the row.** A new column "Daily visit" in `AccountsTable`:
   - Last: date and time, the result badge (`SessionStatusBadge`, with "Running" while in progress), "manual" or "daily" from `trigger`, a link to `/sessions?session=<id>`.
   - Next: date and time in the browser's time zone, or "After the next sign-in check" when the account is not ACTIVE, "Not planned" when paused, "Soon" when `nextBrowseAt` is null.
   - A "Visit now" `TestButton` in the same cell, blocked with a reason when the account is not ACTIVE ("The visit needs an account that is signed in; run Test login first"), is paused, or has no working proxy (same helper style as `loginTestBlocker`).
4. **Body, freshness.** After a start, refresh the list and poll every 3 s while any `lastVisit` is IN_PROGRESS (same approach as the proxies page), so the result appears without a reload.
5. **Hook.** `linkedin-browse` gets an `onRequest`: refuses an account that is not ACTIVE; for a manual request moves `nextBrowseAt` to the next day (`dailyTime`, timezone of the picked proxy's country). The job already moves it itself, so only `trigger === 'manual'` does.

## Requirements

Confirmed:

- The visit is started from the accounts section.
- The row shows the last time, the next time and the result.

Answered by the owner on 2026-10-19:

1. A manual visit counts as the day's visit: when it is requested, `nextBrowseAt` moves to the next day's random time (the same moment the daily job moves it), drawn in the day of the account's proxy country. Done in the task's `onRequest` hook.
2. 1 hour cooldown between visits (`cooldownMs` of the task; also applies to the daily job, harmless since a day is longer).
3. The button is disabled for accounts that are not ACTIVE, and brain refuses the request too (`onRequest` hook), so it holds without the page.
4. The same panel for the sign-in check: later, a separate change.

Open questions: none.

## Scope and non-goals

- In scope: the list fields, the column and button, polling, tests, `MEMORY.md`.
- Out of scope: changing what the visit does, changing the schedule rules, notifications, a schedule editor, the sign-in check's panel (question 4), new tables or migrations (everything needed is already stored).

## Approach

- [x] 1. Lock this plan (answer the questions).
- [x] 2. Tests first:
   - `LinkedInAccountService.listForUser`: returns `nextBrowseAt` and the newest visit per account, null when none, never another task's session, scoped to the owner (integration, Postgres).
   - Body: `visitBlocker` (not ACTIVE, paused, no proxy, ok) and the next/last text for each state (unit).
   - The hook refuses a not ACTIVE account and moves `nextBrowseAt` only for a visit that is not automatic (unit).
- [x] 3. Brain: `metadataSelect`, `lastVisit` query, resolver output (keep the type small, no Prisma `Json` in the output).
- [x] 4. Body: `visit.ts` (task name, blocker, next note), `visit-cell.tsx`, the column, `Accounts.tsx` mutation and polling.
- [x] 5. `cooldownMs` of one hour in `tasks/linkedinBrowse/index.ts`.
- [x] 6. Gates, `MEMORY.md`, Outcome. (The run through the page was not possible: see Outcome.)

## Edge cases and risks

- **Never visited:** `lastVisit` is null; show "Never". A new account has `nextBrowseAt` null until the job's first pass (up to 10 minutes): show "Soon".
- **Run in progress:** the server refuses a second start ("already running"); the button shows busy and the message is shown as for "Test login". A run that never ends is treated as stale after the existing limit and then shows as running only until then.
- **Time zones:** the next time is drawn in the proxy country's day (08:00 to 22:00 there) and shown in the browser's zone, so the hour can look odd; the tooltip says so.
- **Old sessions:** sessions older than 30 days are deleted on write, so after a long pause "Last" can be empty although visits happened.
- **SIGNED_OUT:** the hook sets `nextCheckAt` to now; the row shows "Signed out" and the status badge changes after the sign-in check, which the next list refresh picks up.
- **Retries and lost runs:** the outbox republishes; a result that arrives twice is applied once (existing), so "Last" cannot flip back.
- **Ownership:** `list` and `task.run` are owner-scoped; the new query filters by the owner's account ids only.
- **Compliance:** a manual visit is the same read-only day-in-the-life as the daily one (no likes, follows, messages or stored content); the cooldown and the one-at-a-time rule keep volume close to a person's.
- **Rollback:** a revert of body and brain; no migration, no data change.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; the brain integration test for `listForUser` (Postgres).
- Start a visit from `/accounts` against the local stack (brain, worker, spider, a test account) and watch the row go from "Never" to Running to a result, with a next time.
- Not verifiable without a real account on LinkedIn: that the real visit ends DONE; the page needs a signed-in browser session.

## Outcome

- Shipped: the "Daily visit" column on `/accounts` (last result and link, next time or a note, "Visit now" with a reason when blocked, polling while running); `linkedInAccount.list` returns `nextBrowseAt` and `lastVisit`; the `linkedin-browse` `onRequest` hook (refuses a not ACTIVE account, moves the next time for a visit that is not automatic); one hour cooldown on the task; `VISIT_TASK` shared by the job and the list.
- Deviations: the time moves when the visit is asked for, not when it ends, like the daily job does, so a visit that later fails still counts for the day; the owner can start another after the one hour cooldown. No time zone tooltip was added (the next time shows in the browser's zone). `Accounts.tsx` uses one `task.run` mutation for both buttons. Also fixed `run-sentence.unit.test.ts`, which expected an upper-case "AM" that this machine's locale does not produce.
- Verified: lint, ts:check, unit tests, build, brain integration tests for the list and the daily job. Not run: the page in a browser behind sign-in, a real visit on LinkedIn, a worker restart to announce the new cooldown (the catalog updates when the worker starts).
- Follow-ups: the same panel for the sign-in check (`nextCheckAt`, last result).
