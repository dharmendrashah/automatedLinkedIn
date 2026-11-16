# Profile text cut in half stops a run: keep stored text well-formed

- Status: done
- Created: 2026-11-16
- Locked by user: yes, 2026-11-16 ("plan a fix and cover this with unit and integration tests")

## Goal

A profile with an emoji where `text()` cuts a long field no longer fails the "Get full profile" step: text kept from the data service is always valid before it is stored, so a run is not lost (and paid for) because of one character.

## Requirements

Confirmed:

- Cause (read on staging, 2026-11-16): run `01a1e267` of "Release preview 2026 · 1 Discover" failed at the `profile` block (`collect.profile`, error `UNEXPECTED`) in `prisma.personSnapshot.upsert()` with "invalid input syntax for type json". `text()` in `apps/brain/src/core/snapshotFields.ts` cuts with `.slice(0, max)`; a cut inside an emoji leaves half of a surrogate pair, which Postgres JSON refuses. A cut emoji gives exactly that message; a null character gives a different one ("unsupported Unicode escape sequence").
- Fix at the one place every snapshot text goes through (`text()`; used by `personSnapshot.ts`, `pageSnapshot.ts`, `engagementSnapshot.ts`): never cut a surrogate pair, and drop a lone surrogate or a null character the data service itself sent.
- Tests: unit tests for `text()` and `snapshotFrom`, and integration tests against Postgres for the drawer read (`DATA_READS.PROFILE.store`) and the real "Get full profile" block in a run.

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: `text()` in `snapshotFields.ts`, its unit tests, one `snapshotFrom` unit case, two integration cases, `MEMORY.md`.
- Out of scope: other places that store data-service text outside `text()` (checked: none found that go to a Json column; the engine items and `PersonSnapshotService.save` only get what `snapshotFrom` returns); changing the `UNEXPECTED` message; making one bad profile skip instead of fail the step (the root cause is gone, and a skip would hide real database errors); re-running the failed staging run (the owner resumes it after the deploy).

## Approach

- [x] Write the failing tests first (unit `snapshotFields.unit.test.ts`, one case in `personSnapshot.unit.test.ts`, integration cases in `dataReads.integration.test.ts` and `collectBlocks.integration.test.ts`) and see them fail on the current code.
- [x] Change `text()`: after the cut, remove a lone surrogate and any null character; an empty result is `null`.
- [x] Tests pass; run the root gate and the integration suite.
- [x] `MEMORY.md` entry and changelog line; open the PR when asked.

## Edge cases and risks

- Emoji exactly at the cut (cut after the pair keeps it; cut between the pair drops the first half, so the text is one unit shorter than `max`).
- A lone surrogate or null character already in the data service's text (removed, not replaced, so nothing odd shows in the drawer).
- Text that becomes empty after cleaning gives `null`, as an empty or blank text did before.
- Normal text is unchanged (same trim, same cut, same length); other callers (`pageSnapshot`, `engagementSnapshot`) only gain the cleaning.
- Already stored snapshots are untouched (a failed save stored nothing); no migration; no schema change; no env, Docker or CI change.
- Rollback: revert the commit.
- The failed staging run still has to be resumed by the owner after the deploy (its spend of $0.626 is kept on resume).

## Verification

- Unit: `snapshotFields.unit.test.ts` (cut inside and after an emoji, lone surrogates, null character, blank-after-cleaning, normal text unchanged), a `snapshotFrom` case with an emoji at the `about` cut that is valid UTF-16.
- Integration (Postgres): a drawer profile read with an emoji at the `about` cut and a lone surrogate in the headline saves and reads back valid text; a "Get full profile" run with such a row ends `SUCCEEDED` (not `FAILED`) and keeps the snapshot.
- The new tests fail on the old `text()` and pass on the new one.
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, then `pnpm test:integration:run`.

## Outcome

Shipped: `text()` drops a half surrogate pair, a lone surrogate and a null character after the cut, then trims (so a cut that ends on a space is trimmed too, a small change for every snapshot text). Tests: unit (`snapshotFields.unit.test.ts`, one `snapshotFrom` case) and integration (`DATA_READS.PROFILE` store and a Get full profile run); they failed on the old code with the staging error and pass now. No deviations. Follow-ups: the owner resumes failed run `01a1e267` after the deploy; other data-service text stored outside `text()` was not audited.
