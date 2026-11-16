# Plan 005: Fix the agent-facing docs and scripts that no longer match the repo

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 298446d..HEAD -- package.json README.md AGENTS.md CONTRIBUTING.md .github/copilot-instructions.md MEMORY.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live files before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (docs and one script)
- **Depends on**: none
- **Category**: docs / dx
- **Planned at**: commit `298446d`, 2026-11-16

## Why this matters

Agents (and new contributors) read `AGENTS.md`, `.github/copilot-instructions.md` and the README first. Today they tell the wrong story: they say integration tests are not run in CI (they are), list a workspace without the spider app and the contracts and logger packages, and the root `pnpm start` points at a package that does not exist. An agent that trusts these will skip the integration suite or look in the wrong place. This plan makes them match the code.

## Current state

- `package.json:7` — `"start": "pnpm -F @automatedLinkedIn/server start"`. The workspace has no package with that name; the packages are `@automatedLinkedIn/body`, `@automatedLinkedIn/brain`, `@automatedLinkedIn/spider` (`apps/*/package.json` `name`). `apps/brain/package.json:6` has `"start": "cross-env NODE_ENV=production node dist/src/server.js"` (needs a prior build).
- `.github/copilot-instructions.md:149` — `- Integration and e2e tests are not run in CI.` It contradicts line 146 of the same file (`ci.yml ... integration tests ...`) and `CONTRIBUTING.md:76` ("CI runs the same checks, plus the database migrations and the brain and spider integration tests against PostgreSQL and RabbitMQ. It does not run end-to-end tests"). The truth, from `.github/workflows/ci.yml`: brain integration tests run after applying migrations (step "Integration tests", gated by input `brain-integration`), spider integration tests run (gated by `spider-integration`); end-to-end tests do not run.
- `AGENTS.md:16` — `- pnpm + Turborepo monorepo: apps/brain (...), apps/body (React, Vite), packages/{config,ui,eslint-config,tsconfig}.` Omits `apps/spider`, `packages/contracts`, `packages/logger`.
- `.github/copilot-instructions.md` "Stack" section has the same omission (it lists `apps/brain`, `apps/body`, `packages/config`, `packages/ui`, `packages/eslint-config`, `packages/tsconfig`).
- `README.md:39-48` — the "Tech Stack" table lists the same six paths and omits `apps/spider`, `packages/contracts`, `packages/logger`. `CONTRIBUTING.md:44-47` already lists `apps/spider` and `packages/contracts` correctly: use its wording.
- `.plan/dashboard-analytics.md` (the "Docker, CI and deploy" row of "Edge cases and risks", line ~450) repeats the wrong claim that integration tests do not run in CI.
- Real workspace: `apps/{body,brain,spider}`, `packages/{config,contracts,eslint-config,logger,tsconfig,ui}`.
- Repo rule: documentation files are only changed when directly related; `MEMORY.md` is updated with one changelog line at the end of a task.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Start script resolves | `pnpm --filter @automatedLinkedIn/brain exec node -p "require('./package.json').scripts.start"` (never run `pnpm start`, it starts the server) | prints the brain start command |
| Gate | `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` | exit 0 |

Run from the repo root (login shell if `pnpm` is missing). Do not run `pnpm start`.

## Scope

**In scope**:
- `package.json` (only the `start` script)
- `README.md` (the Tech Stack table)
- `AGENTS.md` (line 16 only)
- `.github/copilot-instructions.md` (the Stack bullet list and line 149)
- `MEMORY.md` (one changelog line)
- `.plan/dashboard-analytics.md` (only the sentences that say integration tests do not run in CI)

**Out of scope**:
- Every other doc, the CI workflows, any source file.
- The long "Open items" in `MEMORY.md` (separate cleanup).

## Git workflow

- Branch: `docs/fix-agent-facing-docs`. Conventional commit, e.g. `docs: correct the CI, workspace and start-script statements` plus the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- Do NOT push or open a PR unless the operator told you to.

## Steps

### Step 1: Fix the start script

Change line 7 of `package.json` to `"start": "pnpm -F @automatedLinkedIn/brain start"`.

**Verify**: `pnpm --filter @automatedLinkedIn/brain exec node -p "require('./package.json').scripts.start"` prints the `cross-env NODE_ENV=production node dist/src/server.js` command, and `grep -n '"start"' package.json` shows the new filter.

### Step 2: Fix the CI statement

In `.github/copilot-instructions.md` replace line 149 with: `- Brain and spider integration tests run in CI (PostgreSQL and RabbitMQ service containers, after the migrations are applied); end-to-end tests do not, so run them yourself when you change the browser or the real server path.` Keep the wording consistent with `CONTRIBUTING.md:76`.

**Verify**: `grep -n "not run in CI" .github/copilot-instructions.md AGENTS.md README.md CONTRIBUTING.md` returns no line about integration tests. Then `grep -n -i "integration.*not run in CI\|do not run in CI" .plan/dashboard-analytics.md`: reword each hit to say integration tests run in CI (brain and spider) and end-to-end tests do not.

### Step 3: Fix the workspace inventory

- `AGENTS.md:16`: `- pnpm + Turborepo monorepo: apps/brain (...), apps/body (React, Vite), apps/spider (browser worker), packages/{contracts,config,logger,ui,eslint-config,tsconfig}.` (keep the existing parenthesised stack text).
- `.github/copilot-instructions.md` Stack section: add bullets for `apps/spider` (the browser worker: Camoufox and RabbitMQ), `packages/contracts` (types and schemas shared by brain, body and spider) and `packages/logger` (the shared structured logger), using the `CONTRIBUTING.md:44-47` wording.
- `README.md` Tech Stack table: add three rows with the same descriptions.

**Verify**: `grep -n "apps/spider" README.md AGENTS.md .github/copilot-instructions.md` returns a line in each; `grep -n "packages/contracts" README.md AGENTS.md .github/copilot-instructions.md` likewise; `grep -n "packages/logger" README.md AGENTS.md .github/copilot-instructions.md` likewise.

### Step 4: Changelog and gate

Add one dated line to `MEMORY.md` under `## Changelog` (newest first): the `start` script now targets the brain; the CI and workspace statements were corrected.

**Verify**: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` → exit 0.

## Test plan

No code tests: the checks are the greps in each step plus the gate.

## Done criteria

- [ ] `grep -n "@automatedLinkedIn/server" package.json` returns nothing
- [ ] `grep -rn "Integration and e2e tests are not run in CI" .github AGENTS.md README.md CONTRIBUTING.md` returns nothing
- [ ] `apps/spider`, `packages/contracts` and `packages/logger` appear in `README.md`, `AGENTS.md` and `.github/copilot-instructions.md`
- [ ] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` exits 0
- [ ] `git status` shows only the in-scope files
- [ ] `.plan/README.md` status row updated

## STOP conditions

- `ci.yml` no longer runs the integration tests (the drift check shows a change): stop; the statement in Step 2 would be wrong.
- A package listed in "Real workspace" no longer exists or a new one appeared: list the real ones from `ls apps packages` and report the difference.
- `AGENTS.md` is regenerated by a tool and your edit is overwritten (the top block is managed by `turbo`; only line 16 below it is ours): report.

## Maintenance notes

- Two other files repeat the CI facts: `CONTRIBUTING.md` (correct) and `.github/workflows/ci.yml` (the source of truth). When CI changes, update `.github/copilot-instructions.md` in the same PR.
- Reviewer: confirm no claim in the edited docs is stronger than `ci.yml` (for example that e2e runs).
