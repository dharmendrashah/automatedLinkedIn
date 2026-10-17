# GTM Phase 3: more blocks, API and chained triggers, retention

- Status: done
- Created: 2026-10-17
- Locked by user: yes, 2026-10-17

## Goal

Widen what a workflow can find (posts by keyword, people at target companies, hiring signals, lookalikes of a good customer), let workflows be started by an outside system or by another workflow, and delete personal data on time. Templates 2 to 5 of the parent plan become usable from the guided start.

Parent plan: [gtm-workflows.md](gtm-workflows.md) (Phase 3). Builds on Phase 2 (PR 53): catalog in `packages/contracts/src/workflow.ts`, engine and data client in the brain worker.

## Scope

New blocks (catalog, executor, estimate, settings form, guard test):

| Block | Ports | Data service call | Price | Main settings |
| --- | --- | --- | --- | --- |
| Profiles (input) | start → people | none (your `/profiles`) | free | how many |
| Companies (input) | start → companies | none (your `/companies`) | free | how many |
| Find posts | start → posts | `posts` by keywords | $0.002 a post | keywords, last N days, how many |
| Posts of a person or company | people or companies → posts | `posts` by URL | $0.002 a post | how many per profile |
| What this person engages with | people → posts | `profile-comments`, `profile-reactions` | $0.002 a row | how many per person |
| Find people at a company | companies → people | `company-employees` | about $0.008 a person | titles, seniority, how many per company |
| Find open jobs | companies → companies (tagged hiring) | `jobs` | $0.001 a job | job titles, how many |
| Find a company from its website | start → companies | `domain-lookup` | $0.004 a result | domains, how many |
| Combine | many → one, same kind | none | free | none |
| Keep top N | people → people | none | free | N (by score) |
| Tag | people → people | none | free | tag words |

New triggers: When called by API (per-workflow address and secret token), When another workflow finishes (receives its output; loops refused on save, depth limit 5).

Retention jobs (brain worker): run items after 14 days; runs after 90 days; Maybe members after 30 days unless promoted; members untouched for 180 days marked for review.

Guided start: goal cards 2 to 5 become active, each building its template.

Out of scope: own network (Phase 4), emails, outreach, AI scoring, profile search by filters, "all employees" dumps.

## Requirements

Confirmed by the parent plan: the block list, the two triggers, the token shown once and stored hashed and rotatable, the cycle check, the retention numbers, no caps but a required "how many", the hidden supplier.

Answered by the owner on 2026-10-17: one PR; people from the Profiles input pass the Seen set (scored and added to lists); 25 people per company by default; tags on list members; members untouched for 180 days are marked for review and deleted 30 days later unless kept; ledger rows kept 13 months; API trigger limits 200 items a call, 60 calls an hour per workflow, idempotency key kept 24 hours; live tests up to about $0.50.

Open questions: none.

## Approach

- [x] 1. Lock this plan.
- [x] 2. Contracts: new blocks, `company` item kind, Combine with several inputs, cycle check across workflows; tests first.
- [x] 3. Additive migration: workflow API token hash and `listensTo` ids, member `tags` and `reviewAt`, idempotency keys.
- [x] 4. Data client mappers for the new calls; engine executors for every new block.
- [x] 5. Triggers: Express route for the API call (token in a header, hashed compare, size and rate limits, idempotency); chained start when a run finishes.
- [x] 6. Retention jobs.
- [x] 7. Body: palette and settings for the new blocks, token screen (shown once, rotate), "Needs review" and tags on `/lists`, guided start templates 2 to 5.
- [x] 8. Verification, MEMORY.md, Outcome.

## Edge cases and risks

- Fan-out multiplies faster with company and engagement blocks (companies x people x posts); the estimate must use every "how many" and be confirmed before a run.
- A chain of workflows can spend without a person pressing Run: the cycle check, the depth limit and the wallet floor are the guards.
- The API address is an open door: long random token, hashed, rotatable, rate and size limited, owner-scoped, body validated by the input block's schema, idempotency key.
- Retention deletes personal data: jobs must be idempotent, log counts only, never delete suppression rows.
- Company employee lists are bulk personal data: only allow-listed fields are kept, as for profiles.
- Migrations are additive; rollback is stopping the worker.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests (new executors with a fake data service, retention, API trigger, chain cycle).
- Opt-in live tests for each new data call, within the agreed budget.
- Real path: the compiled worker runs templates 2 to 5; the API route answers with a run id for a valid token and 401 for a bad one.

## Outcome

- Shipped: every block in the table except Combine, the API and "after another workflow" triggers, the retention job, goals 2 to 5 on the guided start, the API tab (token shown once, rotate), tags, "Needs review" and Keep on `/lists`. Migration `20261017150445_add_workflow_triggers_and_review` (additive).
- Deviations: no Combine block, since every block already merges several inputs of the same kind. No `listensTo` column: the listened-to workflow is read from the `trigger.workflow` block. Idempotency uses the run key, not a new table. People handed over by another workflow are "known" (stopped only by suppression), otherwise a chained workflow could never add anyone. Run inputs are cleared after 14 days, like run items.
- Verified: lint, ts:check, unit tests, build, brain integration tests (API start and idempotency, chain start, cycle refusal, retention mark and delete), the live data calls (`DATA_LIVE_TEST=1`, about $0.17 spent), and the running brain answering the API route with 401 for a missing or wrong token.
- Not verified: the pages in a browser behind sign-in; a full live run of templates 2 to 5 through the worker (the wallet is under the $5 floor).
