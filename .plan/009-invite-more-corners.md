# Plan 009: The invite task scrolls to More, never calls an undrawn page "no Connect", and names a run that did nothing correctly

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3d9feaf..HEAD -- apps/spider/src/tasks/linkedinInvite apps/spider/src/linkedin/inviteFixture.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (spider only; the invite flow after Connect is untouched)
- **Depends on**: PR #232 (branch `fix/invite-open-more-menu`) merged, or run on top of that branch
- **Category**: bug (edge cases of the More-menu fix)
- **Planned at**: commit `3d9feaf`, 2026-11-17

## Why this matters

PR #232 makes the invite task open the profile's More menu. Three corners can still send a person to the final answer "no Connect button" (the invite fails and the person is ended for good, `inviteRules.ts` `NO_CONNECT`) when LinkedIn did offer Connect:

1. The More button sits below the fold. A profile with a long headline, an "Open to work" box or a banner pushes the top card's More past the bottom of the 720 px window. `pressButton` clicks without scrolling, so `clickNth` finds no spot for it and the loop goes on to "no Connect".
2. The page never finished drawing. `sendOne` waits up to `READY_LOOKS` (20 looks) for the buttons, then goes on even when the page did not draw, finds no Connect, opens no menu, and answers `NO_CONNECT`. That answer should be `NOT_SENT`, which brain retries (three tries).
3. The new verdict `NONE_SENT` is labelled "No invite sent", but a run that only withdraws invites and fails also gets it.

## Current state

- `apps/spider/src/tasks/linkedinInvite/run.ts:182` — `const pressButton = (index: number) => hands.clickNth(INVITE_BUTTON, index, '', false)`. The last argument is `bringIntoView`; the Connect press uses `true` (`pressConnect`, line ~345), the More press does not.
- `run.ts:360-397` — `openMenu`: `for (const more of moreButtons(await hands.html())) { if (!(await pressButton(more))) { continue } ... }`.
- `run.ts:432-490` — `sendOne`: `const actions = parseProfileActions(await until(READY_LOOKS, page => parseProfileActions(page, invite.slug, invite.name).drawn), invite.slug, invite.name)`; then `if (actions.pending) ...`; then `if (connects.length === 0) { ;({ menu: connects, connected } = await openMenu(invite)) ... }`; then `NO_CONNECT` with `await keepPage('no-connect')`. `actions.drawn` is never looked at after the wait. `sent[index]` starts as `NOT_SENT`.
- `run.ts:702-735` — `result()`: `asked && !happened ? 'NONE_SENT'`.
- `apps/spider/src/tasks/linkedinInvite/index.ts` — verdict `NONE_SENT` `{ label: 'No invite sent', tone: 'failure' }`; `answer.ts` — message `'No invite could be sent; each says why.'`.
- `driver.clickNth` (`apps/spider/src/scraping/camoufoxDriver.ts:646`) clicks only an element that is in view, on top, and larger than 4 px; with `bringIntoView` it first scrolls it to the middle.
- Brain: `NOT_SENT` re-queues up to `GIVE_UP_AFTER = 3` tries (`apps/brain/src/database/inviteRules.ts:198,336-355`); `NO_CONNECT` is final (`FAILED`, the person `ENDED`).
- Tests: `run.unit.test.ts` builds a fake page and fake hands (`setup(...)`, `clickNth` mock at ~line 160); `inviteFixture.ts` builds the synthetic profile. Pattern for a hands that refuses a click: the `page.unpressable` and `headerHidden` options.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Spider unit tests | `pnpm --filter @automatedLinkedIn/spider exec vitest run .unit.test.ts --dir src src/tasks/linkedinInvite` | all pass |
| Gate | `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` | exit 0 |

Run from the repo root (a login shell, `zsh -lic '...'`, if `pnpm` is not found). Do not run vitest on `src/linkedin` or the whole spider tree without the `.unit.test.ts` filter: the e2e tests start a real browser.

## Scope

**In scope**: `apps/spider/src/tasks/linkedinInvite/run.ts`, `run.unit.test.ts`, `index.ts`, `answer.ts`, `answer.unit.test.ts`; `apps/spider/src/linkedin/inviteFixture.ts` only if a test needs an option.

**Out of scope**: brain (`NONE_SENT` handling stays), the withdraw flow, the Connect/Send flow after the press, `inviteReader.ts`.

## Git workflow

- Branch: `fix/invite-more-corners` (on top of `fix/invite-open-more-menu` if #232 is not merged yet). Conventional commit, e.g. `fix: scroll to the More button and retry an undrawn profile instead of ending it` plus the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`. Never a literal `!` in a commit message.
- Do NOT push or open a PR unless the operator told you to. The repo asks for a plan file under `.plan/<name>.md` for behaviour changes; this plan is that file.

## Steps

### Step 1: Failing tests first

In `run.unit.test.ts` add:
- a page option `moreBelowFold: true` whose fake `clickNth` returns `false` for the More button unless `bringIntoView` is `true`; a profile with Connect only in the menu then ends `SENT` (today `NO_CONNECT`).
- a page option `neverDraws: true` whose markup has no buttons and no Message link: the outcome is `NOT_SENT` (not `NO_CONNECT`), no press happens, and a page is kept (`undrawn-1.html`).
- a withdraw-only run that fails (`withdraw: [x]`, the Sent list draws no row) ends `NONE_SENT` and `answerFor` gives the neutral sentence below.

In `answer.unit.test.ts` update the expectation to the new label and message.

**Verify**: the Step 1 command → the three new cases FAIL.

### Step 2: Scroll to More

Change `pressButton` to `(index: number, bringIntoView = false) => hands.clickNth(INVITE_BUTTON, index, '', bringIntoView)` and call it with `true` only in `openMenu`. Leave every other caller as is.

**Verify**: the Step 1 command → the below-the-fold case passes.

### Step 3: An undrawn page is not "no Connect"

In `sendOne`, keep the parsed `actions`, and right after it (before the `pending` check) add: when `!actions.drawn`, `log('The profile did not draw')`, `await keepPage('undrawn')`, leave `sent[index]` as `NOT_SENT` and `return`. The outcome file then says `NOT_SENT`, which brain retries.

**Verify**: the Step 1 command → the undrawn case passes; the existing "no Connect" cases (their fixtures draw a Message link) still end `NO_CONNECT`.

### Step 4: Name the verdict for what happened

`NONE_SENT`: label `'Nothing sent or withdrawn'` (tone failure), message `'Nothing was sent or withdrawn; each says why.'`. Keep the status, the hand-over and the code.

**Verify**: the Step 1 command → all pass; then the Gate.

## Test plan

Three new cases in `run.unit.test.ts` and the updated `answer.unit.test.ts`, as in Step 1. Pattern: the existing `unpressable` and `headerHidden` cases.

## Done criteria

- [ ] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` exits 0
- [ ] the three new cases exist and pass; `grep -n "NONE_SENT" apps/spider/src/tasks/linkedinInvite/index.ts` shows the new label
- [ ] `git status` shows only in-scope files, and `.plan/README.md` status row updated

## STOP conditions

- `moreButtons`, `openMenu` or `sendOne` no longer look as quoted (the drift check shows it).
- Scrolling the More button into view makes the page jump so that a later step presses the wrong thing (a test that presses Connect after the menu fails): stop and report.
- A brain test starts to depend on the label text: stop and report it (it should not).

## Maintenance notes

- A real-page check of "More below the fold" needs a tall top card; none is recorded. Add a recording to the owner's list when one is seen.
- If the page ever needs more than 20 looks on a slow proxy, raise `READY_LOOKS` instead of ending the person.
- Reviewer: check that nothing but the More press passes `true`, and that the kept page name (`undrawn`) does not clash with the six-page limit of `keepPage`.
