# Plan 011: A command that checks the invite readers against kept pages, so a LinkedIn layout change is found in minutes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3d9feaf..HEAD -- apps/spider/src/linkedin/inviteReader.ts apps/spider/package.json apps/spider/src/devtools`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (a read-only command; it presses and visits nothing)
- **Depends on**: none
- **Category**: dx / reliability
- **Planned at**: commit `3d9feaf`, 2026-11-17

## Why this matters

The invite task's selectors break whenever LinkedIn changes a page, and the task keeps the page it could not read (`no-connect-N.html`, at most 6 a run) in the bucket. On 2026-11-17 finding out why 63 people were "no Connect" meant downloading runs by hand, reading raw HTML, and writing a throwaway script to run the readers over it. That script showed in one command that the new reader finds the More button on all 19 kept pages from 11 to 16 Nov, where the old one found it on none. A small checked-in command makes that a one-line routine: after any "no Connect" streak, anyone can run the current readers over the kept pages and see which control the reader misses. It also turns every future recording into a regression check without committing real pages (the repo keeps only synthetic fixtures).

## Current state

- The readers are pure: `parseProfileActions(html, slug, name)` and `moreButtons(html)` in `apps/spider/src/linkedin/inviteReader.ts` (`parseProfileActions` returns `{ connects, menu, pending, drawn, memberId? }`; `moreButtons` returns positions among `button`).
- A kept run in the bucket (`gs://automate-linkedin-511215-spider/runs/linkedin-invite/<prefix>/<session>/files/`) holds `input.json` (the people the run was asked about: `send: [{ id, slug, name, note? }]`), `invites.json` (`sent: [{ id, outcome, memberId? }]`, same order) and `no-connect-<n>.html` for the people answered `NO_CONNECT`, in that order. The owner's own recordings (`apps/spider/.devtools-recordings/<session>/step-<n>.html`) are plain compact pages.
- The devtools live in `apps/spider/src/devtools/` and are started through `pnpm --filter @automatedLinkedIn/spider dev:record` (`package.json`: `"dev:record": "tsc -b && node dist/src/devtools/index.js"`), a menu. A separate tiny entry point is allowed: scripts in `apps/spider/package.json` use `tsc -b && node dist/...`.
- Conventions: pure logic in its own file with a `*.unit.test.ts`; no secrets; the recordings and kept pages stay local (`.devtools-recordings` is gitignored); the repo never commits a real person's page.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Unit test | `pnpm --filter @automatedLinkedIn/spider exec vitest run .unit.test.ts --dir src src/devtools/invitePages` | all pass |
| Run the command | `pnpm --filter @automatedLinkedIn/spider check:invite-pages <folder>` | prints a table |
| Gate | `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` | exit 0 |

Run from the repo root (a login shell, `zsh -lic '...'`, if `pnpm` is not found). Never run vitest over the whole spider tree: the e2e tests start a real browser.

## Scope

**In scope**: `apps/spider/src/devtools/invitePages.ts` (pure: pairs the pages with their people and runs the readers) and `invitePages.unit.test.ts`; `apps/spider/src/devtools/checkInvitePages.ts` (the entry: reads a folder, prints); `apps/spider/package.json` (one script `check:invite-pages`); one short paragraph in `apps/spider/README.md` or `CONTRIBUTING.md` only if a section on the devtools already exists (otherwise skip the doc).

**Out of scope**: the readers themselves, the task, brain, committing any recorded page, any network or bucket access (the command reads a local folder; the operator downloads with `gcloud storage cp -r`).

## Git workflow

- Branch: `chore/check-invite-pages`. Conventional commit, e.g. `chore: add a command that runs the invite readers over kept pages` plus the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`. Never a literal `!` in a commit message.
- Do NOT push or open a PR unless the operator told you to. The repo asks for a plan file under `.plan/<name>.md`; this plan is that file.

## Steps

### Step 1: Failing test first

`invitePages.unit.test.ts` for a pure `checkPages(pages: Array<{ name: string; html: string }>, people: Array<{ slug: string; name: string }>)` returning rows `{ page, slug, more: number, connects: number, menu: number, pending: boolean, drawn: boolean }`:
- built from the synthetic fixture (`profileMarkup` in `apps/spider/src/linkedin/inviteFixture.ts`): a profile with its own Connect gives `connects: 1`; a profile with only More (`own: false`, icon and text shapes) gives `more: 1`, `connects: 0`; a page that is not a profile gives `drawn: false`.
- `pair(files)`: given `input.json` text, `invites.json` text and the list of `no-connect-<n>.html` names, returns the people answered `NO_CONNECT` in order, matched to the pages in order; a missing page or file gives a clear error string, never a throw.

**Verify**: the unit command → FAILS (module missing).

### Step 2: The pure part

Create `invitePages.ts` with `checkPages` and `pair`, using only `parseProfileActions` and `moreButtons` from `../linkedin/inviteReader`. No file or network access in this file.

**Verify**: the unit command → all pass.

### Step 3: The entry and the script

`checkInvitePages.ts`: takes one folder argument; if it has `input.json` and `invites.json`, pairs them with its `no-connect-*.html`; otherwise treats every `*.html` in it as one page with no person (slug and name empty) and prints only `more`, `drawn` and the number of Connect links. Prints one line per page and a last line `{ total, withMore, withConnect, undrawn }`. Exit code 0 always; a folder that does not exist prints one sentence and exits 1. Add `"check:invite-pages": "tsc -b && node dist/src/devtools/checkInvitePages.js"` to `apps/spider/package.json`.

**Verify**: `pnpm --filter @automatedLinkedIn/spider check:invite-pages apps/spider/.devtools-recordings/<any session with step-*.html>` → prints a table (use a local recording; do not commit it); then the Gate.

## Test plan

Unit only (Step 1). No test touches the network, the bucket or a real page.

## Done criteria

- [ ] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` exits 0
- [ ] the unit cases exist and pass; `pnpm --filter @automatedLinkedIn/spider check:invite-pages <folder>` prints a table for a recording
- [ ] no `.html` file is added to git (`git status`); `.plan/README.md` status row updated

## STOP conditions

- `inviteReader.ts` no longer exports `moreButtons` or `parseProfileActions` with the shapes above (the drift check shows it).
- The only way to test the command is to commit a real page: stop; the synthetic fixture is enough.
- `tsc -b` in `apps/spider` fails because `devtools` is excluded from the build: report the tsconfig `include` and stop.

## Maintenance notes

- How to use it after a streak: `gcloud storage cp -r "gs://automate-linkedin-511215-spider/runs/linkedin-invite/<prefix>/<yyyy>/<mm>/<dd>/<session>/files" ./kept` then `pnpm --filter @automatedLinkedIn/spider check:invite-pages ./kept`. A table where `withMore` and `withConnect` are both 0 and `drawn` is true means the readers miss a control on that layout: look at the page.
- Keep the check on the readers' public shapes only; if the reader gets a new field, print it.
- Reviewer: check that nothing in the entry writes a file or prints a person's name (print slugs only).
