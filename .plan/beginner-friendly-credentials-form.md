# Beginner-friendly add-credentials flow (password + TOTP, or li_at cookie)

- Status: done
- Created: 2026-10-11
- Locked by user: yes, 2026-10-11

## Goal

Anyone, with no technical background, can add a LinkedIn login without help. The form says clearly that there are two ways to sign in, that one is enough and both are allowed, explains in plain words how to get each value, and accepts whatever the user pastes (a full cookie dump, a single cookie value, an otpauth link, a bare key). Extends `.plan/linkedin-credentials-storage.md` and `.plan/totp-secret-parsing.md`.

## Requirements

Confirmed (including the user's answers):

- Rule: email is required, plus **at least one** method. Method 1 = password (two-step key optional). Method 2 = browser cookie containing `li_at`. Both together are allowed.
- A two-step (TOTP) key without a password is rejected (a TOTP key is only a second step after a password).
- Cookie field accepts: the bare `li_at` value; a `Cookie:` header string; a `Set-Cookie` line; a JSON export (Cookie-Editor / EditThisCookie array, or Playwright `{ cookies: [...] }`); a Netscape `cookies.txt` (including `#HttpOnly_` lines); rows copied from the browser DevTools cookie table (tab separated).
- The pasted text must contain a usable `li_at`, but the **whole pasted text is stored** (trimmed), not only `li_at`. A bare value is stored as is.
- Validation is **server only**. No shared package and no live recognition: the form shows plain-language errors after Save.
- Plain-language wording on the main path ("Two-step verification key", "Browser sign-in token (li_at)").
- Built-in text help (no screenshots yet) with per-browser steps (Chrome/Edge, Firefox, Safari), collapsed by default.
- The Save button is disabled with a visible reason until the rule is met.
- Server errors that come from input validation are shown as readable sentences, not raw JSON.

Open questions: none.

## Design

Form, top to bottom:

1. "Which LinkedIn account?" Email field, hint "The email you sign in to LinkedIn with."
2. Banner: "Choose how we sign in for you. One is enough, and you can add both." with a "Filled in" checklist for the two methods (based on what is typed, not on validity).
3. Method card A, "Email and password": password, and "Two-step verification key (optional)". Help accordion "Where do I find my two-step key?". A warning appears if the key is filled but the password is empty.
4. Divider labelled "and / or".
5. Method card B, "Browser sign-in token": one large paste box (textarea). Help accordion "How do I get this?" with per-browser steps and the shortcut "select all rows in the Cookies table, copy, paste here, we find the right one".
6. Footer: Cancel and Save account. When disabled, a line above says what is missing.

Server (brain):

- `extractLiAt` in `src/core/liAt.ts` returns the `li_at` value from any supported format, or throws a plain-language error that never echoes the input.
- Resolver: `session` input accepts up to 64 KB, is validated with `extractLiAt`, and the trimmed pasted text is what is stored.
- Credential rule in `LinkedInAccountService` (single place): `password || session` required; `totpSecret` requires `password`. Applies to `create` and to the merged result of `update`. Violation throws `LinkedInCredentialsError`, mapped to `BAD_REQUEST`.

`li_at` extraction order: JSON, then tab-separated rows (a cell equal to `li_at`, value in the next cell), then `name=value` pairs, then a single bare token. Match the exact name `li_at` (not `li_a`, `li_rm`, `xli_at`). Strip surrounding quotes and whitespace. First match wins. Value must be 20 to 2048 characters from `[A-Za-z0-9_\-+/=%.~:]`.

## Scope and non-goals

- In scope: `extractLiAt` + tests, credential rule in the service, resolver changes, readable error helper in body, redesigned add dialog, shadcn `accordion`, `alert` and `textarea`, reveal dialog handles a long dump.
- Out of scope: any call to LinkedIn to check that `li_at` still works, screenshots, live recognition, a shared parser package, an edit dialog for existing accounts (the rule applies on update through the API).

## Approach

- [x] Resolve questions and lock.
- [x] Tests first for `extractLiAt` (every format, bad cases, no echo), then implement.
- [x] Tests first for the credential rule (service) and resolver mapping, then implement.
- [x] shadcn `accordion`, `alert`, `textarea`; fix the generated `cn` import after each add.
- [x] Readable tRPC error helper; rebuild the add dialog; adjust the reveal dialog.
- [x] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, plus a real-database integration run.

## Edge cases and risks

- Storing the whole dump keeps more sensitive data than `li_at` alone (for example `JSESSIONID`, other LinkedIn cookies). This was the user's choice; the encryption and `reveal` rules are unchanged. Reconsider if the dump is not needed later.
- A huge or hostile paste: bounded at 64 KB, linear parsing (no catastrophic regex), JSON parse errors caught.
- A dump with several `li_at` entries: the first wins.
- A value pasted with `li_at=` in front, in quotes, with Windows line endings or a trailing `;`.
- The wrong cookie pasted bare (for example `JSESSIONID="ajax:..."`): rejected because it is not a plain token; help text says the value usually starts with `AQ`. A syntactically valid but expired `li_at` passes (no network check).
- Secrets in logs and errors: never log the paste; errors state the rule only.
- Changing the rule rejects TOTP alone, which earlier tests allowed; those tests are updated. Existing stored rows are untouched.
- Update merges patches then validates the merged result, so clearing the password while a TOTP key remains is rejected.
- The `reveal` view can show a long dump; the dialog must scroll rather than overflow.
- Accessibility: every field has a visible label and a described hint; checks are not colour only.
- Rollback: UI and parser changes revert cleanly; no schema change.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`
- Brain integration test (real Postgres) still passes with the new rule.
- Manual: add (a) email + password, (b) cookie only (bare value), (c) cookie only (DevTools rows), (d) password + otpauth link + cookie JSON; confirm the error text for a bad paste and the disabled-Save reason.

## Outcome

Shipped as locked. Brain: `extractLiAt` (all listed formats, 17 test cases), the credential rule in `LinkedInAccountService` (create and merged update), `LinkedInCredentialsError` mapped to `BAD_REQUEST`, and resolver validation that accepts up to 64 KB of cookie text, requires a usable `li_at`, and stores the whole trimmed paste. Body: shadcn `accordion`, `alert`, `textarea`; the add dialog is now email, then Option A (password, optional two-step key) and Option B (browser sign-in token) separated by "and / or", each with a "Filled in" badge and a collapsed per-browser help; Save shows the missing piece in plain words; server validation errors are shown as sentences through `readableError`; the reveal dialog scrolls long dumps and the table badges use plain labels. Verification: lint, ts:check, unit tests (brain 169, body 21) and build pass; the real-Postgres integration test passes.

Not done: no live recognition and no network check that `li_at` is alive (both out of scope), no screenshots, and the dialog was not opened in a browser by me. Follow-ups: an edit dialog for existing accounts (the rule already applies on update through the API); decide later whether storing the whole dump is needed, since it keeps more sensitive cookies than `li_at` alone.
