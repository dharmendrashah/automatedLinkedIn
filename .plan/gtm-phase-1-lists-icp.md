# GTM Phase 1: lists and ICP (no automation)

- Status: done
- Created: 2026-10-17
- Locked by user: yes, 2026-10-17

## Goal

Give the user lists of people (Qualified and Maybe tabs, with a work status) and saved ideal customers (ICP) with a score preview, with no data supplier and no automation. Lists are the sink that Phase 2 workflows write into, so they must work on their own first.

Parent plan: [gtm-workflows.md](gtm-workflows.md) (Phase 1).

## Requirements

Confirmed (parent plan and the owner's answers of 2026-10-17):

- `WorkflowList` (named, per owner) and `WorkflowListMember` (unique per `(listId, slug)`, `state` `QUALIFIED` or `MAYBE`, `status` `NEW`, `IN_REVIEW`, `DONE`, `NOT_A_FIT`, optional `postUrl` as the reason link).
- `/lists` is a work queue: pick a list, Qualified and Maybe tabs, filter by status, each row shows the person, the reason (post link or "Added by hand"), the date found and the status.
- Manual add: a profile link, with an optional name, headline and location.
- Move a person to another list in one atomic write.
- List CSV export.
- "Do not contact" on a row: the person's slug goes on the owner's suppression list and is removed from all the owner's lists in one transaction; a suppressed person cannot be added again.
- Seen set: a person already in any of the owner's lists or in `/profiles` is not added again (the add reports where they are). A person is in at most one of the owner's lists.
- Deletes are hard (a list with its members, a member, an ICP).
- `Icp` per owner on `/icps`, with a score preview on sample lines of headline and location. Rules-only scoring with the parent plan's default weights.
- Retention jobs move to Phase 3 (Maybe members only exist from Phase 2).
- Additive migration; data access in `apps/brain/src/database`; full-width pages; no supplier name anywhere.

Open questions: none.

## Scope and non-goals

- In scope: the tables, two database services, two tRPC routers, the pure ICP score function, CSV builder, the `/lists` and `/icps` pages with sidebar entries, tests.
- Out of scope: engine, workflows, canvas, data worker, ledger, schedules, retention jobs, editable weights (fixed defaults in v1), a page to manage the suppression list, "copy to target profiles", bulk paste into a list.

## Design

- Schema: enums `WorkflowListMemberState`, `WorkflowListMemberStatus`; models `WorkflowList` (`userId`, `name`, unique `(userId, name)`), `WorkflowListMember` (`listId`, `slug`, `url`, `name?`, `headline?`, `location?`, `state`, `status`, `postUrl?`, `createdAt`, `updatedAt`), `Suppression` (`userId`, `slug`, unique), `Icp` (`userId`, `name`, string arrays `includeTitles`, `excludeTitles`, `seniorities`, `industries`, `companySizes`, `locations`, `problemKeywords`). `signals`, `score`, `addedByRunId` and `expiresAt` come with Phase 2 and 3 (additive).
- Score: pure `scoreIcp(icp, sample)` in brain `core`. Title +30, seniority +20, location +5, an exclude title disqualifies. Industry, company size and engagement cannot be read from a headline, so the preview lists them as "checked when a workflow runs" and shows the most a sample can reach.
- Move is an update of `listId` (the Seen set keeps a person in one list, so the unique index cannot clash; if it does, the answer is a conflict).
- CSV: built in brain, cells that start with `=`, `+`, `-`, `@` are prefixed with `'` (CSV injection).

## Approach

- [x] 1. Lock the parent plan and this plan.
- [x] 2. Schema and additive migration `add_workflow_lists_and_icp`.
- [x] 3. `core`: `scoreIcp` and `toCsv`, unit tests first.
- [x] 4. `WorkflowListService`, `IcpService`, integration tests.
- [x] 5. tRPC `workflowList` and `icp`, unit tests.
- [x] 6. Body: `/lists`, `/icps`, sidebar entries.
- [x] 7. Verification, MEMORY.md, Outcome.

## Edge cases and risks

- A link that is not a profile link is rejected with a plain message; slugs are lowercased.
- Adding a person who is in a list, in `/profiles` or suppressed is refused with where they are; the unique index is the last guard against a race.
- Move to the same list is a no-op; a foreign list id answers not found.
- Every query is scoped to the owner; a foreign id is answered like a missing one.
- Duplicate list or ICP names answer a conflict, not a 500.
- An ICP with no rules scores 0 with the reason shown; empty sample lines are ignored; the preview takes at most 50 lines.
- CSV export is capped (10,000 rows) and escapes formula cells.
- Rollback: revert the code; the new tables stay empty. No reset.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root, clean.
- Brain integration tests against local Postgres for the two services.
- Real path: the compiled brain answers the new procedures (401 without a token).

## Outcome

- Shipped as designed: migration `add_workflow_lists_and_icp` (applied to the local `automatedlinkedin` and `postgres` databases), `WorkflowListService`, `IcpService`, `core/icpScore.ts`, `core/csv.ts`, routers `workflowList` and `icp`, pages `/lists` and `/icps` with sidebar entries. `ListToolbar` gained `archivable={false}` for hard-delete lists.
- Deviations: the score function lives in brain `core` (not `packages/contracts`), because only brain uses it and body gets results through tRPC. The parent plan's "a person can be in several lists" became "at most one list per owner" to honour the Seen set. Unrelated fix: the root Vitest config uses native `resolve.tsconfigPaths` and the `vite-tsconfig-paths` plugin was removed (it printed a warning on every run).
- Verified: `pnpm lint`, `ts:check`, `test:unit:run`, `build`, all brain integration tests (local Postgres), and the compiled brain answering `workflowList.lists`, `icp.list` and `workflowList.addMember` with 401 without a token. Not run: the pages in a browser behind sign-in; e2e tests.
- Follow-ups: a page to view and lift suppressions (none in v1); editable weights; Phase 3 retention jobs. Apply the migration with `db:migrate:deploy` before deploying.
