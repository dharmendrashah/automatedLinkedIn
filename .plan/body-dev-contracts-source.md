# Body dev server loads contracts from source

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-13
- Locked by user: yes, 2026-11-13 (owner reported the dev error and asked for it to be fixed)

## Goal

The body dev server (`pnpm --filter @automatedLinkedIn/body dev`) fails with `The requested module '/@fs/.../packages/contracts/dist/index.js' does not provide an export named 'checkWords'`. Contracts is built as CommonJS for brain, so Vite serves the CJS file as-is and every named value import from `@automatedLinkedIn/contracts` fails. Point the body at contracts source so Vite compiles it as ESM.

## Requirements

Confirmed:

- The body dev server loads all named values from `@automatedLinkedIn/contracts` without error.
- Brain keeps consuming the CJS `dist` build unchanged.
- The production body build keeps working.

Open questions (must be empty before locking):

- None. Assumption: the fix goes on `feat/campaign-detail-insights` (PR #219) so the campaign page can be tested from the same branch. It can be split into its own PR from `main` if the owner prefers.

## Scope and non-goals

- In scope: a `@automatedLinkedIn/contracts` alias in `apps/body/vite.config.ts`; verifying dev and build.
- Out of scope: changing contracts' build format, brain's aliasing, or the chunk-size warning.

## Approach

- [x] Check `packages/contracts/src` for browser safety. Correction: the only node import is `node:crypto` in `attachments.ts` (`receivedKey`). The production build only tree-shook it, so the dev server (which loads `attachments.ts` as a module) threw `Cannot access "node:crypto.createHash" in client code`.
- [x] Move `receivedKey` out of contracts into `apps/spider/src/storage/receivedKey.ts`. Its only real consumer is `apps/spider/src/tasks/runner.ts`, and brain does not use it. The function keeps the same key format (sha256 of the message id, first 32 hex chars), so stored keys do not change. Its unit test moves with it. `keptPrefix` and `safeFileName` stay in contracts, as they are browser-safe.
- [x] Add the alias to `resolve.alias` in `apps/body/vite.config.ts`, pointing at `packages/contracts/src/index.ts`.
- [x] Restart the dev server and check in a browser: the served `draft-card.tsx` imports contracts source, contracts source loads 383 exports with `checkWords` as a function, and no `node:crypto` error. The app has no drafts route, so the full drafts screen was not opened (it sits behind sign-in).
- [x] Run `pnpm --filter @automatedLinkedIn/body build` and the body unit tests (through the full chain).
- [x] Add a short Gotcha line to `MEMORY.md`.

## Edge cases and risks

- Vitest: `apps/body/vitest.config.ts` does not read `vite.config.ts`, so tests keep loading the CJS dist. They already pass, and a body test is not affected by the dev server alias.
- Production build: Rollup bundles contracts source now instead of CJS. Chunk sizes may change; the existing chunk-size warning is pre-existing and out of scope.
- `node:crypto` in `attachments.ts`: it is only reached when `receivedKey` is called. Check that the production bundle still resolves it the same way it did before.
- Type checking: `tsconfig.app.json` already resolves types from `src/index.ts` through the `types` field, so `ts:check` is unaffected.
- Brain: unaffected, since `dist` is unchanged.
- Dev vs production: the alias applies to both `vite` and `vite build`; this is intended.
- Rollback: remove the alias line.

## Verification

- `pnpm --filter @automatedLinkedIn/body dev` on port 3055; fetch `/src/components/drafts/draft-card.tsx` and check the contracts import resolves to source; load the campaign page in a browser and confirm no console module errors.
- `pnpm --filter @automatedLinkedIn/body build` exits 0.
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` all exit 0.

## Outcome

- Shipped: `@automatedLinkedIn/contracts` alias in `apps/body/vite.config.ts` (source, not the CJS dist); `receivedKey` moved from contracts to `apps/spider/src/storage/receivedKey.ts` with its unit test, because `node:crypto` broke the browser; `runner.ts` import updated.
- Deviation: the `receivedKey` move was my decision, not the owner's. Stored key format is unchanged.
- Verification: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` exit 0 (after a spider `lint:fix` for import order). Dev server served contracts source with no `node:crypto`; a browser import of the source gave `checkWords` as a function.
- Not verified: the full drafts screen in a signed-in browser session. The app has no `/drafts` route.
- Follow-ups: the pre-existing chunk-size warning is out of scope.
