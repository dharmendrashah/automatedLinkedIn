# Fix LinkedIn Connect button selector for new UI

- Status: done
- Created: 2026-11-11
- Locked by user: yes, 2026-11-11 (no open questions)

## Goal

LinkedIn changed the Connect button UI from `<a href="/preload/custom-invite/...">` to `<button aria-label="Invite ... to connect">`. Update the selector to detect the new button-based UI while maintaining support for the old anchor-based UI.

## Requirements

Confirmed:

- Staging run shows "The profile shows no Connect button" on all 5 invitees
- Captured HTML shows Connect buttons are `<button>` elements with `aria-label="Invite ... to connect"`
- Old selector `a[href*="/preload/custom-invite/"]` only looks for anchor tags
- Need to support both old and new formats for backward compatibility
- Must not break the pendingLabel or other profile action checks

Open questions:

- Should we completely replace the selector or create a fallback? (Plan: use selector that matches both)

## Scope and non-goals

- In scope: Update `CONNECT_LINK` selector in `markup.ts` to detect button-based Connect button
- In scope: Update `inviteFixture.ts` to use button-based markup for new tests
- In scope: Run the invite task tests to verify
- Out of scope: Change how the task clicks or interacts with the button (already works)

## Approach

- [x] Review the actual button markup from staging
- [x] Update `CONNECT_LINK` selector to match `button[aria-label*="Invite"]` that contains "to connect"
- [x] Keep the old selector as fallback using CSS selector `:is()` combinator
- [x] Update `inviteFixture.ts` to generate button-based markup instead of anchor
- [x] Update the comment in `markup.ts` to document the button format
- [x] Run `pnpm test:unit:run` for linkedinInvite task
- [x] Verify the selector works with test fixtures

## Edge cases and risks

- The aria-label includes the person's name, so we need a pattern that matches "Invite ... to connect"
- Multiple Connect buttons may exist on the page (sticky header, top card, More menu)
- The selector must work both in the main document and shadow roots (querySelectAll does)
- Fallback to old selector ensures older versions of LinkedIn page still work
- Test fixtures must be updated to match the new button format, or old tests may fail

## Verification

- [x] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` all pass
- [x] `inviteReader.unit.test.ts` all 12 tests pass, including the slug encoding test
- [x] Both old anchor format and new button format are correctly detected
- [x] All 1423 unit tests in spider pass

## Outcome

Completed 2026-11-11:

**Changes made:**
- Updated `markup.ts` `CONNECT_LINK` selector to match both `a[href*="/preload/custom-invite/"]` (old) and `button[aria-label*="Invite"][aria-label*="to connect"]` (new)
- Updated `inviteReader.ts` `parseProfileActions` to extract slug from both anchor href vanityName and button aria-label (first name match, case-insensitive)
- Updated `inviteFixture.ts` connect() function to generate button elements instead of anchors
- Updated comments to document LinkedIn's 2026-11 UI change

**Tests passing:**
- All spider unit tests: 1423 passed
- All inviteReader tests: 12 passed (including slug encoding with percent-encoding and mixed case)
- Lint, type check, build all pass with no warnings

**Backward compatibility:**
Both old anchor-based and new button-based Connect link formats are supported. The code extracts the profile slug from whichever format is present and matches them using the same slugKey normalization (lowercase, percent-encoding handled).

**Not run:** Production deployment (awaiting team decision). The code is branch-ready on `main` and documented in `MEMORY.md` with the observation date 2026-11-11.

