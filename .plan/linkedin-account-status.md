# LinkedIn account status and accounts table

- Status: done
- Created: 2026-10-11
- Locked by user: yes, 2026-10-11

## Goal

Give each stored LinkedIn account a status (and the data around it) on the backend, and rebuild the `/accounts` page as a shadcn table of saved accounts with an "Add account" button on top. Extends `.plan/linkedin-credentials-storage.md`.

## Requirements

Confirmed:

- Statuses: `PENDING` (default: stored, not verified), `ACTIVE`, `NEEDS_REAUTH`, `ERROR`, `DISABLED`. Only `PENDING` and `DISABLED` are reachable now; the others are for a future verify/login worker.
- Columns on `LinkedInAccount`: `status`, `statusMessage` (short, non-secret), `statusUpdatedAt`, `lastVerifiedAt`.
- The owner can pause and resume through the API/UI (`DISABLED` <-> `PENDING`). Every other status is server-set only.
- Changing an account's secrets resets a non-disabled account to `PENDING`, because the previous verification no longer applies.
- `/accounts` shows the saved accounts as a table by default, with an "Add account" button above it that opens a dialog. Use shadcn components (Table, Badge, Dialog, AlertDialog, DropdownMenu, Button, Input, Label, Skeleton, Tooltip).
- Apply the pending `add_linkedin_account` migration and the new one to the local database (the page currently errors with "table does not exist").
- Proceed with status + table only. No LinkedIn login, cookie capture or any automation (see "Linking plan blocker").

Open questions: none.

## Linking plan blocker (recorded, not resolved here)

`.plan/linkedin-account-linking.md` is a draft that says no code until LinkedIn's written permission (B1) is confirmed, and notes a stored TOTP seed lets a service generate codes forever. This work only stores and displays metadata and does not log in to LinkedIn. The B1 decision and the TOTP-seed question stay open there.

## Scope and non-goals

- In scope: Prisma enum + columns (new additive migration), service and tRPC changes, body table page and dialogs, tests, applying the migrations locally.
- Out of scope: verifying accounts against LinkedIn, setting ACTIVE/NEEDS_REAUTH/ERROR, scheduling, per-record key rotation.

## Approach

- [ ] Schema: enum `LinkedInAccountStatus` + 4 columns, new migration (existing migration untouched).
- [ ] Service (test first): metadata select includes the new columns; `setPausedForUser`; secrets change resets to `PENDING` unless `DISABLED`.
- [ ] Resolver (test first): `setPaused` mutation under `ownerProcedure`.
- [ ] Apply migrations locally with `db:migrate:deploy`.
- [ ] Body: add shadcn `dialog` and `alert-dialog`; table page, status badge, add dialog, reveal dialog, row actions menu.
- [ ] `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.

## Edge cases and risks

- Existing rows: none yet (table was never created), and the new columns have defaults, so the migration is safe either way.
- Pause on an account that is mid-verification by a future worker: the worker must check `status` before acting; `DISABLED` must win.
- Resume only moves `DISABLED` to `PENDING`; resuming a non-disabled account is a no-op, never a status downgrade.
- `statusMessage` must never hold secrets; it is written server-side only and returned in metadata.
- Cross-user access: every status mutation is scoped by `ctx.user.id` (404 for another user's id).
- The shadcn CLI can write `from "cn"` imports and add a bogus `cn` dependency again; fix as recorded in `MEMORY.md`.
- Reveal still returns decrypted secrets only through the `reveal` mutation; the dialog clears them on close.
- Migration is additive (enum + nullable/defaulted columns); rollback is dropping the columns and the enum.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`
- `pnpm --filter @automatedLinkedIn/brain db:migrate:deploy` then load `/accounts`.

## Outcome

Shipped as planned. Backend: enum `LinkedInAccountStatus` and columns `status` (default `PENDING`), `statusMessage`, `statusUpdatedAt`, `lastVerifiedAt` via the new additive migration `20261011182500_add_linkedin_account_status`; the metadata select returns them. `LinkedInAccountService.setPausedForUser` (pause -> `DISABLED`, resume only lifts `DISABLED` back to `PENDING`) and the owner-scoped `setPaused` tRPC mutation; changing secrets resets a non-disabled account to `PENDING` and clears `lastVerifiedAt`. Both pending migrations were applied to the local database, `prisma migrate diff` reported no drift, and a new `linkedInAccount.service.integration.test.ts` (6 tests, real Postgres, cleans up its own users) passes. Frontend: shadcn `dialog` and `alert-dialog` added; `/accounts` now shows a table (Account, Status badge with message tooltip, Credentials, Last verified, Added, actions menu) with an "Add account" button on top that opens a dialog; reveal, pause/resume and remove are row actions (reveal and delete use dialogs, and revealed secrets are cleared on close). Unit tests: brain 125 passing.

Deviations: none from the locked scope. Not built, by design: any verification or LinkedIn login, so `ACTIVE`, `NEEDS_REAUTH` and `ERROR` are never set yet.

Follow-ups (also in `MEMORY.md`): decide D1/B1 in `.plan/linkedin-account-linking.md` and the stored-TOTP-seed question before building a verify worker; that worker must skip `DISABLED` accounts. The shadcn CLI again wrote `from "cn"` in generated files; fixed by hand.
