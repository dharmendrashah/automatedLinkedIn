# GTM Phase 2: engine, data worker, guided start, canvas and the flagship flow

- Status: done
- Created: 2026-10-17
- Locked by user: yes, 2026-10-17

## Goal

Make the first workflow run for real: posts in, commenters and reactors collected, scored against an ideal customer, the qualified people saved in the workflow's output list, every cent recorded per client. Then give it the guided start, the preview run, the canvas under Advanced, and the Usage page.

Parent plan: [gtm-workflows.md](gtm-workflows.md) (Phase 2). Depends on Phase 1 (PR 52) and the data service facts in [mindcase-integration.md](mindcase-integration.md).

## Shape (owner answers, 2026-10-17)

One PR for all of Phase 2. No `apps/mindcase` app: the data client runs inside the existing brain worker (`apps/brain/src/worker`) as a `defineConsumer` plus jobs, so the key is read only by the worker entry. Raw rows live only in Postgres (`WorkflowItem`), deleted after 14 days; no bucket copy.

- **Engine and data:** block catalog and `validateGraph` in `packages/contracts`; the data client in the brain worker (pacing at 45 requests a minute, wallet floor, fake server for tests); the engine (graph state machine, items in Postgres, resume after a crash, idempotent step runs); `SpendLedger`; blocks Posts, Get commenters, Get reactors, Remove duplicates, Filter, Score, Get full profile, Add to list, Mark posts done; template 1; a Runs tab with counts, bands and cost; the vendor-name guard tests.
- **The interface:** guided start (ideal customer, goal, name and plain review), preview run, the React Flow canvas under Advanced (palette, typed connections, settings panel, estimate, run replay), the Usage page with monthly statements and statement CSV, the owner's spend-per-client view and wallet balance with the $25 warning.

## Requirements

Confirmed by the parent plan: everything listed for Phase 2 there, the hidden supplier, no caps (a required "how many" on every collect block, estimate and confirm, wallet floor $5), thresholds 60 and 40, ledger per client by UTC month, items stored in the database so a run resumes.

Answered on 2026-10-17: live testing with the real key is allowed (the owner said spend freely; I cap it at $1 because more proves nothing extra), `@xyflow/react` is added to `apps/body`, On a schedule is in this PR, and the key lives in `apps/brain/.env` as `MINDCASE_API_KEY`.

Open questions: none.

## Scope and non-goals

- In scope: the two parts above.
- Out of scope: Phase 3 blocks and triggers (Find posts, employees, jobs, domain lookup, API trigger, workflow-to-workflow), retention jobs, own network, emails, outreach, AI scoring, invoicing.

## Approach

- [x] 1. Lock this plan.
- [x] 2. `packages/contracts`: block catalog (neutral ids, config schemas, ports, "how many" rule, cost rule), `validateGraph`, estimate, preview limits, schedule maths; tests first.
- [x] 3. Brain migration `add_workflow_engine`: `Workflow`, `WorkflowRun`, `WorkflowStepRun`, `WorkflowStepCall`, `WorkflowItem`, `SpendLedger`, `DataWallet`, and on `WorkflowListMember` the `score`, `signals` and `addedByRunId` columns (additive).
- [x] 4. Brain worker data client: env (`MINDCASE_API_KEY`, `MINDCASE_RPM` default 45, `DATA_WALLET_FLOOR_USD` default 5, `DATA_WALLET_WARN_USD` default 25), client tested against a fake service, pacing, wallet floor, mappers for `post-comments`, `post-reactions`, `profiles`.
- [x] 5. Brain engine in the worker: a polling job claims ready steps, local steps (dedupe with the Seen set and suppression, filter, score with the two bands, add to list, mark posts done last), paid calls recorded before they are sent with the job id saved, ledger rows once per call.
- [x] 6. tRPC `workflow` (catalog, list, get, create from template 1, update, delete, estimate, start, runs, runDetail) and `usage` (months, statement CSV, owner wallet and spend per client); schedule job.
- [x] 7. Supplier-name guard tests (body and contracts sources; no supplier fields in run and step answers).
- [x] 8. Interface: guided start, preview run, canvas (React Flow, lazy-loaded), Runs tab with replay, Settings, Usage page, owner view.
- [x] 9. Deploy wiring: the key documented in both overlays' `secrets.example.env`; the worker already loads `app-secrets`.
- [x] 10. Verification, MEMORY.md, Outcome.

## Edge cases and risks

- Fan-out cost: 10 posts x (comments + reactions) + enrichment; the estimate uses each block's "how many" and is confirmed before every run.
- Double click, message redelivery, worker crash: a run key (workflow, trigger time), a step-run key (run, node), and the vendor job id saved as soon as it is known; a restart resumes polling, never pays twice.
- Wallet floor reached mid-run: the step ends `PARTIAL`, rows already paid for are kept and recorded in the ledger; new runs are refused for everyone (accepted risk).
- 401, 402, 422, 429, timeouts and changed shapes: as in the Mindcase plan's failure table; lenient parsing with a drift counter.
- A deleted or private post: per-input "not found", the post is still marked done with a note so it is not retried forever.
- The same person through many posts: deduped by slug in the run, merged signals, and the Seen set across runs.
- Editing a workflow during a run: the run keeps a copy of the graph it started with.
- Supplier name leaking: neutral ids in contracts, vendor fields only in `apps/mindcase` and brain worker internals, guard tests.
- Personal data: only the minimal member fields are stored; raw items are deleted with the run data after 14 days (job in Phase 3; until then, documented as an open item).
- Migrations are additive; rollback is stopping the worker and disabling workflows.
- Staging: the data worker idles; it must not count as activity for idle shutdown.

## Verification

- Unit: catalog schemas ("how many" never 0 or missing), `validateGraph`, estimate, score bands, engine state machine (resume, partial, duplicate trigger), client against the fake server, guard tests.
- Integration: engine and ledger against Postgres; the queue path against local RabbitMQ.
- Opt-in live smoke test (about $0.05) once the key is in place.
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, clean; Docker build of `apps/mindcase`.
- Real path: run template 1 on a real public post and read the run page, the list and the ledger.

## Outcome

- Shipped as planned in one PR: the catalog and graph rules in `packages/contracts`, the data client and engine in the brain worker (jobs `workflow-engine` every 5 s, `workflow-schedule` every minute, `data-wallet` every 10 minutes), routers `workflow` and `usage`, pages `/workflows`, `/workflows/new`, `/workflows/:id` and `/usage`, and the reason and score on list rows.
- Deviations: (1) the engine is a polling job that claims steps in the database, not an outbox plus a result queue; it is simpler, survives restarts, and is safe in two replicas. (2) The browser gets the catalog, validation and estimate from brain over tRPC instead of importing `packages/contracts`. (3) The Score block has one output: each person carries a band (qualified or maybe) and only qualified people get a full profile. (4) Profiles and Companies inputs are left out: the Seen set already skips anyone in `/profiles`, and no Phase 2 block reads companies; they come with Phase 3 blocks. (5) Money is stored as whole millionths of a dollar.
- Verified: lint, ts:check, unit tests, build, brain integration tests (engine with a fake data service: preview writes nothing, a full run books the cost once and marks the post last), two opt-in live runs (`engine.live.test.ts`, $0.028 each, charge equals ledger), the compiled worker starting a scheduled run on its own and finishing it ($0.016), and the compiled API refusing the new procedures without a token. About $0.10 of the wallet was spent in total.
- Not run: the pages in a browser behind sign-in; e2e tests.
- Follow-ups: the wallet holds about $4.70, below the $5 floor, so new runs are refused until it is topped up (or the floor lowered); add `MINDCASE_API_KEY` to the `STAGING_SECRETS_ENV` GitHub secret; the 14-day item retention job (Phase 3); the daily reconcile needs a usage endpoint that accepts the key.
