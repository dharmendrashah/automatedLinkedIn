# TOTP secret input formats

- Status: done
- Created: 2026-10-11
- Locked by user: yes, 2026-10-11 (request settles scope)

## Goal

Accept the TOTP secret however the user pastes it and store one canonical value: the base32 secret.

## Requirements

Confirmed:

- Accept an `otpauth://totp/...?secret=...&issuer=...` URI (take the `secret` parameter) or a bare base32 string.
- Normalize before storing: trim, drop spaces and dashes, drop `=` padding, uppercase.
- Reject with a clear message (HTTP `BAD_REQUEST`): not base32, shorter than 16 characters, `otpauth://hotp`, a URI with no `secret`.
- Applies to `create` and `update` in `linkedInAccount`; `null` still clears.
- Parsing runs on the server so every client gets the same behaviour; the form only gets a hint.

Open questions: none.

## Scope and non-goals

- In scope: pure parser in `apps/brain/src/core/totp.ts` (tests first), zod transform in the resolver, form hint in `apps/body`.
- Out of scope: generating codes, QR image decoding, keeping `algorithm`/`digits`/`period` from the URI (LinkedIn uses SHA1, 6 digits, 30 s).

## Edge cases and risks

- A URI with a non-default `algorithm`, `digits` or `period` is stored as its secret only, so a future code generator would assume the defaults. Revisit if a provider other than LinkedIn is added.
- The secret must never appear in error messages or logs: errors state the rule, never echo the input.
- Lower-case and spaced input (as shown by some apps, e.g. `abcd efgh ...`) must normalize, not fail.
- Existing stored secrets are unchanged; stored values were never validated before and are not migrated.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`

## Outcome

Shipped: `parseTotpSecret` in `src/core/totp.ts`, applied in the resolver for `create` and `update`, with a hint under the TOTP field. Not in scope and not done: preserving non-default algorithm, digits or period.
