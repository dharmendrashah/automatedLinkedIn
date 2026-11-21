# Split people: choose a number of parts, not just a percent

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-22
- Locked by user: yes, 2026-11-22 (equal shares for every part count including 2; real code change through the normal pipeline)

## Goal

The `Split people` block (`logic.split`) asks for how many parts to divide into (2 to 10) instead of a single percent. Each
part gets about an equal, stable share, and the canvas gives one connector per part (today's single "Else" connector
becomes "Else", "Else 2", "Else 3", ... as needed) — so an even N-way A/B/C test no longer needs chaining several Split
blocks by hand and getting the percent math wrong.

## Requirements

Confirmed:

- A new `parts` setting (2-10, a stepper like today's percent) replaces the percent field for every block the owner
  configures from now on. Picking N gives N connectors: the main one plus N-1 "Else"-style ones, each about 1/N of what
  reaches the block.
- Shares are always equal; there is no custom percent per part (confirmed by the user: simplicity over per-branch
  control). This also applies to 2 parts — a freshly configured 2-part split is 50/50, not a custom percent.
- A block saved before this ships (it has a `percent` in its config, never a `parts` key) keeps running exactly as it does
  today — its saved percent, two outputs (main/Else) — until someone opens that block's settings and sets a part count
  themselves. No existing saved graph changes behaviour on its own. This is the standard way this codebase adds an
  optional field (see `outputsOf`/`fromPort` in `.plan/workflow-engine-p3-ports.md`: "An existing graph ... behaves as
  before ... no data migration").
- This is a real code change (contracts schema, worker engine, canvas UI, tests), shipped through the normal pipeline:
  lint, `ts:check`, unit tests, build, then a PR and deploy — not a live workflow-content edit.

Open questions: none.

## Scope and non-goals

- In scope: `logic.split`'s config schema and fields, the hash-to-bucket logic and its executor in the worker, edge/port
  validation for more than 2 outputs, the canvas's extra-output handles and edge labels for N ports, the block's one-line
  summary text, unit and integration tests, `MEMORY.md`.
- Out of scope: per-part custom percentages, any other `keepsAside` block growing more than 2 outputs (If, Wait per
  person, Detect changes, etc. keep main/Else only), rebuilding the user's live "Release preview 2026" campaign with this
  feature (a separate follow-up once it ships), the unused A16 "Experiment engine" automation in `automations.ts`.

## Approach

- [x] 1. Contracts (`packages/contracts/src/workflow.ts`):
  - `logic.split` config: add `parts: z.number().int().min(2).max(10).default(2)`; keep `percent` in the schema (so an
    old saved config still parses) but drop it from `fields` (no UI control for it any more).
  - Add one `fields` entry: `{ key: 'parts', label: 'Parts to split into', kind: 'int', min: 2, max: 10, hint: '...' }`.
  - Add `splitOutputs(parts: number): string[]` next to `outputsOf`: `['main', 'else', 'else2', ..., 'else{parts-1}']`.
  - `validateFlow`'s output-port check: for a `logic.split` source whose raw config has a numeric `parts`, validate
    against `splitOutputs(parts)` instead of the static `outputsOf(from.type)`; everything else unchanged.
  - Test: `runSemantics.unit.test.ts` or a new `splitOutputs` case — 2, 3 and 10 parts; edge into an unknown port
    (`else3` on a 2-part split) is still an error.
- [x] 2. Worker engine:
  - `apps/brain/src/worker/engine/splitRules.ts`: factor the existing sha256-to-fraction call out of `onMainSide` into a
    shared `fractionOf(slug, nodeId)`, so `onMainSide` is unchanged (same hash input, same tests), and add
    `splitBin(slug, nodeId, parts): number` (`Math.floor(fractionOf(...) * parts)`, clamped to `parts - 1`).
  - `apps/brain/src/worker/engine/personBlocks.ts`'s `splitPeople`: read the **raw** `ctx.node.config.parts`
    (`typeof ... === 'number'`), not the zod-defaulted one, to tell a legacy block (no `parts` ever saved) from a new one.
    - Legacy (no `parts`): unchanged code path, byte-for-byte.
    - New (`parts` present): bucket every item with `splitBin`, write bins 1..N-1 to `portKey(nodeId, 'else'|'else2'|...)`
      (reusing the existing generic port-storage the phase-3 ports work already built), keep bin 0 as `main`, set
      `emit` to exactly the non-empty ports (the shared `emitsOf` fallback only knows about `main`/`else`, so this block
      must say its own live outputs).
  - Tests: extend `splitRules.unit.test.ts` with `splitBin` (even spread, same-item-same-bin, edges at `parts=2` and
    `parts=10`); add a `personBlocks.integration.test.ts` case with `parts: 3` and two `logic.else` blocks fed from
    `else` and `else2`, asserting the three groups partition the input with no overlap or gap and are each roughly 1/3;
    keep the existing `percent: 50` test passing unchanged (regression check for the legacy path).
- [x] 3. Canvas (`apps/body/src/components/workflows`):
  - `graph-convert.ts`: a small local `splitPorts(parts: number): string[]` (same naming as contracts' `splitOutputs`,
    duplicated on purpose — this file already avoids importing the contracts runtime bundle for a couple of constants,
    see the `DEFAULT_LOOP_ROUNDS` comment; `outputsOf`/`splitOutputs` pull in the same CJS bundle). `toFlow` computes
    each node's live outputs (`splitPorts(config.parts)` for a `logic.split` node with a numeric `parts`, else the
    catalog's static `block.outputs`) and carries it on `BlockData.outputs`; edge labels become "Else", "Else 2", ...
    instead of always "Else".
  - `startConfig`: a freshly dragged `logic.split` block starts with `{ parts: 2 }` (not `{}`), so it is immediately a
    "new" 50/50 block, distinct from a pre-existing block nobody has touched.
  - `summaryOf`: a `logic.split` case — `"Splits into {parts} about-equal parts"` when the raw config has `parts`, else
    today's `"Sends about {percent}% on, the rest to Else"` (an improvement either way: today it just shows the generic
    static summary with no number in it).
  - `block-node.tsx`: read `data.outputs ?? block.outputs` instead of `block.outputs` for the extra-handle loop; space
    N-1 handles evenly along the bottom instead of a single fixed point at 85%.
  - Tests: `graph-convert.unit.test.ts` — `toFlow` gives 3 output handles for a 4-part split and 1 for an untouched
    2-part/legacy node; edge label text for `else2`.
- [x] 4. `MEMORY.md`: the new parts-based Split design, the legacy-percent-stays-until-touched rule, and a pointer to
  this plan.
- [x] 5. Gates: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, plus the brain integration tests
  (`pnpm --filter @automatedLinkedIn/brain test:integration:run`, needs Postgres).

## Edge cases and risks

- **Existing live workflows using a custom percent** (for example the Invite recipe's 90/10 "best" split in
  `recipes.ts:418`, or any user's own control-group split): must keep their saved percent and exact behaviour untouched.
  Guaranteed by keying off the raw `parts` field's presence, not a zod-defaulted value — confirmed this is the only
  reliable signal, since `.default(2)` would otherwise make an old config indistinguishable from a new 2-part one.
- **A block mid-run when this ships**: a run already in progress reads the graph as it was when the run started
  (existing engine behaviour, not changed here), so no run is affected mid-flight.
- **Reducing parts after wiring**: if someone sets parts from 4 down to 2, the two now-unused connectors
  (`else3`, `else4`-equivalent) and anything still wired to them are left on the canvas; `validateFlow` already flags an
  edge from a port the block no longer has (`"... has no "else3" output."`) the same way it does today for a stray
  `fromPort`, so nothing silently misroutes — the owner has to deal with the dangling line, same as any other block's
  output change.
- **The sha256 hash input is unchanged** (`slug|nodeId|split`), so a legacy percent=50 block and a new parts=2 block,
  for the exact same person and node id, land the same person on the same side — continuity for anyone who flips an
  existing 50/50-ish block over to the new field.
- **No DB migration**: block config is stored as the existing JSON `NodeConfig`, no Prisma schema change.
- **Rollback**: `parts` is optional and ignored by anything that does not know about it; a rollback only breaks newly
  created N-way splits (3+ parts), which simply stop having more than 2 connectors read correctly.
- **This does not touch the user's live staging campaign.** Fixing today's "Release preview 2026" workflow still needs
  either the manual Else-chain fix already given, or a rebuild once this ships — that is a separate, later step.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Brain integration tests (Postgres): the new 3-part split test plus the existing legacy percent test, both green.
- Manual: in a local/staging canvas, add a fresh Split block, set it to 4 parts, confirm 4 connectors appear and a line
  from each saves and reloads correctly; open an old saved Split block (percent-based) and confirm it still shows its
  old behaviour until Parts is touched.

## Outcome

Shipped as planned, plus one bug found and fixed along the way:

- Contracts: `logic.split`'s config gained `parts` (2-10, stepper); `percent` stays in the zod schema only so an old
  saved block still parses. `splitOutputs(parts)` builds `['main', 'else', 'else2', ...]`; `validateFlow` uses it for a
  `logic.split` node with a raw numeric `parts`, the plain `outputsOf` otherwise.
- Worker: `splitRules.ts` factored the sha256 call into `fractionOf`, added `splitBin` (same hash input as
  `onMainSide`, so a legacy 50/50 block and a new 2-part one place the same person the same way). `personBlocks.ts`'s
  `splitPeople` branches on the **raw** `ctx.node.config.parts` (not the zod-defaulted one) to tell a block saved before
  this shipped from a new one; the new path buckets with `splitBin`, writes each non-main bin via `portKey`, and sets
  `emit` itself (the shared `emitsOf` fallback only knows `main`/`else`).
  - **Found during testing, fixed as part of this change**: `executors.ts`'s `elseBlock` (the `logic.else` block) was
    hardcoded to always read its parent's `~else` key, ignoring the edge's actual `fromPort`. Harmless while every
    `keepsAside` block had exactly two outputs, but it meant an `Else` block wired to a 3-way split's third connector
    silently read the SECOND bin's items instead (duplicate reads, people missing from the actual third group) — caught
    by the new integration test (39 people recovered instead of 45). Fixed to resolve each incoming edge's real port via
    `portOfEdge`/`portKey`, same pattern `process.merge` already used; still falls back to `else` for an edge with no
    `fromPort` into a `logic.else` block, so every pre-existing graph is unaffected.
- Canvas: `BlockData.outputs` carries each node's live output list (`graph-convert.ts`'s local `outputsOf` helper,
  duplicated rather than importing contracts' version, matching the file's existing `DEFAULT_LOOP_ROUNDS` precedent);
  `block-node.tsx` spaces N-1 extra handles evenly instead of one fixed dot; edge labels read "Else 2", "Else 3", ...;
  `startConfig('logic.split')` now writes `{ parts: 2 }` so a freshly dragged block is unambiguously "new"; `setConfig`
  in `workflow-canvas.tsx` recomputes `outputs` live when the user changes Parts in the settings dialog (the connectors
  appear/disappear without a reload); `summaryOf` shows "Splits into N about-equal parts" or the legacy percent line.
- Deviations from the plan: none in the design; the `elseBlock` fix was an addition, not foreseen in the plan's scope,
  but directly caused by this change (only surfaces once a block can have more than one non-main output feeding an
  Else block) and covered by the same new integration test, so it stayed in this change rather than a separate one.
- Verified: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` (repo-wide, all green) and the full brain
  integration suite (`pnpm --filter @automatedLinkedIn/brain test:integration:run`, 113 files / 656 tests, all green,
  including the new 3-part split test and the untouched legacy percent test). Not run: a manual browser check (no UI
  dev server was started this session) — the canvas behaviour is covered by `graph-convert.unit.test.ts` instead.
- Follow-up (not done here, out of scope by the locked plan): the user's live "Release preview 2026 · 4 First message"
  staging workflow still has its hand-built, miscalculated Else chain; rebuilding it with this new Parts field is a
  separate next step once this ships.

### Follow-up after first manual check (2026-11-22, same day)

The user tried the shipped feature in their own local dev server and reported two UI issues, confirmed and fixed:

- **Dots looked crowded/miscounted**: the N-1 extra dots were squeezed into a 60-98% span regardless of count, so at
  10 parts (9 dots, 12px wide, ~10px apart) they visually overlapped and were hard to count correctly. Spread them
  across more of the node's width, clear of the hook-phase dots' 12-40% zone.
- **Asked and confirmed by the user**: show one dot per part *including main* (not just the N-1 "aside" ones), so the
  dot count on the canvas always equals the Parts setting exactly. Implemented by conditionally styling the existing
  "bottom" side handle (used by every block for its plain main-output line) to look and sit like the other dots only
  when the node is a Split block with more than one part; its id and wiring are unchanged, so saved graphs are
  unaffected. Also confirmed and lowered the Parts minimum from 2 to 1 (`parts: 1` is a harmless no-op: everyone stays
  on `main`, nothing kept aside) — `splitOutputs`/`splitPorts` clamp to `Math.max(1, ...)` instead of `Math.max(2, ...)`.
- Edge labels for a Split block also changed from "Else"/"Else 2" to the equal share as a percentage (e.g. "10%" for a
  10-way split), since "Else" reads oddly once there is no single Else concept left; other `keepsAside` blocks (If,
  Wait per person, ...) still say "Else".
- Verified again: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` (all green) and
  `personBlocks.integration.test.ts` (113 files / 656 tests, green). No new automated test for the dot-rendering
  change itself (presentational JSX in `block-node.tsx`; this codebase has no existing render tests for canvas nodes,
  and the underlying data it renders — `outputs`/`splitPorts` — is already covered).
