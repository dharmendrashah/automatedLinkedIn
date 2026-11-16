# Plan 002: Clear the three high-severity dependency advisories (zod, body-parser, basic-ftp)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 298446d..HEAD -- package.json pnpm-workspace.yaml pnpm-lock.yaml apps/body/package.json apps/brain/package.json apps/spider/package.json packages/contracts/package.json`
> If any file changed since this plan was written, re-run the Step 1 audit and
> compare with the "Current state" numbers; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (patch-level bumps inside the existing semver ranges)
- **Depends on**: none
- **Category**: security (dependencies)
- **Planned at**: commit `298446d`, 2026-11-16

## Why this matters

`pnpm audit --prod` reports 3 high advisories on runtime code: `zod` below 4.6.6 (memory exhaustion when validating oversized constrained collections; zod validates every tRPC input in brain), `body-parser` 2.x below 2.4.0 (denial of service through trailing bytes after a compressed request body; brain's Express JSON parser), and `basic-ftp` up to 6.2.0 (CPU denial of service; reached only through `proxy-agent > pac-proxy-agent > get-uri`, not exercised by this app but cheap to patch). Patched versions exist inside the current semver ranges, so this is a lockfile and override change, not a code change.

## Current state

- Advisories (from `pnpm audit --prod --json` on 2026-11-16, severity high):
  - `zod` vulnerable `<4.6.6`, patched `>=4.6.6`; paths `packages/contracts > zod`, `apps/spider > zod`, brain and body direct, plus ~12 transitive paths via `@ai-sdk/*`.
  - `body-parser` vulnerable `>=2.0.0 <2.4.0`, patched `>=2.4.0`; path `apps/brain > express > body-parser`.
  - `basic-ftp` vulnerable `<=6.2.0`, patched `>=6.2.1`; path `apps/brain > proxy-agent > pac-proxy-agent > get-uri > basic-ftp`.
- Today `pnpm-lock.yaml` resolves `zod@4.6.5` (line ~6419) and `body-parser@2.3.0` (line ~3559). `express` is `5.3.0` (latest) and depends on `body-parser ^2.3.0`, so `2.4.0` is allowed by its range.
- Direct `zod` ranges: `apps/body/package.json:49`, `apps/brain/package.json:53`, `apps/spider/package.json:45`, `packages/contracts/package.json:20`, all `"zod": "^4.6.5"`.
- `pnpm-workspace.yaml` has an `allowBuilds` block and a `minimumReleaseAgeExclude` list (precedent: `express@5.3.0` and `dotenv@18.0.7` are listed there because pnpm 12 refuses very new releases by default).
- Latest on the registry (2026-11-16): `zod 4.6.7`, `body-parser 2.4.0`, `basic-ftp 6.2.6`.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Audit | `pnpm audit --prod --audit-level high` | before: 3 high found; after: no high |
| Install | `pnpm install` (this repo's `postinstall` also runs `pnpm build:lib`) | exit 0 |
| Gate | `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` | exit 0 |
| Integration | `pnpm test:integration:run` (needs Postgres: `docker compose up -d postgres`; and RabbitMQ for spider) | all pass |

Run from the repo root (a login shell if `pnpm` is not found). pnpm is `12.10.1` (see `package.json` `devEngines`); `npx` is blocked in this repo by that setting, use `pnpm dlx`/`pnpm` only.

## Scope

**In scope**:
- `apps/body/package.json`, `apps/brain/package.json`, `apps/spider/package.json`, `packages/contracts/package.json` (only the `zod` range)
- `pnpm-workspace.yaml` (an `overrides` block for `body-parser` and `basic-ftp`; `minimumReleaseAgeExclude` entries only if Step 3 needs them)
- `pnpm-lock.yaml` (generated)

**Out of scope**:
- The 9 moderate and 7 low advisories.
- Upgrading `express`, `prisma`, `typescript` or any other package, and `typescript-eslint`'s pinned TypeScript 6 (decided, see `MEMORY.md`).
- Any source file.

## Git workflow

- Branch: `chore/clear-high-advisories`. Commit message style: conventional, e.g. `chore: update zod, body-parser and basic-ftp to patched versions` plus the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- Do NOT push or open a PR unless the operator told you to.

## Steps

### Step 1: Record the baseline

Run `pnpm audit --prod --audit-level high`.

**Verify**: it lists exactly the three high advisories above (zod, body-parser, basic-ftp). If it lists others or fewer, STOP.

### Step 2: Raise the direct zod ranges

In the four `package.json` files change `"zod": "^4.6.5"` to `"zod": "^4.6.7"`.

**Verify**: `grep -n '"zod"' apps/*/package.json packages/*/package.json` shows `^4.6.7` four times.

### Step 3: Override the two transitive packages

In `pnpm-workspace.yaml` add a top-level `overrides:` mapping `body-parser: '>=2.4.0'` and `basic-ftp: '>=6.2.1'` (keep the rest of the file unchanged). Then run `pnpm install`.

If install fails because the new versions are younger than the release-age policy, add `zod@4.6.7`, `body-parser@2.4.0` and `basic-ftp@6.2.6` to `minimumReleaseAgeExclude` (same format as the existing entries) and run `pnpm install` again. If your pnpm version does not accept `overrides` in `pnpm-workspace.yaml`, put the same mapping under `pnpm.overrides` in the root `package.json` instead and say so in your report.

**Verify**: `grep -n "body-parser@\|basic-ftp@\|^  zod@" pnpm-lock.yaml | head` shows `body-parser@2.4.x`, `basic-ftp@6.2.x`, `zod@4.6.7` and no older versions of these three; `pnpm install` exits 0.

### Step 4: Re-audit and gate

**Verify**:
- `pnpm audit --prod --audit-level high` reports no high or critical advisories.
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` exits 0.
- `pnpm test:integration:run` passes (brain and spider; needs Postgres and RabbitMQ).

## Test plan

No new tests: this changes versions only. The existing unit and integration suites are the regression guard (zod schemas and the Express body parsing are exercised by the router and resolver tests). If a zod patch changes an error message that a test asserts, fix the test only if the new message is equivalent, and report it.

## Done criteria

- [ ] `pnpm audit --prod --audit-level high` reports no high or critical
- [ ] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` exits 0
- [ ] `pnpm test:integration:run` exits 0
- [ ] `git status` shows only the in-scope files
- [ ] `.plan/README.md` status row updated

## STOP conditions

- The Step 1 audit differs from the three advisories listed.
- `pnpm install` modifies anything outside the lockfile and the in-scope files (for example `.npmrc`).
- A test fails after the bump and the cause is not an equivalent message change: report the failing test and the zod or body-parser version.
- A patched version is not available on the registry yet: report, do not pin to a git URL.

## Maintenance notes

- Keep the `overrides` until `express` itself depends on `body-parser >=2.4.0`, then remove them.
- Re-run `pnpm audit --prod --audit-level high` in CI is a possible follow-up (not in this plan).
- Reviewer: confirm the lockfile diff only bumps `zod`, `body-parser`, `basic-ftp` and their metadata.
