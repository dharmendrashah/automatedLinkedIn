# Plan 012: One table-driven test that runs the invite task over every profile shape of every degree

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3d9feaf..HEAD -- apps/spider/src/tasks/linkedinInvite/run.unit.test.ts apps/spider/src/linkedin/inviteFixture.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (tests only)
- **Depends on**: PR #232 (the icon-only More fixture); best after plan 009
- **Category**: tests
- **Planned at**: commit `3d9feaf`, 2026-11-17

## Why this matters

The invite task decides by what the profile page offers, not by the degree (the degree text cannot be trusted), so "works for 1st, 2nd and 3rd degree" really means "works for every page shape that degrees produce". Today those shapes are covered by one-off cases written after each incident (`run.unit.test.ts`: 1.2k lines, one case per outage), and the 63 lost people showed a shape (icon-only More) that no case had. One table that lists every shape and the expected answer makes a missing shape visible and keeps all of them green together.

## Current state

- `apps/spider/src/linkedin/inviteFixture.ts` — `profileMarkup({ slug, name, own, pending, menuOpen, menuConnect, connected, links, more })` builds a synthetic profile. Options: `own` (the person's own Connect on the card), `pending`, `menuOpen` and `menuConnect` (the More menu shows, and offers Connect), `connected` (the menu offers Remove connection), `links` (the 2026-11-15 layout where Connect is a link, not a button), `more` (`'icon'` default, or `'text'`; PR #232).
- `apps/spider/src/tasks/linkedinInvite/run.unit.test.ts` — `setup(page)` makes the fake browser; its options name the shape: `noConnect: [slug]` (no Connect anywhere), `menuOnly: [slug]` (Connect only in the menu), `pending: [slug]`, `connected: [slug]` (menu offers Remove connection), `links: boolean` (layout). `run(input)` returns `{ outcome, sent, withdrawn }`; `file().sent` lists the outcomes. The More press is simulated for both shapes (`words === 'More|' || words.endsWith('|More')`).
- The answers: `SENT` (pressed Connect, Send, and the page answered), `ALREADY_PENDING`, `ALREADY_CONNECTED`, `NO_CONNECT` (no Connect, no Pending, no Remove connection), `NOT_SENT` (retried by brain).
- The meaning of the degrees, from the owner's recordings: 1st degree shows Message and More, the menu offers Remove connection; 2nd degree often shows Connect on the card (or in a "Connect if you know each other" card), else Follow, Message and More with Connect in the menu; 3rd degree shows Message, Follow and More with Connect in the menu (recording of 2026-11-17), and some have none.
- Conventions: tests sit beside the code and use `it.each` for tables (see `inviteReader.unit.test.ts`); write each case once.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Invite task tests | `pnpm --filter @automatedLinkedIn/spider exec vitest run .unit.test.ts --dir src src/tasks/linkedinInvite` | all pass |
| Gate | `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` | exit 0 |

Run from the repo root (a login shell, `zsh -lic '...'`, if `pnpm` is not found).

## Scope

**In scope**: `apps/spider/src/tasks/linkedinInvite/run.unit.test.ts` (one new `describe` with an `it.each`); `inviteFixture.ts` only if an option is missing for a row below.

**Out of scope**: any change to the task, the readers or brain. If a row fails, that is a finding: see STOP conditions.

## Git workflow

- Branch: `test/invite-shape-matrix`. Conventional commit, e.g. `test: run the invite task over every profile shape` plus the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`. Never a literal `!` in a commit message.
- Do NOT push or open a PR unless the operator told you to.

## Steps

### Step 1: Write the table

Add `describe('every profile shape', ...)` with an `it.each` over these rows (degree label, layout, page options, expected `file().sent[0].outcome`, and whether a Connect was pressed). Use one person per row with `send: [ADA]`.

| Row | Page options | Expected outcome |
| --- | --- | --- |
| 1st degree, icon More | `connected: ['ada-lovelace']`, more icon | `ALREADY_CONNECTED`, no Connect pressed |
| 1st degree, text More | same, more text | `ALREADY_CONNECTED` |
| 2nd degree, Connect on the card, buttons | default (own Connect) | `SENT` |
| 2nd degree, Connect on the card, links | `links: true` | `SENT` |
| 2nd degree, Connect only in the menu, icon More | `menuOnly`, more icon | `SENT` |
| 2nd degree, Connect only in the menu, text More, links | `menuOnly`, `links: true`, more text | `SENT` |
| 3rd degree, Follow and More, Connect in the menu, icon | `menuOnly`, more icon | `SENT` |
| 3rd degree, none anywhere | `noConnect: ['ada-lovelace']` | `NO_CONNECT`, a page kept |
| any degree, invite pending | `pending: ['ada-lovelace']` | `ALREADY_PENDING`, no Connect pressed |
| any degree, Connect pressed but LinkedIn refuses | `afterSend: 'refused'` | `REFUSED` |

If the fixture or `setup` cannot express a row (for example "text More" for the pending row), add the smallest option; do not rewrite `setup`.

**Verify**: the invite task command → the table runs; every row passes or the failing rows are listed.

### Step 2: Decide a failing row

A failing row is a real defect in the task or a wrong expectation. Fix a wrong expectation by reading the code; do not change the task. If the task is wrong, STOP and report the row.

**Verify**: the invite task command → all pass; then the Gate.

## Test plan

The table above (10 rows) in `run.unit.test.ts`. Pattern: `inviteReader.unit.test.ts` `it.each`. The existing one-off cases stay (they hold the finer assertions: calls, order, files).

## Done criteria

- [ ] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` exits 0
- [ ] the table exists with the 10 rows and passes
- [ ] only `run.unit.test.ts` (and `inviteFixture.ts` if needed) changed; `.plan/README.md` status row updated

## STOP conditions

- A row fails because the task is wrong (not the expectation): stop and report the row and the actual outcome.
- A row cannot be expressed without rewriting `setup`: stop and report which.

## Maintenance notes

- When LinkedIn changes a layout, add a row for the new shape in the same commit as the fix. The matrix is the checklist.
- Not covered on purpose: non-English accounts, a renamed profile address, a More button below the fold (plan 009), and a real 1st-degree menu (never recorded).
- Reviewer: check that each row states its degree and layout in its title so a failure reads on its own.
