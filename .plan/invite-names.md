# Invite names and notes when a person has no name yet

- Status: done
- Created: 2026-10-31
- Locked by user: yes (2026-10-31, "A + B + D")

## Goal

An invite to someone My network has no name for yet (a freshly imported list member) stores the profile address as its name and fills `{first_name}` with nothing. Fix it where it is cheap and safe.

## Requirements

- **A.** The note is kept as the owner wrote it and filled in when the invite goes, from the person's current name and company; the invite's name is refreshed then too. What was sent is saved on the invite.
- **B.** When My network gets a name for someone, their invites still named by address take it. A migration renames existing ones. The index never takes an address-named invite as the person's name.
- **D.** The invite dialog says how many people have no name yet when the note uses `{first_name}`, with "Read their profiles" (queues one read each). Invite stays allowed.

## Design

- `LinkedInInviteService.invite` stores `note` as written (trimmed). `dispatch` reads the people of the due invites (client, slug), sends `name = person.name ?? invite.name` and `fillNote(note, person)`, and saves both on the rows in `onStart`.
- `PeopleIndexService.write`: after the upsert, `linkedInInvite.updateMany({ clientId, slug, name: slug } → name)`. The index maps an invite named by its slug to `name: null`.
- Migration: `UPDATE "LinkedInInvite" … FROM "Person"` where the invite's name is its slug and the person has a name.
- `plan` returns `unnamed` (people to invite with no name). New `people.readProfiles({ clientId, personIds })` queues `PersonService.readFull` for the unnamed ones; a read that cannot start is counted.

## Edge cases and risks

- Queued invites made before this have a filled note: filling again changes nothing (no fields left).
- A note template longer once filled is cut to LinkedIn's limit at send time (as before).
- The person may be gone from the client at send time: the invite keeps its stored name.
- Do not contact: `readFull` refuses; counted as not read.
- History shows a queued invite's note with `{first_name}` until it goes (it is filled when sent).
- Rollback: the migration only renames address-named invites.

## Verification

- Unit: the index ignores an address-named invite's name.
- Integration: a queued invite whose person got a name sends the name and the filled note; renaming on refresh; `unnamed` in the plan.
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.

## Outcome

- Shipped as designed (branch `fix/invite-names`): `withNames` in `LinkedInInviteService.dispatchNext`, the rename in `PeopleIndexService.write`, migration `20261031130000_invite_names_from_people` (also marks people named by their address for a rebuild), `plan.unnamed`, `people.readUnnamed` and the dialog notice.
- Not run: the dialog in a browser; a live send on staging.
