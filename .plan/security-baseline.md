# Security baseline: deny-by-default API and secret handling

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-10-11
- Locked by user: yes (requested 2026-10-11: "write code and design")

## Goal

Every API procedure rejects unauthenticated callers, enforced by a test that a new procedure cannot bypass.
Design the secret-storage rules that any future feature holding third-party credentials must follow. Lesson from
moaljumaa/linki issue #4, where unauthenticated routes exposed stored session cookies.

## Scope

- In scope now: router-level deny-by-default test (done in this change), and the storage rules below as a design.
- Out of scope: any LinkedIn login, credential or cookie automation. That is blocked until LinkedIn's written permission
  is provided (see `.plan/linkedin-account-linking.md`, blocker B1).

## Audit (2026-10-11, read-only)

- brain: two procedures, `me` and `getRole`. Both use `userProcedure`, which rejects missing or invalid tokens with
  UNAUTHORIZED. The Express routes are `/health` (public by design, no secrets) and the static web fallback.
- body: static nginx, no API.
- Gap found: the per-procedure tests did not stop a new procedure from being added without a guard.
  Fixed by `router.unit.test.ts`, which calls every procedure on `appRouter` without a token and fails on any success.
  Verified by temporarily adding an unguarded procedure: the test failed, then the router was restored.

## Storage rules for any future secret (design, applies to every feature)

1. Never store a third-party password. Store only what the feature needs, and prefer tokens issued through an
   approved OAuth flow.
2. Encrypt at rest with envelope encryption: a per-record data key, wrapped by a key-encryption key in a managed KMS.
   Each record stores its key version so keys can rotate without re-encrypting everything at once.
3. Fail closed. Data that is not in the encrypted format is rejected, not passed through.
4. Secrets never appear in logs, errors, API responses or client bundles. Tests check this for each new secret type.
5. Deleting the link deletes the secret. Test this path.
6. Access to secrets is limited to the one service that needs them, and each access is audited.

## Verification

- `pnpm --filter @automatedLinkedIn/brain test:unit:run` includes the router-level deny-by-default test (84 of 84 pass).
- A temporary unguarded procedure makes the test fail (verified).

## Outcome

Router-level test added and verified. Storage rules recorded as design; no secret-holding feature exists yet.
