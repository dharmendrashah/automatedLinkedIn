# Workflow engine phase 3: output ports

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-02
- Locked by user: yes, 2026-11-02 (phase 3 of [workflow-engine-n8n-alignment.md](workflow-engine-n8n-alignment.md); question 4 answered with the recommended default: ports replace the Else block for new graphs, the Else block keeps working; same branch as phases 0 to 2)

## Goal

A block that keeps some items aside (If, Task result, Retry, Run another workflow) has two outputs, `main` and `else`, and a line leaves from one of them. This is n8n's output ports, so a branch no longer needs an Else block between.

## Requirements

Confirmed (parent plan, question 4):

- `outputs` of a block: `main`, plus `else` for a block that keeps items aside (derived from the existing `keepsAside` flag; no new data to keep in step).
- A line may carry `fromPort`. Without it the line is `main`, except a line into an Else block, which stays the `else` output of its source (so every saved graph reads as before; no data migration).
- Items of the `else` output are kept under `<id>~else` (as now); any block reads the output its line leaves from.
- `validateGraph` errors when `fromPort` is not an output of the source block.
- The canvas draws an extra "Else" handle on a block that has the output; a line drawn from it saves `fromPort: 'else'`.

Open questions: none.

## Scope and non-goals

- In scope: contracts (`outputsOf`, `fromPort`, `portKey`, `portOfEdge`, validation, catalog), brain input keys, Merge and Else reading, body handles and graph convert, tests, MEMORY.md.
- Out of scope: a third output, removing the Else block, labelling a line by its output in the run view beyond the handle name.

## Approach

- [x] 1. Tests first: contracts (`outputsOf`, `portOfEdge` with and without `fromPort`, unknown port error), brain unit (`inputKeys`/`forwardSources` read the `else` key for an `else` line), integration (If else port into a CSV with no Else block), body (`toFlow`/`toGraph` carry the port).
- [x] 2. Contracts: `fromPort`, `outputsOf`, `portKey`, `portOfEdge`, validation, catalog `outputs`.
- [x] 3. Brain: `forwardSources` returns the port key of each line; `inputKeys` drops its Else special case; Merge reads the port key.
- [x] 4. Body: `Block.outputs`, handle `port:else`, `toFlow` and `toGraph`.
- [x] 5. Gates, MEMORY.md, commit.

## Edge cases and risks

- An existing graph (no `fromPort`): behaves as before, including an Else after a non-keeping block (reads nothing).
- A line from the `else` port into a block that is not an Else: reads `<id>~else`; a source that never kept anything has no such items, so the target is skipped by liveness.
- Two lines between the same blocks stay refused (`edgeKey`), so a block cannot take both outputs of one source into the same block.
- Rollback: the field is optional; older code ignores it (a line would read as `main`).

## Verification

- `pnpm lint && pnpm ts:check --force && pnpm test:unit:run && pnpm build`, all brain integration tests.
- A run through the engine of an If with a line from its `else` port and no Else block.

## Outcome

Shipped: `fromPort` on lines, `outputsOf` (main, plus else for blocks that keep items aside), `portKey`, `portOfEdge` reading `fromPort`, a validation error for an unknown output, `outputs` in the catalog; `forwardSources` and `inputKeys` read the output each line leaves from (the Else special case is gone); Merge reads each line's output; the canvas draws an Else handle on those blocks and saves `fromPort`. Tests: contracts `runSemantics.unit.test.ts`, brain `workflowInput.unit.test.ts` and `liveness.integration.test.ts`, body `graph-convert.unit.test.ts`. Deviations: `outputs` is derived from the `keepsAside` flag instead of a field on every definition; the Else block is kept and not deprecated. Follow-ups: a third output type if a block needs one.

Verified: lint, `ts:check --force`, unit tests, build, all brain integration tests. Not run: the canvas handle in a browser (not seen drawing or dragging).
