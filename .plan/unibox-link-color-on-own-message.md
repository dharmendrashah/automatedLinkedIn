# Unibox: a link in one of my own messages was invisible

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-22
- Locked by user: yes, 2026-11-22 (verified against the real staging page before any code change; small, well-understood fix)

## Goal

A message someone sent that is just a link (for example a pasted Loom URL) looked like a completely blank blue bubble
in the Unibox chat window, on a message the owner sent themselves. Make the link visible and readable there.

## Requirements

Confirmed (verified against the real conversation on staging, "Hezron Daniel", before writing any fix):

- The link was present the whole time, in the data and the DOM (confirmed via the page's accessibility tree: a real
  `<a href="https://www.loom.com/share/...">` with the right text). It was only invisible, not missing.
- Root cause: `RichText`'s link styling hard-codes `text-primary` (the theme's blue) for both the link text and the
  external-link icon next to it, with no awareness of which bubble it sits in. An "own" message bubble is also blue
  (`bg-primary`), so the link rendered as blue text on a blue background.
- Fix the colour only for a link inside an "own" bubble; a message from the other person (a white/card bubble) keeps
  its current blue link colour, which already reads fine there.

Open questions: none.

## Scope and non-goals

- In scope: `RichText`'s link colour in `apps/body/src/components/unibox/rich-text.tsx`, and passing which side a
  message is on from `message-bubble.tsx`.
- Out of scope: the "shortened" badge's own colours (already a filled chip with its own background, unaffected by
  bubble colour, confirmed readable in both contexts); the spider's message reader (the text and link were already
  captured correctly — this was purely a body/CSS bug, not a data bug).

## Approach

- [x] 1. Verify against the real page first (not guess): opened the live "Hezron Daniel" conversation on staging and
  read the accessibility tree of the blank-looking bubble — the link text and href were there, confirming this is a
  rendering bug, not a missing-data bug in the spider's message reader.
- [x] 2. `rich-text.tsx`: `RichText` takes an `own?: boolean` prop; the link's className becomes
  `text-primary-foreground` when `own` (matching the rest of that bubble's text) and keeps `text-primary` otherwise.
- [x] 3. `message-bubble.tsx`: passes its already-computed `own` flag through to `RichText`.
- [x] 4. Gates and `MEMORY.md`.

## Edge cases and risks

- `conversation-row.tsx` (the conversation list's preview snippet) uses only `Marked` from the same file, not
  `RichText`, so it never renders a link and is unaffected by this change.
- No test added: this codebase has no component-render tests for presentational chat/canvas components (confirmed —
  no `@testing-library/react` dependency, no precedent), and the change is a one-line conditional class with an
  obviously correct outcome; adding a new test-rendering dependency just for this would be disproportionate.
- Rollback: reverting leaves the link visible-but-blue-on-blue again for an own message with a link — a visual
  regression only, no data loss.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, all green.
- Not done: a visual check against the live staging page, since staging serves a separately built/deployed version of
  the body app and will not reflect this local source change until deployed; the user's own local dev server (HMR)
  should show it immediately.

## Outcome

Fixed: `RichText` now takes `own`, and `message-bubble.tsx` passes it through, so a link inside a message the owner
sent themselves renders in the bubble's own (light) text colour instead of blue-on-blue. Verified root cause against
the real "Hezron Daniel" conversation on staging before writing the fix. All gates green. Bundled into PR #234
alongside the unrelated "Split people" feature at the user's explicit request, rather than its own PR.
