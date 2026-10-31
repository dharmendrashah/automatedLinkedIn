# One person drawer everywhere

- Status: done
- Created: 2026-10-31
- Locked by user: yes (2026-10-31: "whenever we are showing the profile drawer it should be like we show in the /network page", in PR #151 as its own commit)

## Goal

The person drawer of the Unibox (and of a company or post drawer) shows only the profile view. It must be the My network drawer, with the same options (status, labels, notes, Do not contact, Invite, Open chat, Profile, Chat, History, Data JSON), and it must have a backdrop.

## Design

- **Brain:** `people.find({ slug })` answers the owner's My network person for a profile (the most recently touched one when several clients have them), or null.
- **Body:**
  - `PersonPanel` (`my-network/person-panel.tsx`): the drawer's content for one person id, the same `Body` My network used. Previous and Next show only when there is an order.
  - `PersonActions` (`my-network/person-actions.tsx`): owns what the panel asks for outside itself: answering a request (`useAnswer`, Start anyway) and inviting (`InviteDialog`, only while invites are live). My network keeps its own (it also invites selections).
  - `PersonBySlug`: finds the person with `people.find` and shows `PersonPanel` with `PersonActions` and its own pane; someone not on My network (a post commenter, say) gets the profile view as today.
  - `DetailDrawers` shows `PersonBySlug` for a person. `PersonDrawer` (My network) wraps `PersonPanel`.
  - The Unibox's drawer is modal like every other drawer (backdrop, closes on an outside click); `docked` goes.

## Edge cases and risks

- Person on several clients: the most recently touched one opens. The drawer's actions act on that client.
- Not on My network: profile view, unchanged.
- Erase from the drawer outside My network: the drawer closes.
- The Unibox loses the docked drawer (by request); the chat stays under the backdrop.

## Verification

- Integration: `people.find` (found, other owner, not found).
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.

## Outcome

- Shipped in PR #151 as its own commit: `people.find`, `PersonPanel` (exported from `my-network/person-drawer.tsx`, which `PersonDrawer` wraps), `PersonBySlug` with its `PersonActions` (`my-network/person-by-slug.tsx`), `DetailDrawers` using it at the My network width (`WIDE`), and the Unibox drawer modal.
- Deviation: `PersonPanel` stays in `person-drawer.tsx` (moving 500 lines to a new file bought nothing). The company and post drawers are as wide as the person drawer now.
- Not run: the drawers in a browser (sign-in needed).
