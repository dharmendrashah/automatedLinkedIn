# Plan 004: `task.run` starts only read tasks, so acts always go through the domain services that keep the limits

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 298446d..HEAD -- apps/brain/src/trpc/api/resolvers/task apps/brain/src/database/task.service.ts packages/contracts/src/workflow.ts apps/body/src/components/sessions apps/body/src/components/accounts/use-account-actions.ts apps/body/src/pages/Proxies.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S to M
- **Risk**: MED (the Sessions "try again" dialog re-runs a session's task; see Step 1 and the STOP conditions)
- **Depends on**: none
- **Category**: security (limits bypass)
- **Planned at**: commit `298446d`, 2026-11-16

## Why this matters

The project's own rule is that every act on LinkedIn (invite, reply, comment, post, remove a connection) goes through a domain service that keeps the daily, weekly and spacing limits, the "Act for real" switch and the platform kill-switch (`PlatformSettingService.actsOn`). But the generic tRPC procedure `task.run` accepts ANY catalog task with a free `input` and calls `TaskService.request` directly, whose own checks are only ownership of the account and proxy, the browse budget and per-task cooldowns. A direct call (not through the web app) can therefore send invites, replies, comments or posts with none of those limits, putting the owner's account (and the platform's reputation with LinkedIn) at risk. After this plan `task.run` accepts only tasks that cannot act.

## Current state

- `apps/brain/src/trpc/api/resolvers/task/task.ts` — `run` is an `ownerProcedure` with `input: runInput` (`task`, optional `proxyId`, `accountId`, free `input` record, `confirmed`, `startAnyway`) and calls `TaskService.request({ ..., trigger: 'manual' })`. Its header comment says "Every task goes through these two procedures; a new task needs nothing here."
- `apps/brain/src/database/task.service.ts:108-178` — `request` checks the task is in the catalog, the proxy and account belong to `userId`, then `checkPolicy` and the task's `onRequest` hooks (which only check account status). Domain services call it directly: `linkedInInvite.service.ts:772`, `linkedInReply.service.ts:360`, `linkedInEngage.service.ts:415`, `postPublication.service.ts:555`, `linkedInConnection.service.ts:557,604`, `linkedInInvitation.service.ts:309,404`, `accountDailyJob.ts`, `accountProfile.service.ts`. Those calls are internal and stay as they are.
- Which tasks can act (from `ACCOUNT_ACTION_TASKS`, `packages/contracts/src/workflow.ts:~289-305`): `linkedin-post`, `linkedin-reply`, `linkedin-message`, `linkedin-invite`, `linkedin-engage` always act. `linkedin-invitations` and `linkedin-connections` read AND can act: their input has an act key (`answers` in `apps/spider/src/tasks/linkedinInvitations/index.ts:28-39`, `remove` in `apps/spider/src/tasks/linkedinConnections/index.ts:26-31`), described as "none reads the list only". Read-only tasks: `browser-detection`, `linkedin-login`, `linkedin-browse`, `linkedin-messages`, `linkedin-profile`, `linkedin-view-profile`, `linkedin-view-company`.
- Web callers of `task.run` (the only ones): `apps/body/src/components/accounts/use-account-actions.ts:42` (runs `linkedin-login`, `linkedin-browse`, `linkedin-messages`, `linkedin-invitations` for the "today" items, see `use-today.ts` `TASK_OF`), `apps/body/src/pages/Proxies.tsx:82` (`browser-detection`), and `apps/body/src/components/sessions/retry-dialog.tsx:51` (re-runs `session.task` with the session's saved `input` on another proxy).
- Error convention for a refused request: `TaskRefusedError(message)` mapped by `asTrpcError` (`apps/brain/src/trpc/api/resolvers/asTrpcError.ts`) to `PRECONDITION_FAILED` with that sentence.
- Existing tests: `apps/brain/src/trpc/api/router.unit.test.ts` (every procedure refuses anonymous callers), resolver tests next to resolvers (see `apps/brain/src/trpc/api/resolvers/pageVisit.unit.test.ts` for the mocking style).

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Brain unit tests | `pnpm --filter @automatedLinkedIn/brain exec vitest run --dir src src/trpc src/database/task` | all pass |
| Body unit tests | `pnpm --filter @automatedLinkedIn/body test:unit:run` | all pass |
| Gate | `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` | exit 0 |

Run from the repo root (login shell if `pnpm` is missing). Prettier first, then `eslint --fix`.

## Scope

**In scope**:
- `apps/brain/src/trpc/api/resolvers/task/task.ts`
- `apps/brain/src/trpc/api/resolvers/task/webTasks.ts` (create) and `webTasks.unit.test.ts` (create)
- `apps/brain/src/trpc/api/resolvers/task/task.unit.test.ts` (create if absent)
- `apps/body/src/components/sessions/retry-dialog.tsx` ONLY if Step 1 shows it must hide "try again" for non-web tasks

**Out of scope**:
- `TaskService.request` and every domain service (internal callers stay unchanged).
- The spider tasks and their input schemas.
- The task catalog contract.
- Moving acts into new procedures: if the owner wants a web button for an act, it needs its own plan through the domain service.

## Git workflow

- Branch: `fix/task-run-read-only`. Conventional commit, e.g. `fix: let task.run start read tasks only` plus the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- Do NOT push or open a PR unless the operator told you to.
- The repo asks for a plan file under `.plan/<name>.md` for behaviour changes; copy this plan's Why/Steps into it.

## Steps

### Step 1: Confirm what the web actually starts

Grep `apps/body/src` for every `task.run` use and every task name passed to it. Confirm the list in "Current state". Open `retry-dialog.tsx` and check which sessions can reach "try again" (a session whose verdict is in the task's `retry_on`): can an act task's session reach it? Write the answer in your report.

**Verify**: your list of web-started tasks is a subset of: `browser-detection`, `linkedin-login`, `linkedin-browse`, `linkedin-messages`, `linkedin-invitations`, `linkedin-profile`, plus whatever `retry-dialog` re-runs. If `use-account-actions` or any other caller starts an act task or sends `answers`/`remove`, STOP (see STOP conditions).

### Step 2: Write the failing tests

`webTasks.unit.test.ts` for `webTaskRefusal(task: string, input: unknown): string | null`:
- `linkedin-invite`, `linkedin-reply`, `linkedin-message`, `linkedin-post`, `linkedin-engage` → a refusal sentence.
- `linkedin-invitations` with `{ answers: [{ id: 'x', answer: 'ACCEPT' }] }` → refusal; with `{}` or `{ answers: [] }` → `null`.
- `linkedin-connections` with `{ remove: 'ada' }` → refusal; with `{}` → `null`.
- `linkedin-login`, `linkedin-browse`, `linkedin-messages`, `browser-detection`, `linkedin-profile`, `linkedin-view-profile`, `linkedin-view-company` → `null`.
- an unknown task name → a refusal (fail closed).

`task.unit.test.ts`: `task.run` called as an owner with `task: 'linkedin-invite'` rejects with `PRECONDITION_FAILED` and `TaskService.request` is NOT called; with `linkedin-browse` it calls `TaskService.request` once (mock `database`'s `TaskService`).

**Verify**: the brain unit command → the new cases FAIL.

### Step 3: Implement the allowlist

Create `webTasks.ts`:

```ts
// What the web app may start through `task.run`: tasks that read or sign in. Acts (invite, reply, message, post, comment, answer a
// request, remove a connection) go through their domain services, which keep the limits and the platform kill-switch.
const READ_TASKS = new Set([
   'browser-detection',
   'linkedin-login',
   'linkedin-browse',
   'linkedin-messages',
   'linkedin-profile',
   'linkedin-view-profile',
   'linkedin-view-company',
])
// Read and act in one task: the act is the key listed here; without it the task only reads.
const ACT_KEYS: Record<string, string> = {
   'linkedin-invitations': 'answers',
   'linkedin-connections': 'remove',
}

export const ACT_REFUSED = 'This task cannot be started from here.'

export const webTaskRefusal = (task: string, input: unknown): string | null => {
   if (READ_TASKS.has(task)) return null

   const key = ACT_KEYS[task]

   if (key === undefined) return ACT_REFUSED

   const value = typeof input === 'object' && input !== null ? (input as Record<string, unknown>)[key] : undefined
   const empty = value === undefined || (Array.isArray(value) && value.length === 0)

   return empty ? null : ACT_REFUSED
}
```

(Avoid the `as` cast if a cleaner narrowing is available: for example `Object.entries(input)` lookup; the repo forbids unchecked casts.) In `task.ts` `run`, before `TaskService.request`, call `webTaskRefusal(input.task, input.input)` and, when it returns a sentence, `throw new TRPCError({ code: 'PRECONDITION_FAILED', message })`.

**Verify**: the brain unit command → all pass.

### Step 4: The retry dialog

If Step 1 showed an act task can reach "try again", hide the button for tasks outside the allowlist: add a pure helper in the body (a copy of the read-task names is acceptable ONLY if exported from contracts; otherwise ask the operator, see STOP). If not reachable, change nothing.

**Verify**: `pnpm --filter @automatedLinkedIn/body test:unit:run` → all pass.

### Step 5: Gate

**Verify**: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` → exit 0.

## Test plan

- Unit: `webTasks.unit.test.ts` (the cases above) and `task.unit.test.ts` (2 cases). Pattern: `apps/brain/src/trpc/api/resolvers/pageVisit.unit.test.ts`.
- Manual check on staging, by the operator after deploy: the Accounts page "Visit now" and the Proxies page browser test still start; a direct `task.run` for `linkedin-invite` is refused.
- Integration is not needed: the guard is a pure function in front of the existing service.

## Done criteria

- [ ] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` exits 0
- [ ] `webTasks.unit.test.ts` and `task.unit.test.ts` exist and pass
- [ ] `grep -n "webTaskRefusal" apps/brain/src/trpc/api/resolvers/task/task.ts` shows it called before `TaskService.request`
- [ ] No file under `apps/brain/src/database` or `apps/spider` changed (`git status`)
- [ ] `.plan/README.md` status row updated

## STOP conditions

- Any web caller starts an act task or passes `answers` / `remove` (Step 1): stop and report which and why; the product may need a domain-service endpoint first.
- The Sessions "try again" dialog can re-run an act task's session and the operator has not decided what to do: stop and report; do not silently remove the button.
- `ACCOUNT_ACTION_TASKS` or the spider task list gained a task not named in this plan: classify it from its input schema and report it; unknown tasks fail closed.
- A test relies on `task.run` starting an act task: stop and report it.

## Maintenance notes

- A new spider task is refused from the web until it is added to `READ_TASKS` (fail closed). The registry test (`apps/spider/src/tasks/registry.unit.test.ts`) already forces every account task into `ACCOUNT_ACTION_TASKS`; consider deriving `READ_TASKS` from the contracts later.
- Reviewer: check the `answers` / `remove` guard against the real schemas, and that internal callers of `TaskService.request` are untouched.
