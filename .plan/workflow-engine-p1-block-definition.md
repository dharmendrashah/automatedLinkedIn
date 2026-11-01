# Workflow engine phase 1: one definition per block

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-02
- Locked by user: yes, 2026-11-02 (phase 1 of [workflow-engine-n8n-alignment.md](workflow-engine-n8n-alignment.md); the owner asked for phases 0 to 4 on one branch, one commit each)

## Goal

Adding a block means one definition (contracts) plus one executor (brain) plus one icon (body). Behaviour that was spread over five capability sets, a cost switch, a preview map, special cases in `validateGraph` and per-type chains in the browser moves into the block's definition. Blocks get a version, a way to upgrade saved settings, and a way to be retired.

## Requirements

Confirmed (parent plan): flags replace the sets; `estimate`, `previewCap` and `validate` live in the definition; `version`, `migrate` and `deprecated` exist; a registry test refuses an incomplete block; contracts build as ESM and CommonJS so the browser can share runtime code (question 5); nothing changes for the owner.

Open questions: none.

## Scope and non-goals

- In scope: contracts `BlockSpec` (flags, `estimate`, `previewCap`, `validate`, `version`, `migrate`, `deprecated`, `unit`, `flow`), the derived sets, `upgradeGraph` in `readGraph`, the catalog carrying `version`, `deprecated`, `unit`, `flow`, flags; body `flowOf` and the units read from the catalog, the picker hides retired blocks, loop constants and the loop check come from contracts; brain engine reads the flags (`SCORING_STEPS`, run-last); registry tests in all three packages; the dual build.
- Out of scope: moving `summaryOf`'s special summaries (they stay as optional UI polish), the posting and price copies in body, any new block.

## Approach

- [x] 1. Golden snapshot of the sets, every block's estimate and preview, and every template's estimate, preview and problems, taken before the move (`blocks.golden.unit.test.ts`).
- [x] 2. Flags in the definitions; the sets derive from them; brain's engine reads flags.
- [x] 3. `estimate` and `previewCap` in the definitions; the switch and the map go.
- [x] 4. `validate` in the definitions; `validateGraph` keeps only the rules that hold for every block.
- [x] 5. `version`, `migrate`, `deprecated`, `upgradeGraph`; the catalog and the node carry the version; the body keeps it through a save.
- [x] 6. `unit` and `flow` in the catalog; body `flowOf` and the units read them.
- [x] 7. Registry tests (contracts and body; brain's executor list is complete at compile time).
- [x] 8. Dual build of contracts, measured and not kept (see Outcome).
- [x] 9. Gates, MEMORY.md, commit.

## Edge cases and risks

- The refactor must change nothing: the golden snapshot and the existing 249 contract tests stay green after every step.
- Module order: the derived sets are built after `BLOCKS`; nothing may read them while the module loads.
- A saved node has no `version`: it means 1. Upgrading must be safe to repeat, so `migrate` functions are written to be repeatable and the node's version is set after upgrading.
- The body must send the version back on save, or a saved node would be upgraded again.
- Bundle size: body now imports runtime code from contracts (zod and the catalog); the size before and after is recorded; if it is too large the loop copies in body stay and the dual build only serves tests.
- Dual build: brain's module alias points to `dist/index.js` (CommonJS) and keeps doing so; `files: ["dist"]` stays.
- Rollback: the new spec fields are optional.

## Verification

- `pnpm lint && pnpm ts:check --force && pnpm test:unit:run && pnpm build`, brain integration tests.
- Golden snapshot unchanged; registry tests pass for all blocks.

## Outcome

Shipped. A block's definition (`BLOCKS` in `packages/contracts/src/workflow.ts`) now carries `flags` (the five hand-kept sets, the output set, the scoring set and the run-last rule are built from them), `estimate` and `previewCap` (the cost switch and the preview map are gone), `validate` (Else, Task result, Retry, Select accounts and Write a post keep their own checks; `validateGraph` keeps what holds for every block), `unit` and `flow` (body's per-type chains for "what the number counts" and "takes X, gives Y" are gone), `version`, `migrate` and `deprecated`. `upgradeGraph` runs in brain's `readGraph`, so every read, run start and the workflow page see settings at the current version; a node carries its `version` through the canvas and back on save; a retired block is not offered in the picker. Registry tests walk every block in contracts (complete label and summary, fields exist, versions have their steps, estimates are not negative, the catalog carries the definition) and in body (an icon and a summary). The golden snapshot of the sets, every block's estimate and preview, and every template's estimate, preview and problems was written first and did not change.

Deviations: (1) The dual ESM and CommonJS build was tried and not kept. Importing even the loop constants from contracts into body added 86.5 kB (22.4 kB gzipped) to the main chunk (456.05 to 542.57 kB) because contracts is not tree-shaken; body keeps its small loop copies and the plan's goal (no per-type chains) was met by carrying `unit` and `flow` in the catalog instead. Revisit with a subpath export if body ever needs more runtime code from contracts. (2) No made-up-block test: the block list is a closed constant, so completeness is enforced by the registry tests and by `EXECUTORS: Record<BlockType, ...>` at compile time. (3) `summaryOf`'s special summaries (schedule, score, merge, wait, retry, select, write a post) stay in body as optional polish; a new block gets `summary` and the number line for free.

Checks: lint, forced `ts:check`, unit tests (contracts 490, spider 1,358, body 1,024, brain 1,625), build, brain integration (55 files, 341 tests).

Adding a block now means: one entry in `BLOCK_TYPES` and `BLOCKS` (with flags, estimate, previewCap, validate as it needs), one executor in `EXECUTORS`, one icon in `BLOCK_ICONS`.
