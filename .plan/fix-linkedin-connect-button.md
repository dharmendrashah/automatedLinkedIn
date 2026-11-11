# Fix LinkedIn Connect button selector for new UI

- Status: draft
- Created: 2026-11-11
- Locked by user: no

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

- [ ] Review the actual button markup from staging
- [ ] Update `CONNECT_LINK` selector to match `button[aria-label*="Invite"]` that contains "to connect"
- [ ] Keep the old selector as fallback using CSS selector `:is()` combinator
- [ ] Update `inviteFixture.ts` to generate button-based markup instead of anchor
- [ ] Update the comment in `markup.ts` to document the button format
- [ ] Run `pnpm test:unit:run` for linkedinInvite task
- [ ] Verify the selector works with test fixtures

## Edge cases and risks

- The aria-label includes the person's name, so we need a pattern that matches "Invite ... to connect"
- Multiple Connect buttons may exist on the page (sticky header, top card, More menu)
- The selector must work both in the main document and shadow roots (querySelectAll does)
- Fallback to old selector ensures older versions of LinkedIn page still work
- Test fixtures must be updated to match the new button format, or old tests may fail

## Verification

- `pnpm --filter @automatedLinkedIn/spider test:unit:run -- linkedinInvite` passes
- Manual: run the linkedinInvite task on staging and verify it finds the Connect button
- Check that `parseProfileActions` returns non-empty `connects` array

## Outcome

Filled in when done.
