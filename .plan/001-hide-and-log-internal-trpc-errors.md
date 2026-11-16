# Plan 001: Unexpected server errors are logged and never show internal text to the browser

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `.plan/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 298446d..HEAD -- apps/brain/src/trpc`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `298446d`, 2026-11-16

## Why this matters

The brain's tRPC adapter has no `onError` hook and its error formatter passes every message through. When a resolver does not wrap an error (most do not), tRPC turns the thrown error into an `INTERNAL_SERVER_ERROR` whose message is the original error's message. A database, storage or broker failure therefore sends its raw text (table names, paths, driver messages) to the caller, and the failure is not logged anywhere, so production 500s are invisible in brain logs. After this plan, such errors are logged once with their correlation ID, and the browser only sees a fixed sentence.

## Current state

- `apps/brain/src/trpc/trpc.ts:6` — `const t = initTRPC.context<Context>().create({ errorFormatter: errorShape })`.
- `apps/brain/src/trpc/errorShape.ts` — the formatter; it only adds `data.budgetRefusal`, it never touches `shape.message`:

```ts
export const errorShape = <Shape extends { data: object }>({ shape, error }: { shape: Shape; error: TRPCError }) => ({
   ...shape,
   data: {
      ...shape.data,
      budgetRefusal: error.cause instanceof BrowseBudgetError,
   },
})
```

- `apps/brain/src/trpc/api/router.ts:84-91` — the mount has no `onError`:

```ts
export const initializeTrpc = async (app: Application) => {
   app.use(
      '/trpc',
      createExpressMiddleware({
         router: appRouter,
         createContext,
      })
   )
}
```

- Convention already used by resolvers that DO wrap errors (`apps/brain/src/trpc/api/resolvers/asTrpcError.ts:31-37`, also `takeover/takeover.ts:38-43`, `session/session.ts:110-115`): they log with `log.error(...)` and throw a `TRPCError` with code `INTERNAL_SERVER_ERROR`, the fixed message `'Something went wrong. Try again in a moment.'` and NO `cause`. So: a deliberate error has no `cause`; an error tRPC wrapped itself has `error.cause` set to the original error. That difference is the rule this plan uses.
- Logger: `import { log } from 'core/log'` (`apps/brain/src/core/log.ts`, `createLogger({ service: 'brain' })`); call shape `log.error('Message', { error })`.
- Existing test to copy the style from: `apps/brain/src/trpc/errorShape.unit.test.ts` (uses `vi.hoisted` + `vi.mock('database', ...)` for `BrowseBudgetError`).

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Brain unit tests | `pnpm --filter @automatedLinkedIn/brain exec vitest run --dir src src/trpc` | all pass |
| Lint | `pnpm lint` | exit 0, 0 warnings |
| Type check | `pnpm ts:check` | exit 0 |
| Full gate | `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` | exit 0 |

Run commands from the repo root. If `pnpm` is not found in your shell, run them through a login shell (`zsh -lic '...'`). Prettier and ESLint rules conflict on `object-curly-newline`: run `npx prettier --write <files>` first, then `npx eslint --fix <files>`.

## Scope

**In scope** (the only files you should modify or create):
- `apps/brain/src/trpc/errorShape.ts`
- `apps/brain/src/trpc/errorShape.unit.test.ts`
- `apps/brain/src/trpc/onError.ts` (create)
- `apps/brain/src/trpc/onError.unit.test.ts` (create)
- `apps/brain/src/trpc/api/router.ts` (only the `createExpressMiddleware` call)

**Out of scope** (do NOT touch):
- Every resolver and `asTrpcError.ts`: they already log and use fixed sentences. Do not "clean them up".
- Client code in `apps/body` (it shows `error.message`; the fixed sentence is already what it shows for wrapped errors).
- `NODE_ENV`-dependent `data.stack` that tRPC adds outside production: leave it.

## Git workflow

- Branch: `fix/trpc-internal-errors` (the repo uses `fix/...`, `feat/...`).
- Conventional commits, e.g. `fix: log unexpected tRPC errors and hide their text from the browser` plus the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`. Never put a literal `!` in a commit message.
- Do NOT push or open a PR unless the operator told you to.
- The repo asks for a plan file under `.plan/<name>.md` (from `.plan/_template.md`) for behaviour changes; copy this plan's Why/Steps into it.

## Steps

### Step 1: Write the failing tests first

In `errorShape.unit.test.ts` add cases (build errors like the existing tests do):
- `INTERNAL_SERVER_ERROR` with `cause: new Error('relation "Person" does not exist')` → `errorShape(...).message` is exactly `'Something went wrong. Try again in a moment.'`.
- `INTERNAL_SERVER_ERROR` WITHOUT a cause and a custom message keeps its message.
- `BAD_REQUEST` (or any other code) WITH a cause keeps its message.
- The existing `budgetRefusal` assertions still pass.

Create `onError.unit.test.ts` (mock `core/log` with `vi.mock('core/log', () => ({ log: { error: mocks.error } }))`) with cases:
- an `INTERNAL_SERVER_ERROR` with a cause calls `log.error` once, with the path and the cause as `error`;
- an `INTERNAL_SERVER_ERROR` without a cause does NOT log (the resolver already did);
- a `CONFLICT`, `NOT_FOUND` or `UNAUTHORIZED` error does not log.

**Verify**: `pnpm --filter @automatedLinkedIn/brain exec vitest run --dir src src/trpc` → the new cases FAIL (the module `onError` does not exist yet; the shape cases fail on the message).

### Step 2: Hide the text

In `errorShape.ts`, export `INTERNAL_MESSAGE = 'Something went wrong. Try again in a moment.'` and return `message: error.code === 'INTERNAL_SERVER_ERROR' && error.cause !== undefined ? INTERNAL_MESSAGE : shape.message` next to `data`. Keep the rest of the object as is.

**Verify**: the `errorShape` tests pass.

### Step 3: Log the cause once

Create `apps/brain/src/trpc/onError.ts`:

```ts
import { type TRPCError } from '@trpc/server'

import { log } from 'core/log'

// Errors tRPC wrapped itself (it sets `cause`) are logged here; resolvers that wrap their own errors already logged theirs.
export const onError = ({ error, path, type }: { error: TRPCError; path: string | undefined; type: string }) => {
   if (error.code === 'INTERNAL_SERVER_ERROR' && error.cause !== undefined) {
      log.error('Unhandled tRPC error', { path, type, error: error.cause })
   }
}
```

Check `log.error`'s field type in `packages/logger/src/server.ts` (`LogFields`); if `path`/`type` are not accepted as written, adapt the field names to what `LogFields` allows, keeping `error: error.cause`.

In `router.ts` pass `onError` to `createExpressMiddleware`.

**Verify**: `pnpm --filter @automatedLinkedIn/brain exec vitest run --dir src src/trpc` → all pass; `pnpm ts:check` → exit 0.

### Step 4: Gate

**Verify**: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` → exit 0 (spider unit tests print some ERROR log lines on purpose; that is not a failure).

## Test plan

- Unit tests as in Step 1 (7 cases). No integration test is needed: the formatter and `onError` are pure functions of the error.
- Pattern: `apps/brain/src/trpc/errorShape.unit.test.ts`.

## Done criteria

- [ ] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` exits 0
- [ ] `grep -n "onError" apps/brain/src/trpc/api/router.ts` shows the handler passed to `createExpressMiddleware`
- [ ] The new `errorShape` and `onError` cases exist and pass
- [ ] `git status` shows only the in-scope files
- [ ] `.plan/README.md` status row updated

## STOP conditions

- `createExpressMiddleware` in the installed `@trpc/server` does not accept `onError` with `{ error, path, type }` (check `node_modules/@trpc/server` types): stop and report the actual signature.
- Any existing resolver test fails because it asserted a raw internal message: stop and report which one (it was relying on the leak).
- The body shows `error.message` for some flow that depends on an internal message (grep `apps/body/src` for `INTERNAL_SERVER_ERROR`; today there is none): stop and report.

## Maintenance notes

- A new resolver that wants its own message for an unexpected error must wrap it (`asTrpcError` pattern) and give no `cause`; otherwise the browser gets the fixed sentence and the log gets the cause.
- If a correlation ID does not appear on the logged line, check `core/log` / `withCorrelation` wiring for `/trpc`; that is a separate follow-up.
- Reviewer: confirm no resolver relied on the old behaviour; confirm the log line carries no secret (the cause of a credential error must not include the secret).
