# Invites: spread the day's invites over the day, so an account is not asked for a burst of profile visits

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-11-15
- Locked by user: yes, 2026-11-15 (spacing 30 minutes, every day planInvites fills, queued invites left as they are)

## Goal

LinkedIn keeps answering HTTP 999 (the verdict `BLOCKED`) on invite runs, always in the same place: about 40 minutes into the burst that starts when the Invite workflow runs at 15:00 UTC. The cause is the burst, not the day's volume. A good result: an account's invites go out a few at a time over several hours, like a person working through a list, and a day's profile visits per hour stay low.

## Evidence (staging, read-only, 2026-11-15)

- `SpiderSession` rows with verdict `BLOCKED`, last 4 days: Sushi 11-14 about 15:12 (earlier incident), dharmendrashaheagle 11-14 15:40, tripti.verma 11-15 15:18, dharmendrashaheagle 11-15 15:39. Every one is inside the 15:00 to 15:45 UTC window, on the second or third invite run of the burst. Proxies: tripti 165.49.110.186, dharmendra 178.95.212.207 (both US, the same IP for every run of the account).
- Today the volume was small: tripti.verma 2 invite runs, dharmendra 3, Sushi 2. The runs of the burst (tripti 15:00 for 449 s, then 15:18 blocked; dharmendra 15:00 for 521 s, 15:19 for 574 s, 15:39 blocked) are 18 to 20 minutes apart, 5 profiles each: 7 to 12 profile visits in 20 to 40 minutes, then 999. `linkedin-messages` also reads every 30 minutes from the same IP.
- Cause in the code: `planInvites` (`inviteRules.ts`) gives every invite of an account's day the same planned time, `now` (`times.push(new Date(now.getTime() + block * DAY_MS))`). The Invite block plans "over today" at 15:00, so the whole day's room (14 to 17 invites per account) becomes due at once, and brain asks for runs of `INVITE_LIMITS.perRun = 5` as fast as the account's browsing budget allows (about every 20 minutes, "Waiting for the account's next slot"). The block's `planDays: 1` and the next days get the same treatment: everything due at the start of its 24-hour block.
- The pause between two invites inside a run is 30 to 90 seconds (`INVITE_LIMITS.gapSeconds`); that is not the problem.
- `BLOCKED` already rests the account for 2 hours (`BLOCKED_REST_MS`) and nothing is pressed; that part works.

Not known: LinkedIn's real threshold (it also looks at the IP, the browser and the account's history); whether spreading alone is enough. The first week after the change tells.

## Requirements

Confirmed: the owner asked how to fix the 999 run (2026-11-15).

Answered by the owner (2026-11-15): 1 spacing 30 minutes; 2 every day `planInvites` fills; 3 the invites already queued are left as they are.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: `planInvites` and its tests, a constant in `INVITE_LIMITS` (`spacingMinutes`), the sentence of the plan if it says "all today" (`inviteSentence`), `MEMORY.md`.
- Out of scope: lengthening the rest after a repeated 999 (a later step if it still happens), proxies and IPs, lowering `perRun`, the working-hours rule, re-planning the invites already queued, the messages read cadence.

## Approach

- [x] Tests first (`inviteRules.unit.test.ts`): times of one block are `spacing` apart starting at `now`; the next block starts at its own 24-hour mark; counts and room are unchanged; the last time of a full day (20 invites) is before the end of its block; `today`, `times.length` and the "left out" sentence are unchanged.
- [x] `INVITE_LIMITS.spacingMinutes = 30` in contracts (`invites.ts`), documented as chosen after the 999s of 2026-11-14 and 11-15.
- [x] `planInvites`: within a block, the n-th invite is planned at `now + block * DAY + n * spacing`; a block never runs past its 24 hours (the spacing shrinks to fit, never below 10 minutes).
- [x] `inviteSentence`: "all today" still holds because the times stay inside the first 24 hours; say "spread over about N hours" when more than one invite is planned.
- [x] Integration test: planning 6 invites for one account gives six different planned times 30 minutes apart; the dispatcher asks for the due ones only.
- [x] `MEMORY.md`: evidence, the decision, the follow-up if 999 continues, one changelog line.
- [x] Root gate: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, then `pnpm test:integration:run`.

## Edge cases and risks

- Fewer invites later in the day: the day's last invite goes out hours after the Invite block ran. That is the intended trade. The account's working hours still apply (a time outside them waits, as now).
- A day that cannot hold its spread (for example 60 invites in one block): the spacing shrinks to fit the block, never below 10 minutes, so no invite is dropped and none leaves its block.
- Time zones and clock: planned times are absolute; the dispatcher already compares with the database clock.
- Existing queued invites (due now): they still go in a burst once, then the new plans are spread. If 999 shows again for them, the rest rule handles it (2 hours).
- Counting: room and weekly limits count by 24-hour blocks from now, and the spread stays inside its block, so the counts do not change.
- Rollback: revert the commit; nothing is stored differently (only `plannedAt` values).
- Not a guarantee: LinkedIn may still answer 999 after a few visits from one IP. If it does after this change, the next steps are a longer rest after repeated blocks and fewer profile visits per run.
- No schema change, env, Docker or CI change.

## Verification

- Unit and integration tests above; root gate.
- After deploy: the next Invite run's planned times for each account, and the `BLOCKED` count of the following days (read-only query of `SpiderSession`). Not run here: anything against live LinkedIn.

## Outcome

Built on `fix/invite-spread-over-day` (not pushed). Gate green: lint, ts:check, unit (brain 182 files, contracts 44, body 141, spider 104), build, integration (brain 108 files).

- `INVITE_LIMITS.spacingMinutes = 30` and `minSpacingMinutes = 10` (contracts). `planInvites` plans the n-th invite of a block at the block's start plus n times the spacing, after the invites already waiting in that block; a day that cannot hold the spacing shrinks it to no less than 10 minutes and no time leaves its block. Counts, room and the "left out" rule are unchanged.
- The plan sentence says "all today, over about N hours" when the day's invites span an hour or more.
- Tests: spacing, next-day marks, after the waiting ones, a crowded day, the sentence; the queue integration test now checks the 30-minute gaps and makes its invites due before the later tests send them.
- Not run: anything against live LinkedIn. The invites already queued on staging (due now) still go out as before, once.
- Follow-ups if 999 continues after a week: a longer rest after repeated blocks (2 hours, then more), fewer profile visits per run, and a look at the proxy IP of the blocked accounts.
