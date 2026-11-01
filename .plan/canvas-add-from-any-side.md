# Add a block from any side of a block

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-01
- Locked by user: yes, 2026-11-01 (the request settles it: "I can add nodes from any side, up, bottom, left and right")

## Goal

A block on the canvas shows a "+" on every side (it only has one, at the bottom, today). The new block is placed on that side and joined with a line that leaves and enters on the matching sides.

## Requirements

Confirmed:

- "+" on top, right, bottom and left of a block.
- Bottom, right and left add a block that comes after this one (line from this block to the new one). Top adds a block that comes before it (line from the new block into this one).
- Placement: on the chosen side, moved aside when that spot is taken. Lines use the chosen side and the opposite side of the new block (bottom to its top, right to its left, and so on).
- The picker offers any block after a block except a trigger; before a block it offers any block that gives something (not an output block); a trigger has no top "+" (nothing can feed it).
- Keyboard add (the toolbar button and shortcut) keeps adding below.

Open questions: none.

## Scope and non-goals

- In scope: `block-node.tsx` (four buttons), `canvas-actions.ts`, `workflow-canvas.tsx` (pick), `layout.ts` (`placeBelow` becomes `placeBeside`), `choicesFor` and the picker title, tests, `MEMORY.md`.
- Out of scope: dragging a line from a handle (already works), new connection rules, auto layout.

## Approach

- [x] 1. Tests first: `placeBeside` for each side with and without a block in the way; `choicesFor` before a block.
- [x] 2. `layout.ts`, `choicesFor`, picker title.
- [x] 3. Canvas: `addNextTo(id, side)`, `pick` builds the edge by side, node shows four "+" buttons.
- [x] 4. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` pass. Not seen in a browser (sign-in).

## Edge cases and risks

- A trigger has no input, so no top "+"; a block with no output (Export, Add to list) still gets bottom, left and right, as before (the owner may chain anything after anything).
- Several blocks already on a side: the new one slides along (right/down steps) until free, so it never lands on another block.
- The buttons sit outside the block and take clicks before the handles; they must not start a drag (`nodrag`) or hide the handles. Left and right "+" are 36 px outside the block, like the bottom one.
- A line already between two blocks is not added twice: a new block is new, so no duplicate is possible.
- Undo: `commit` already records the change as one step.
- Run view: the "+" show on hover or when selected only, so a run's picture is unchanged.

## Verification

- Unit tests above; lint, ts:check, unit tests, build.

## Outcome

Shipped: every block shows a "+" on top (not on a trigger), right, bottom and left. `CanvasActions.addNextTo(id, side)` opens the picker (title "Add before" for the top); `placeBeside` replaces `placeBelow`; the line is from this block to the new one (this block's side to the new block's opposite side), and from the top the new block feeds this one (`OPPOSITE` in `graph-convert.ts`). The picker offers blocks that give something when adding before. Keyboard add still adds below. Not seen in a browser behind sign-in.

Addendum (same day, owner: "I can delete a connected line as well"): a line is now `RemovableEdge` (`removable-edge.tsx`, edge type `removable`): clicking it selects it and shows an X button in the middle that removes it (one undo step, `CanvasActions.removeEdge`); a line that carries a run's count shows the count instead. Clicking a line also clears the block selection, because Delete used to remove the previously selected block and not the line. The shortcut help says "Remove the selected block or line". No unit test (the canvas has no component tests); checked by lint, ts:check, unit tests and build only.
