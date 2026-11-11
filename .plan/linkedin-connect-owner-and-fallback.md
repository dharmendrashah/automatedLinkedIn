# LinkedIn Connect: match the person by full name, and fall back to the button

- Status: locked
- Created: 2026-11-11
- Locked by user: yes, 2026-11-11

## Goal

The Connect button can now be a `<button aria-label="Invite <Name> to connect">`. Matching it by a first-name substring can pick a
suggested person's Connect and send to the wrong person. Match the profile owner by full name instead, and use the button as the
fallback when the preload/custom-invite link cannot be pressed.

## Requirements

Confirmed:

- A button counts as the profile owner's only when its aria-label is exactly "Invite <full name> to connect" (case and spacing
  ignored). The member id comes only from that button.
- The preload/custom-invite link is tried first. The button is the fallback when the link cannot be pressed.
- The pending check uses the full name too, not the first name.
- The selector is shared: `inviteReader.ts` imports `CONNECT_LINK` instead of repeating it.

Open questions: none.

## Scope and non-goals

- In scope: `apps/spider/src/linkedin/inviteReader.ts`, its unit tests, the import of `CONNECT_LINK`.
- Out of scope: a retry when the preload link presses but opens no dialog; changes to the dialog flow in `tasks/linkedinInvite/run.ts`.

## Approach

- [x] Write failing unit tests for the suggested-name case, the full-name match, the link-before-button order, and the pending check.
- [x] Match buttons by full name; take the member id from the owned button only.
- [x] Order connects so links come before buttons (the press order).
- [x] Import `CONNECT_LINK` from `markup.ts`.
- [x] Run lint, ts:check, unit tests and build.

Verification note: the first run of the new tests failed because the full-name label was built with capitals while the page label is compared lowercased. Fixed in `parseProfileActions`.

## Edge cases and risks

- A person whose LinkedIn name differs from `invite.name` (middle name, emoji, title) gets no owned button, so the result is `NO_CONNECT`. This fails safe: no invite is sent to the wrong person.
- Two people with the exact same name: both buttons match. The first in the page is taken, as before. Not solved here.
- A preload link that is pressable but opens no dialog is not retried with the button. Only a link that cannot be pressed falls back.
- The pending check now needs the full name in the label. If LinkedIn's pending label does not contain the name, a pending profile is not detected, but it also has no Connect button, so nothing is sent.
- Dev vs production, Docker, CI, data, migrations: no impact.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`
- Staging: a real run of the button path is still needed.

## Outcome

- Shipped: buttons match the profile owner by exact full name (no first-name match); member id only from the owned button; links are pressed before buttons; the pending check uses the full name.
- Tests: `inviteReader.unit.test.ts` 13 passed (2 new cases). Spider unit suite 103 files, 1425 tests passed. Lint, ts:check, unit tests and build all passed from the repo root.
- Not verified: a real staging run of the button path.
- Deviations: none.
- Follow-ups: decide whether a link that presses but opens no dialog should retry with the button; same-name people are not resolved.
