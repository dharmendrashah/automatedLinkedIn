# Edit stored credentials any time

- Status: done
- Created: 2026-10-11
- Locked by user: yes, 2026-10-11 (request settles scope)

## Goal

The owner can change the credentials of a saved LinkedIn account whenever they want: replace or remove the password, the two-step key, the browser sign-in token, or any combination, and change the email. Extends `.plan/beginner-friendly-credentials-form.md`.

## Requirements

Confirmed:

- New row action "Edit credentials" opens an edit dialog.
- Saved secrets are never shown in the dialog. Each secret shows as saved; a blank field means keep it, typing replaces it, and "Remove" clears it (with Undo before saving).
- Removing the password also removes the two-step key, because the key only works with a password.
- Same rule as when adding: after the change there must still be a password or a browser sign-in token, and a two-step key needs a password. The dialog shows what is missing; the server enforces it too (already done in `LinkedInAccountService`).
- Any secret change resets a non-paused account to `PENDING` (already done in the service); the dialog says so.
- Email can be changed; a clash with another stored account of the same user shows the server message.
- Backend needs no new endpoint: `linkedInAccount.update` already supports email and per-secret replace/clear.
- The add dialog and the edit dialog share one credentials form (no duplicated markup).

Open questions: none.

## Scope and non-goals

- In scope: shared credentials form, pure rule/patch helpers with tests, edit dialog, row action, refactor of the add dialog onto the shared form.
- Out of scope: showing existing secrets inside the edit dialog (use Reveal), verifying credentials against LinkedIn.

## Approach

- [x] Tests first for the rule and patch helpers (`credential-rules`).
- [x] Shared `CredentialsFields`; rebuild the add dialog on it.
- [x] Edit dialog; wire "Edit credentials" in the table and page.
- [x] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.

## Edge cases and risks

- Sending an empty string would be rejected by the API, so blank maps to "unchanged" (`undefined`), never to "clear". Clearing is only ever an explicit Remove (`null`).
- Removing the only method is blocked client-side with a reason and server-side as a backstop.
- Re-saving without changes is blocked ("No changes yet") so the status is not reset for nothing.
- Pasted secrets stay in component state only; closing the dialog discards them.
- A paused account stays paused after an edit (server rule).
- The list refreshes after save so the badges and status match.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`
- Manual: edit only the password; only the cookie; remove the cookie while a password exists; remove the password while a cookie exists (the key goes too); try to remove the last method.

## Outcome

Shipped. New row action "Edit credentials" opens `EditAccountDialog`. Saved secrets stay hidden: blank keeps, typing replaces, Remove clears (with Undo), and removing the password also removes the two-step key. The dialog shows what is missing (same rule as adding, plus "No changes yet.") and the server still enforces it. The add and edit dialogs now share `CredentialsFields` and `EmailField`; the pure helpers in `credential-rules.ts` (effective flags, missing-reason, patch builder, change detection) have 16 unit tests. No backend change was needed: `linkedInAccount.update` already handled email and per-secret replace/clear, and resets a non-paused account to `PENDING`. Verification: lint, ts:check, unit tests (brain 169, body 37) and build pass. Not opened in a browser by me.

Follow-up: none required.
