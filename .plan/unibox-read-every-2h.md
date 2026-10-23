# Unibox: read the messages every 2 hours

- Status: done
- Created: 2026-10-23
- Locked by user: yes, 2026-10-23 ("12 times a day, every 2 hours")

## Goal

The automatic read of each account's messages runs every 2 hours (12 times a day) instead of once a day, so the Unibox stays close to LinkedIn. Replaces the "daily read" of `.plan/unibox-backend.md` (Q3); the sign-in check and the visit stay once a day.

## Change

- `AccountDailyJob`: after a messages read is asked for (or let go because there was no good sign-in in the last day), `nextMessagesAt` moves to now plus 2 hours, with no random draw. A first time is still only drawn, for later today. A read that cannot be queued keeps its time and is tried on the next pass (every 10 minutes), as before.
- Same terms as before: `ACTIVE` account, good sign-in in the last 24 hours, newest 20 conversations after the first full read of 50, one task at a time per account.

## Edge cases and risks

- **"Seen" shown to other people:** each read opens its newest conversations on LinkedIn, which marks them read there. At 12 reads a day the contact sees "seen" within about 2 hours of writing. The owner chose this.
- **Round the clock:** reads also run at night in the account's timezone, which a person would not. Not changed; a quiet-hours window is a possible follow-up.
- **Volume:** about 12 sessions and up to 240 conversation opens per account per day. Larger than the daily visit; watch for LinkedIn blocks or restrictions on the account.
- **Cost and load:** 12 browser runs per account per day on the spider; reads are skipped while another task of the account holds the lease.
- **Existing data:** accounts with a `nextMessagesAt` already set simply get the new interval after their next read. No migration.
- **Rollback:** set `MESSAGES_EVERY_MS` back to a day (or remove the third argument of the messages `daily` call).

## Outcome

`accountDailyJob.ts` and its unit tests changed; gates run (see MEMORY.md). Not observed live: no real account has been read on the new schedule.
