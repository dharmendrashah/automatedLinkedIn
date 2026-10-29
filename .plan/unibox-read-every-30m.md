# Unibox: read the messages every 30 minutes by day

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-30
- Locked by user: yes, 2026-10-30 ("30 min by day, 2 h at night"; LinkedIn session risk and about 4x message-read cost accepted)

## Goal

Each active account's messages are read every 30 minutes between 08:00 and 22:00 in the account's timezone, and every 2 hours
at night, instead of every 2 hours round the clock (`.plan/unibox-read-every-2h.md`).

## Approach

- [x] `core/dailyTime.ts`: `nextMessagesTime(now, timeZone)`: +30 min when `now` is in the day window (08:00-22:00, the window
      the daily runs already use), else +2 h but never later than the next 08:00. Unit tests.
- [x] `AccountDailyJob`: the messages `daily` call moves `nextMessagesAt` with it (the account's timezone from its proxy country).
- [x] Copy in body and the job's purpose: "every 30 minutes (every 2 hours at night)".

## Edge cases and risks

- About 33 reads a day per account instead of 12: more LinkedIn sessions (accepted), more "seen" marks on opened chats, about
  3x the Cloud Run cost of message reads (accepted). Later reads stop after 3 known conversations, so a read opens few chats.
- The job wakes every 10 minutes, so a read can start up to 10 minutes late; the cron monitor's overdue grace (30 min) is unchanged.
- A read that cannot be queued (account busy) keeps its time and is tried on the next pass, as before.
- Existing accounts get the new interval after their next read; no migration.
- Rollback: the messages `daily` call goes back to `now + 2 h`.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.

## Outcome

Shipped as planned: `nextMessagesTime` in `core/dailyTime.ts` with tests, used by `AccountDailyJob`; copy updated in the
accounts checklist, the read dialog, the Unibox next-read line (rhythm renamed `MESSAGES`), the cron monitor's message reads and
the job's purpose. The checklist calls messages late after 4 hours without a read (two night gaps). Lint, ts:check, unit tests
and build pass. Not observed live.
