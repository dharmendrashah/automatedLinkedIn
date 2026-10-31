# My network takes chats LinkedIn names by member id

- Status: done
- Created: 2026-10-31
- Locked by user: yes (2026-10-31, "yes please do"), in PR #153

## Goal

Chats LinkedIn began address their person by member id (`/in/ACoAA…`), so the people index never tied them to a profile: they made no person and joined no one's row. Tie them by name, with the one rule the Unibox uses (#153).

## Design

- One rule in SQL, used by the index triggers and by brain: `people_index_slug_by_name(owner, account, name)` gives the one profile slug of that exact name among the account's connections, sent invites and requests; when the account has none of that name, the one My network person of that name; else null (two profiles of one name stay unknown).
- `people_index_conversation_slug` falls back to it after the address and the first message, so a change in such a chat marks the person.
- `PeopleIndexService.refresh` also reads the member-id chats whose rule answers one of the slugs being built.
- `withPeople` (Unibox) asks the same SQL function instead of its own TypeScript copy.
- Migration: create the functions and mark the people those chats now name for one rebuild.

## Edge cases and risks

- Two profiles of one name on the account: unknown, as before.
- A chat whose title differs from the stored name (renamed on LinkedIn): unknown, as before.
- The person's row now shows the chat: priority (Needs me), waiting, last touch and status can change; Needs me counts can rise. Intended.
- A chat matched by My network person name only creates no new person; it only joins an existing one.
- Cost: one name-filtered query per index batch; the function does a few indexed lookups per chat.

## Verification

- Integration: a member-id chat joins the person of the one connection of that name; two of one name leave it out; the Unibox test still passes.
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.

## Outcome

- Shipped in PR #153 as its own commit: migration `20261031140000_people_from_chats_by_name` (`people_index_slug_by_name`, the new fallback in `people_index_conversation_slug`, one rebuild mark per named chat), `chatsByName` in `PeopleIndexService.refresh`, and `withPeople` asking the SQL function (its TypeScript copy is gone).
- Not run: on the local or staging database (apply with `db:migrate:deploy`; the worker's people-index job then rebuilds the marked people).
