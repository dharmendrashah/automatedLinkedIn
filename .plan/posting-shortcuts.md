# Write a post: shortcuts and quick link actions

- Status: done
- Created: 2026-10-25
- Locked by user: yes, 2026-10-25 (both questions answered as proposed)

## Goal

Make the composer faster to write in, as chat and LinkedIn's own editor are: typing `:` followed by letters offers matching emoji to pick, and selecting text in the box shows a small floating bar to add a link or turn the selection into one. A few keyboard shortcuts go with them, and the composer says what they are.

## Requirements

Confirmed (from the request):

- Typing `:` (then a name, such as `:smi`) shows a list of emoji to choose from, near the caret.
- Selecting text shows a small bar with actions to add a URL or convert the selection to a link.
- Upgrade the UI and UX around them.

Open questions (must be empty before locking):

1. LinkedIn posts have no clickable words inside text: a link is either a plain address typed in the text (LinkedIn makes it clickable and shows a card) or the post's one link attachment. What should the selection bar do?
   - Selected text that is an address (`example.com`, `https://...`): "Make it a link" sets it as the post's link attachment (as the Link button does) and keeps the address in the text. Proposed.
   - Other selected text: "Add a URL" asks for an address and puts it after the selection in the text (`your words https://...`) and sets the link attachment. Proposed. Alternative: set only the attachment and leave the text alone.
2. Other shortcuts to include. Proposed: `:` emoji list; `Cmd/Ctrl+K` add a link for the selection (or at the caret); `Esc` closes any list or bar; `Cmd/Ctrl+Shift+E` opens the emoji panel; a "Shortcuts" help button (keyboard icon) under the text box listing them. Not proposed: bold and italic (LinkedIn posts are plain text; formatted look needs special characters that screen readers read badly).

## Scope and non-goals

- In scope (body only, no backend, no contract change):
  - `emoji.ts`: every emoji gets a name and a few keywords (about 150 emoji, hand written, no new dependency); `findEmoji(query)` ranks by name start, then word start, then keyword, and takes at most 8.
  - `emoji-trigger.ts` (pure): `triggerAt(text, caret)` finds an open `:query` before the caret (starts at the start of the text or after whitespace, 1 to 20 letters, digits, `_`, `+` or `-`, no space), so `10:30` and `https://` never trigger it; `applyEmoji(text, trigger, emoji)` replaces `:query` with the emoji and gives the new caret.
  - `emoji-suggest.tsx`: a listbox near the caret with arrow keys, Enter or Tab to insert, Esc to close, mouse click, and `aria-activedescendant` on the text box so a screen reader hears the choice. A closed list leaves Enter and Tab as they were.
  - `caret-position.ts`: where the caret or the start of the selection is, in the text box, by measuring a hidden copy of it; used to place the list and the selection bar, kept inside the card.
  - `selection-bar.tsx` and `link-text.ts` (pure helpers: is the selection an address, normalise `example.com` to `https://example.com`, build the text with an address added after the selection, one address at most per action): a small bar over the selection with the actions of question 1, shown only when something is selected, hidden on typing or click away, never covering the text it acts on.
  - Shortcuts help popover; `Cmd/Ctrl+K` handler.
  - Tests first for every pure piece; the DOM parts are walked through in a browser.
- Out of scope: rich text, bold and italic, mentions, hashtag suggestions, the full emoji set with skin tones, a link card with title and picture (still needs a backend call).

## Approach

- [ ] Lock the questions with the owner.
- [ ] Tests, then `emoji.ts` names and `findEmoji`, `emoji-trigger.ts`, `link-text.ts`.
- [ ] `caret-position.ts`, `emoji-suggest.tsx`, wire into the composer's text box (keyboard handling in one place).
- [ ] `selection-bar.tsx` and `Cmd/Ctrl+K`; the link action reuses the composer's existing link handler (one attachment rule stays in one place).
- [ ] Shortcuts help popover; the existing emoji panel keeps working and shares the data.
- [ ] Walk through in a browser: wide and narrow, light and dark, keyboard only, a screen reader pass for the list.
- [ ] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; update `MEMORY.md` and this plan.

## Edge cases and risks

- False triggers: times (`10:30`), addresses (`https://`), `::`, a colon after a word (`Note:`), a colon inside the text far from the caret; all of them must stay plain text. A closed or dismissed list stays closed until the colon is typed again.
- Typing fast: the list follows the text, no stale insert (the trigger is recomputed from the text and caret at the moment of choosing).
- The text limit: inserting an emoji near 3,000 characters is cut like any typing, never in the middle of an emoji.
- IME and composition (Japanese, Chinese, Hindi input): no list and no Enter capture while composing.
- Positioning: long lines, wrapped text, scrolled box, the card edge, narrow screens; the measurement copy must match the text box's font, padding and width, and is removed after use; if it cannot be measured, the list opens under the text box instead of failing.
- Selection bar: a selection across lines, a selection with only spaces (no bar), selecting inside an address, a very long selection, dragging the selection with the mouse (the bar waits until the mouse is released), selection changed by the keyboard.
- Links: only `https` addresses are accepted (a bare `example.com` becomes `https://example.com`, `http://` is refused with a sentence); another attachment kind already on the post gives the same refusal as the Link button; a second address replaces the first link after saying so.
- Accessibility (`ACCESSIBILITY.md`): the list is a `listbox` with options and a live count ("3 emoji, use the arrow keys"); the bar is a `toolbar` reachable by keyboard (`Cmd/Ctrl+K` and Tab from the box); focus returns to the text box after every action; nothing depends on the mouse or on colour.
- No new dependency and no backend, so no migration; bundle effect is the emoji names (a few kB) in the lazy canvas chunk.
- Rollback: front-end only; the composer works without the two new parts.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root.
- In a browser: type `:sm`, pick with arrows and Enter, with Tab and with the mouse; type `10:30` and `https://x` (no list); select a word and add a URL; select an address and make it a link; `Cmd/Ctrl+K`; Esc; narrow width; dark mode; keyboard only. State what could not be run.

## Outcome

Filled in 2026-10-25.

Shipped (body only): the `:` emoji list (`emoji-trigger.ts`, `emoji.ts` with names and keywords for about 130 emoji and `findEmoji`, `emoji-suggest.tsx`), the selection bar (`selection-bar.tsx`, `link-text.ts`), `Cmd/Ctrl+K`, `Cmd/Ctrl+Shift+E`, Esc, and a keyboard help button next to the counter (`shortcuts.ts`, `shortcuts-help.tsx`). `text-editor.tsx` holds the text box and all its keyboard handling; `caret-position.ts` places the list and the bar by measuring a hidden copy of the box. The toolbar's link form takes a bare site name too. Replacing the post's link says so in a toast.

Deviations: the list opens for one letter after the colon, as planned; nothing was left out. The DOM parts (placement, focus, IME, screen reader) are not covered by unit tests and were not walked through in a browser by the agent.
