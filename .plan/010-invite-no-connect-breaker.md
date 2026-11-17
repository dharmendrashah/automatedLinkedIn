# Plan 010: Rest an account's invites when six profiles in a row show "no Connect", so a changed LinkedIn page cannot end people one by one

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3d9feaf..HEAD -- apps/brain/src/database/linkedInInvite.service.ts apps/brain/src/database/inviteRules.ts apps/brain/prisma/schema.prisma apps/brain/src/database/linkedInInvite.hooks.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW to MED (an additive column; the rest uses the stop fields that already exist)
- **Depends on**: none (the wording matches PR #232's verdict names)
- **Category**: reliability (detect a changed page)
- **Planned at**: commit `3d9feaf`, 2026-11-17

## Why this matters

On staging, LinkedIn changed the profile page and the invite task answered "no Connect button" for 63 people between 10 Nov and 16 Nov. Each answer is final: the invite is `FAILED` and the person is `ENDED`, never asked again (`inviteRules.ts:296`). Nothing noticed for six days: the only trace was a list of one-person "Partly done" sessions in the Sessions page. A page change that hides Connect will happen again (the layout changed three times in three weeks: 30 Oct, 15 Nov, 16 Nov). A streak of "no Connect" with no success in between is a strong sign that the task cannot read the page, not that six people in a row have no Connect (the chance is tiny unless the page changed). After this plan, six in a row rest that account's invites for six hours with a plain sentence, so at most six people are lost, and the owner sees why.

## Current state

- `apps/brain/src/database/linkedInInvite.service.ts:896` — `LinkedInInviteService.store(sessionId, file, now)` applies a run's `invites.json` in one transaction: for each `file.sent` entry it calls `sendChange(outcome, tries, now, memberId, stopped)` (`inviteRules.ts:260`) and `updateMany`s the row; it then sets `notesOutUntil` on accounts whose invites went without a note. It never looks at more than this one file.
- `apps/brain/src/database/inviteRules.ts:296` — `NO_CONNECT` → `{ state: 'FAILED', reason: 'LinkedIn showed no Connect button on the profile. Nothing was sent.' }`. `SENT`, `SENT_WITHOUT_NOTE`, `ALREADY_PENDING` and `ALREADY_CONNECTED` prove the page was read.
- The stop fields on `LinkedInAccount` (`apps/brain/prisma/schema.prisma:1089-1091`): `invitesStoppedAt`, `invitesStopReason`, `invitesStopUntil`. `stopped(account, now)` (`linkedInInvite.service.ts:97`) says an account is stopped while `invitesStopUntil > now` (or, with no until, until its next good sign-in). The queue (`ask`, line ~655) refuses a stopped account with "Invites of the account are stopped", and the fleet health read (`fleetHealth.service.ts:59-131`) shows `invitesStopped` with the reason. `linkedInInvite.hooks.ts:44-70` already writes these fields for `BLOCKED` (2 hours) and `LIMIT_REACHED` (a week): copy its shape, in the same style.
- Since 15 Nov a run holds one or two people (invites are planned 30 minutes apart), so a run alone never shows a streak; it has to be counted across runs.
- Conventions: services are static classes in `apps/brain/src/database`; rules without a database live in `inviteRules.ts` with a unit test beside it (`inviteRules.unit.test.ts`); migrations are additive SQL under `apps/brain/prisma/migrations/<timestamp>_<name>/migration.sql`; integration tests use real Postgres (`linkedInInvite.service.integration.test.ts` is the pattern); Prettier first, then `eslint --fix`.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Rules unit test | `pnpm --filter @automatedLinkedIn/brain exec vitest run --dir src src/database/inviteRules` | all pass |
| Invite integration (Postgres) | `pnpm --filter @automatedLinkedIn/brain exec vitest run --config vitest.integration.config.mts --dir src src/database/linkedInInvite` | all pass |
| Prisma client | `pnpm --filter @automatedLinkedIn/brain db:generate` | exit 0 |
| Gate | `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build && pnpm test:integration:run` | exit 0 |

Run from the repo root (a login shell, `zsh -lic '...'`, if `pnpm` is not found). Run brain vitest with `--dir src`.

## Scope

**In scope**: `apps/brain/prisma/schema.prisma` and one new migration (`noConnectStreak`); `inviteRules.ts` (a pure function and two constants) and `inviteRules.unit.test.ts`; `linkedInInvite.service.ts` (`store`); `linkedInInvite.service.integration.test.ts` (new case).

**Out of scope**: the task, the verdicts, the dashboard (the fleet strip already shows `invitesStopped`), a "second look" for `NO_CONNECT` (see the index: not planned), and the 63 people (PR #232's migration).

## Git workflow

- Branch: `feat/invite-layout-breaker`. Conventional commit, e.g. `feat: rest an account's invites after six no-Connect answers in a row` plus the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`. Never a literal `!` in a commit message.
- Do NOT push or open a PR unless the operator told you to. Migrations must be additive; never reset a database.
- The repo asks for a plan file under `.plan/<name>.md` for behaviour changes; this plan is that file.

## Steps

### Step 1: Failing tests first

`inviteRules.unit.test.ts` for a new pure `streakAfter(streak: number, outcomes: InviteSendOutcome[])` returning `{ streak: number; trip: boolean }`:
- each `NO_CONNECT` adds 1; `SENT`, `SENT_WITHOUT_NOTE`, `ALREADY_PENDING`, `ALREADY_CONNECTED` set it to 0; every other outcome leaves it as it is.
- `streakAfter(4, ['NO_CONNECT', 'NO_CONNECT'])` → `{ streak: 0, trip: true }` (the streak reaches 6, trips and starts again at 0); `streakAfter(4, ['NO_CONNECT', 'SENT', 'NO_CONNECT'])` → `{ streak: 1, trip: false }`; `streakAfter(0, [])` → `{ streak: 0, trip: false }`.
- order matters: the outcomes are taken in file order.

`linkedInInvite.service.integration.test.ts`: an account with `noConnectStreak` 5 and a stored run whose file says one `NO_CONNECT` ends with `invitesStopUntil` about 6 hours ahead, `invitesStopReason` containing "six", `invitesStoppedAt` set and the streak 0; a run with a `SENT` resets the streak to 0 and stops nothing; a run of two `NO_CONNECT` from streak 0 leaves the streak at 2 and stops nothing.

**Verify**: the two commands → the new cases FAIL.

### Step 2: The column

Add `noConnectStreak Int @default(0)` to `LinkedInAccount` with a one-line comment ("No-Connect answers in a row; six rest the invites, plan 010") and a migration `20261117140000_account_no_connect_streak` with `ALTER TABLE "LinkedInAccount" ADD COLUMN "noConnectStreak" INTEGER NOT NULL DEFAULT 0;`. Then `db:generate`.

**Verify**: `pnpm --filter @automatedLinkedIn/brain db:generate` → exit 0.

### Step 3: The rule

In `inviteRules.ts` add `export const NO_CONNECT_STREAK = 6`, `export const NO_CONNECT_REST_MS = 6 * 60 * 60 * 1000`, `NO_CONNECT_STOP_REASON = 'LinkedIn showed no Connect button six times in a row, so invites rest for 6 hours. The page may have changed.'` and `streakAfter` as in Step 1 (loop over the outcomes; trip when the count reaches `NO_CONNECT_STREAK`, then start again at 0).

**Verify**: the rules command → all pass.

### Step 4: Use it in `store`

Inside the `db.$transaction` of `store`, after the rows are applied and only when `file.sent` is not empty: read the account of the run (`byId` rows already carry `accountId`; use the first; a run belongs to one account), read its `noConnectStreak`, compute `streakAfter(streak, file.sent.map(({ outcome }) => outcome))`, and `update` the account with `noConnectStreak` and, when `trip`, `invitesStoppedAt: now`, `invitesStopReason: NO_CONNECT_STOP_REASON`, `invitesStopUntil: new Date(now.getTime() + NO_CONNECT_REST_MS)`. Do not touch a stop that is later than this one (keep the later `invitesStopUntil` when one is already set). Skip the update when nothing changed (same streak, no trip).

**Verify**: the integration command → all pass, including the three new cases.

### Step 5: Gate

**Verify**: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build && pnpm test:integration:run` → exit 0.

## Test plan

Unit: `streakAfter` (4 cases above). Integration: trip, reset by a sent invite, partial streak, and a later existing stop is kept. Pattern: `linkedInInvite.service.integration.test.ts` (its account and invite fixtures) and `inviteRules.unit.test.ts`.

## Done criteria

- [ ] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build && pnpm test:integration:run` exits 0
- [ ] `grep -n "noConnectStreak" apps/brain/prisma/schema.prisma apps/brain/src/database/linkedInInvite.service.ts` shows the column and its use in `store`
- [ ] the migration only adds a column; `git status` shows only in-scope files; `.plan/README.md` status row updated

## STOP conditions

- `store` runs more than one account's rows in a session (a run mixes accounts): stop and report; the streak is per account.
- An existing integration test fails because it now sees a stopped account: report which one; do not change the threshold to make it pass.
- The fleet health read does not show a stop that has an `invitesStopUntil` and a reason: stop and report (the owner must see it).

## Maintenance notes

- Six is a guess: with most profiles truly having no Connect, six in a row could happen by chance. Watch the next two weeks of staging and move the number, not the idea. A rest of 6 hours lets the next run try again; if it still shows no Connect, the streak builds again and the account rests again.
- The streak counts across accounts' sessions in file order, so two accounts do not mix.
- Reviewer: check that `SENT_WITHOUT_NOTE` and `ALREADY_CONNECTED` reset the streak (they prove the page was read), and that the stop reason is a fixed sentence with no name.
