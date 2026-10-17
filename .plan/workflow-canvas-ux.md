# Workflow canvas: simpler, n8n-style editor

- Status: done
- Created: 2026-10-17
- Locked by user: yes, 2026-10-17

## Goal

Make `/workflows/:id` easier to use: blocks with icons, a full-width canvas without fixed side panels, settings that open on top of the canvas (as in n8n), keyboard support, and a top-to-bottom flow.

## Requirements

Confirmed:

- Icons and emojis on blocks and in the block picker.
- No fixed right-hand settings sidebar: a block's settings open on top of the canvas, as in n8n.
- Nicer inputs: number steppers, tag-style word inputs, toggles instead of yes/no selects.
- Keyboard support.
- The flow runs vertically (top to bottom) by default, not left to right.

Answered by the owner on 2026-10-17:

- Blocks are added n8n style: a "+" button and Tab open a searchable picker, and a "+" under each block adds the next one already connected. The fixed left palette goes.
- Settings open in a centred dialog over the canvas; changes apply as you type, and the canvas "Save changes" saves the workflow.
- Shortcuts: Tab (add), Enter or double-click (open settings), Delete/Backspace (remove), Esc (close), Ctrl/Cmd+S (save), Ctrl/Cmd+Z and Shift+Z (undo/redo), Ctrl/Cmd+D (duplicate), arrow keys (select the neighbouring block, as in n8n).
- Workflows saved left to right are laid out top to bottom when opened (`@dagrejs/dagre`); the new positions are saved only with Save. A graph already top to bottom is left as the owner placed it.
- Line icons in a coloured tile per group on blocks; emojis only in the picker's group titles.
- Only the canvas page in this task.

Open questions: none.

## Scope and non-goals

- In scope: `apps/body/src/components/workflows/*` (canvas, block node, palette or picker, settings), `packages/contracts` template positions (vertical), body unit tests.
- Out of scope: new blocks, engine or API changes, mobile layout, collaborative editing, a sticky-note block, copy and paste between workflows.

## Approach

- [x] 1. Lock this plan.
- [x] 2. Contracts: an `icon` (and optional emoji) per block in the catalog; templates placed top to bottom (`x` by branch, `y` by step). Tests first.
- [x] 3. Block node: icon tile, title, one-line summary, run state badge; handles on top and bottom; a "+" on the output handle.
- [x] 4. Block picker: searchable list by group with icons, opened by "+" or Tab; arrows and Enter pick, Esc closes; the new block is connected to the selected one and placed below it.
- [x] 5. Settings on top of the canvas (the chosen form), with better inputs: number stepper, tag input for words, toggle for yes/no, chips for multi choice; validation messages per field from the catalog schema.
- [x] 6. Keyboard shortcuts (the agreed set) and a small "?" help listing them.
- [x] 7. Layout of existing left-to-right graphs (the chosen option).
- [x] 8. Full-width canvas: the cost line, problems and Save in a slim toolbar on the canvas; mini map and controls kept.
- [x] 9. Verification, MEMORY.md, Outcome.

## Edge cases and risks

- Shortcuts must not fire while typing in an input or while a dialog is open (Backspace in a field must not delete the block).
- Undo history must not survive a save or a page change; Save stays explicit, so a reload still loses unsaved edits (warn before leaving with unsaved changes).
- Re-laying out a saved graph changes positions only; it marks the canvas dirty but never saves on its own.
- Graphs with branches (commenters and reactors side by side) must stay readable top to bottom: layout by depth, siblings side by side.
- Trigger blocks have no input handle and output blocks no output handle; the "+" shows only where a block can follow, and the picker lists only blocks that accept the selected block's output kind.
- The replay overlay of a run and the problem markers must still show on the new node.
- Emojis vary by OS and screen readers read them out: decorative ones get `aria-hidden`.
- No backend or migration change; rollback is reverting the body change.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Unit tests: template positions are vertical, picker filtering by kind, keyboard handler ignores typing in inputs, layout keeps every node and edge.
- Real path: the page in a browser through the dev server (screenshots of add, edit, connect, run replay), if sign-in is available locally.

## Outcome

- Shipped: full-width canvas (`workflow-canvas.tsx`) with toolbar panels (cost, problems that open the block, undo, redo, shortcuts help, Add block, Save); block node with icon tile, top/bottom handles and a "+" below; searchable picker (`block-picker.tsx`) that only offers blocks taking the chosen block's output; settings dialog (`block-settings.tsx`) with steppers, tag input, chips and the block's problems; shortcuts (`shortcuts.ts`), undo/redo (`history.ts`, 50 steps), dagre layout and neighbour selection (`layout.ts`); templates in contracts laid out top to bottom; a warning before leaving with unsaved changes.
- Deviations: icons live in body (`block-look.ts`, keyed by block type) instead of the contracts catalog, since only the browser uses them. Field errors come from the server's problem list for the block (the zod schemas are not sent to the browser). The old palette and settings panel were deleted.
- Verified: lint, ts:check, unit tests (layout, shortcuts, history, picker filter, vertical templates), build.
- Not verified: the page in a browser; local sign-in (authentik) was required and the Docker body on port 3000 serves an older build.
