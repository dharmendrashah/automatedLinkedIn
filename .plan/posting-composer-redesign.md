# Write a post: a LinkedIn-style composer

- Status: done
- Created: 2026-10-25
- Locked by user: yes, 2026-10-25 (documents added; preview stays beside the composer)

## Goal

Replace the stack of block cards on `/posting/:accountId/:draftId?` with one composer that looks and works like LinkedIn's "Create a post": who is posting at the top, one big text box, the attachment shown right under the text, and one row of icon buttons (emoji, photo, video, document, link) to add things. The live preview stays beside it. Same data, same drafts, same autosave: only the editing screen changes.

## Requirements

Confirmed (from the request and the screenshot):

- Simple to use and good looking; the post writer looks like LinkedIn's.
- Adding text, images and files must be one click, with no "Add block" step and no block frames, move or remove buttons.
- Real data only, as before.

Locked answers:

- "Files" means documents: a Document attachment (pdf, ppt, pptx, doc, docx) is added next to photos, video and link.
- The preview stays beside the composer on wide screens.

Open questions (must be empty before locking):

- None.

Design decisions made while planning:

- A post is edited as one text and at most one attachment (`composerOf` and `blocksOf` turn that into the stored blocks, text first), so the stored shape and the drafts stay as they are. There is no half-made attachment: a link is added from a small popover only once it is an https address, a photo block disappears with its last photo.
- The contract's `addRefusal` is no longer used by anyone and is removed; the composer knows what to disable from the attachment it holds.
- Paste of an address as a link is left out (YAGNI); the Link button covers it.

## Scope and non-goals

- In scope (body):
  - New `composer.tsx`: header row (photo, name, account switcher, "Anyone" visibility mark), borderless auto-growing text box with the emoji panel, the attachment area, a bottom toolbar of icon buttons with tooltips, the character counter, and a footer with the saved state, Plan a time and Post now.
  - Attachment area: photos as a tidy grid of thumbnails with remove and alt text on a small popover, one video player, one link chip, (document card if question 1 is yes); an inline sentence when a second kind is refused; drag and drop of files onto the composer; paste of an https address offers "Add as link".
  - The toolbar disables the other attachment kinds once one is used, with a tooltip saying why (one attachment kind per post, as today).
  - Opening an old draft that has several text blocks merges them into one text box (same joined text, same limit).
  - The preview, schedule dialog, autosave, picker page and drafts list stay as they are.
  - Remove what the composer replaces: `block-card.tsx`, `add-block.tsx`, `text-block.tsx`, `photos-block.tsx`, `video-block.tsx`, `link-block.tsx`, the block move and add logic no longer used in `draft.ts` (with its tests), and `block-kinds.ts` if unused.
- In scope only if question 1 is yes: a `DOCUMENT` block in `packages/contracts/src/posting.ts` (pdf, ppt, pptx, doc, docx; name, size, an optional title), the same copy in `rules.ts`, the one-attachment rule, file checks, a document card in the preview. The `blocks` column is Json, so there is no migration; old drafts stay valid.
- Out of scope: sending, uploading files, link title and picture, polls, mentions.

## Approach

- [ ] Lock the questions with the owner.
- [ ] Tests first: merge of text blocks, the attachment helpers kept in `draft.ts`, document rules (if yes).
- [ ] Build the composer and its attachment area; wire it into `studio.tsx` in place of the block list.
- [ ] Remove the replaced block components and unused helpers and tests.
- [ ] Narrow screens: composer and preview as two tabs, as now.
- [ ] Look at it in a real browser at wide and narrow width, light and dark, keyboard only.
- [ ] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; update `MEMORY.md` and this plan.

## Edge cases and risks

- A draft saved with several text blocks or with text after the attachment: merged into one text, saved as one block on the next change; no data lost, order of the words kept.
- Dropping or pasting a file of the wrong type, too large, or when another kind is already attached: refused with a sentence next to the attachment area, never silently.
- Dropping several kinds at once: only the first kind in the drop is taken, the rest are named in the refusal.
- Text limit shared with the emoji panel (truncate by characters as now); right-to-left text keeps `dir="auto"`.
- Files are still only in memory; a reloaded draft shows "Attach again" on its thumbnails.
- Accessibility: every icon button has a name and a tooltip, the drop zone has a keyboard path (the toolbar buttons), focus returns to the text box after emoji and after removing an attachment, the counter and refusals are announced politely.
- Bundle: the page is already a lazy chunk; no new dependency.
- Rollback: front-end only (plus an additive contract block if documents are added).

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root.
- In a browser: write text, add emoji, add photos (several), remove one, add a video, a link, switch kinds, reload and attach again, plan a time, narrow width, dark mode.

## Outcome

Filled in 2026-10-25.

Shipped: `/posting/:accountId/:draftId?` now shows one composer (`components/posting/composer.tsx`, `composer-toolbar.tsx`, `attachment-area.tsx`): account switcher and photo on top, one borderless text box, the attachment under it (photo grid with a description button and remove, a video player, a document card, a link card), a row of icon buttons (emoji, photos, video, document, link; kinds that cannot be added are switched off with the reason), a counter, and a footer with the saved state, Plan a time and Post now. A file can be dropped anywhere on the card. The block cards, the add-block row and the per-block components are gone. The contract has a `DOCUMENT` attachment (pdf, ppt, pptx, doc, docx, 100 MB, not verified against LinkedIn) and no longer has `addRefusal`. Old drafts with several text blocks open as one merged text.

Deviations: paste of an address as a link was left out; a document is not kept in memory (nothing is played back from it), only a video and photos are.

Follow-ups: not seen in a browser by the agent; photo reordering was not built.
