# Mindcase: LinkedIn data from an outside API, in its own project

- Status: draft
- Created: 2026-10-14
- Locked by user: no

This plan is about how to use the Mindcase web data API for LinkedIn data. It also says what the scalable worker service and cron service must give it, because the owner wants those built first. No code is written until the owner answers the open questions and locks it.

## Goal

Fill the target profiles and target companies with real data instead of typing it, and help find the right people at a target company, by calling Mindcase's LinkedIn APIs from a separate project (a worker, like the spider worker). Keep the cost, the personal data kept, and the failure modes under control from day one.

## What Mindcase is (read from https://mindcase.co/skills.md and the public schema endpoints, 2026-10-14)

- A pay-per-row web data API. One prepaid wallet per key owner. Base `https://api.mindcase.co`, current routes `/v1/data/{group}/{slug}/...` (the older `/api/v1/agents/...` prefix also works, not verified here). Auth: `Authorization: Bearer mk_live_...`. 401 bad key, 402 no balance, 422 unknown parameter, 429 over 60 requests a minute per key (retry after 60 s).
- Run flow: `POST .../run` returns a `job_id` (`queued`, `running`, then one of `completed`, `failed`, `cancelled`, `rejected_balance`, all final). Rows come from `GET /v1/jobs/{id}/results` (or `/download` as CSV or JSON). `?wait=true` holds the request up to 60 s and returns the first 100 rows inline. `DELETE /v1/jobs/{id}` cancels. `GET /v1/balance` and `GET /v1/usage/daily` exist. If the wallet runs out mid-run, the rows collected so far still come back with a `notice`.
- The schema of each API is public, with no key: `GET /v1/data/linkedin/<slug>` returns the parameters (types, limits, options), `price_per_record`, the output fields (`apiField` names the key of each row), `require_one_of`, and any `page_fee`. Checked live for `linkedin/profiles` and `linkedin/company-employees`. The group list `GET /v1/data/linkedin` needs the key (401 without it).
- Sending a parameter an API does not list gives 422. `maxResults` of 0, or a blank limit, means all rows: that is the cost trap to design around.
- Not stated in the file, to verify with a real key: whether a job result tells what it charged, whether a profile that does not exist is charged, and whether `POST /run` accepts any idempotency key (nothing says so).

### The LinkedIn APIs and what they cost (prices from the catalog; page fees from the live schema)

| API | Price | Notes |
| --- | --- | --- |
| `linkedin/profiles` | $0.004 per profile | By profile URL, or search by filters. Search adds $0.10 per search page of 25 profiles, so about $0.20 for the first 25. Up to 2,500 per search. |
| `linkedin/companies` | $0.004 per company | By company URL, or search by location, size, industry. Up to 1,000. |
| `linkedin/company-employees` | $0.004 per profile | Full profile of each employee, with filters (title, seniority, location, function, tenure). Page fee $0.10 per 25, so about $0.008 per person all in. |
| `linkedin/domain-lookup` | $0.004 per result | Website domain to company page URL. |
| `linkedin/jobs` | $0.001 per job | Open roles, with a company profile. A hiring signal. |
| `linkedin/posts` | $0.002 per post | Posts of a profile or company, or by search. |
| `linkedin/post-comments`, `post-reactions`, `profile-comments`, `profile-reactions` | $0.002 per row | Who engaged with a post, or what a person engages with. |
| `linkedin/ads-library` | $0.002 per ad | Not useful for this product. |
| `linkedin/emails` | $0.02 per email | Work email from a profile URL. Held back, see compliance. |

Photo links in profile results expire after about 3 weeks, so they are not stored.

## Requirements

Confirmed (owner's request, 2026-10-14):

- C1 Use only the Mindcase APIs that relate to LinkedIn: profile scraping, profile searching, company, company employees, and the like.
- C2 Use them well: this plan decides the uses, the order, the cost control and the failure handling.
- C3 It is a separate project, not a feature inside brain.
- C4 Before it, a scalable cron service and a scalable worker service (like the spider worker) are needed.

Proposed, not yet confirmed (see open questions):

- P1 `apps/mindcase` is a worker like `apps/spider/src/worker.ts`: brain publishes a command on RabbitMQ, the worker calls Mindcase, stores the raw result in the private bucket, publishes a result, brain applies it. No inbound HTTP API except a tiny health port.
- P2 The Mindcase key lives only in the worker (a secret, never in brain, body or logs). Brain and the browser never talk to Mindcase.
- P3 A closed list of operations, each one Mindcase API in one mode with its own input schema, row cap and price rule. Anything not on the list is refused. No generic "run any API" passthrough.
- P4 Money is a hard limit, not a hope: every run has an estimate shown before it starts, a cap on rows and dollars, a per-user monthly budget, and a global low-balance stop.
- P5 Keep as little personal data as the feature needs: a short allow-list of fields, not the full profile; raw results for 14 days; erasure on request.

## Good uses, in order (the "think good use of it" part)

1. **Enrich what the user already added (by URL).** Pasted profile and company links become real cards: name, headline, current role and company, location, industry, size, website. About $0.004 each, input the user chose, output limited to their own list. Highest value, lowest risk. This is Phase 1.
2. **Company from a website.** Domain lookup in the Add companies box: paste `stripe.com`, get the company link, then enrich. Cheap and needs no personal data. Phase 2.
3. **People at a target company.** From a company row, "Find people": filters (title, seniority, location), a small cap (25 by default, 100 at most), shown as a preview that is not saved. The user picks the ones they want and only those are added to their profiles, through the same add-by-link path as pasting. About $0.20 for 25. Phase 2.
4. **Hiring signal.** Open roles of a target company (jobs API, $0.001 each): a reason to reach out now, and almost no personal data. Phase 2.
5. **Conversation hooks.** Recent posts of a target profile or company, and who engaged. Useful for a warm first message, but the engagers list is bulk personal data, so posts come first (Phase 3) and engagers wait for the owner's decision. Needs the cron service for "refresh weekly".
6. **Keep it fresh.** A scheduled refresh of stale snapshots (older than 30 days) for profiles the user still tracks, within the budget. Phase 3, needs cron.
7. **Held back, owner decides:** profile search by filters (bulk discovery of strangers), the email API, and anything that stores whole profiles.

## Compliance (read this one first)

This is the largest risk of the plan, not a footnote.

- The project guide says automating LinkedIn means acting on the signed-in user's own account within LinkedIn's rules, and that features whose purpose is mass scraping of other people's data are out of scope. Mindcase is a third party that collects LinkedIn data about other people without a login. Using it for a user's own short list (enrich by URL, a small company-employee preview) is on the safer side of that line; bulk search, big employee dumps, engager lists and email finding are on the other side. The plan keeps Phase 1 and 2 on the safe side with caps, and holds the rest.
- LinkedIn's terms prohibit scraping; this is also true for the vendor. The legal and account risk of using such a service is the project's to accept. This plan does not decide that and is not legal advice. The vendor's own terms, privacy policy and where it stores our queries were not read; read them before production.
- Personal data of people who did not sign up here: GDPR and UK GDPR need a lawful basis (usually legitimate interest), a notice, minimisation, a retention limit and a way to object or erase; India's DPDP Act has similar duties. So: only the fields the feature uses, a retention period, per-person erasure that also removes the bucket copy, and no use of the data except for the user's own outreach list. Anything the user does with it (messages) still goes out through their own LinkedIn account with LinkedIn's limits.
- Email finding and bulk employee lists are the heaviest on these duties and on anti-spam law, so they stay off until the owner decides, with the lawful basis written down.

## Where it lives (separate project)

```
 body (React) -- tRPC --> brain ---- RabbitMQ: mindcase.run ----> apps/mindcase (worker)
                           |   <--- RabbitMQ: mindcase.done -----    |  one key, rate limit, budget guard
                           |                                         +--> api.mindcase.co
                           +--> Postgres (runs, snapshots)           +--> private bucket (raw results, 14 days)
```

- `apps/mindcase`: new package (like `apps/spider`): `src/worker.ts` (consume, run, publish), `src/operations/<name>.ts` (one file per operation: input schema, the Mindcase call, row cap, price rule, mapper to the allow-listed fields), `src/client/` (the small typed HTTP client: start, poll, results, cancel, balance; no SDK), `src/env/` (envalid), `src/health/`. Own Dockerfile and compose profile, built in `staging.yml` like the spider images.
- `packages/contracts` gets the enrichment envelope (command and result, versioned, zod) and the pure LinkedIn link parser moved from `apps/brain/src/core/linkedInUrl.ts`, so brain and the worker validate links the same way (reuse, not a copy). The worker also refuses any input that is not a normalised LinkedIn link, so the key can only be used for LinkedIn lookups the user asked for.
- Brain: `EnrichmentService` (estimate, quota, dedupe, queue), a result consumer (applies the answer), tRPC `enrichment.*`, an admin view. A new top-level brain folder, if any, must be added to `importOrder` in `.prettierrc`.
- The worker announces its operation catalog (names, input schemas, price rules, caps) at start, like the spider announces its tasks, so brain computes estimates without calling Mindcase and brain never imports worker code.

## How a run goes

1. User picks rows and an action. Brain builds the input, drops anything fresh (snapshot younger than 30 days), computes the estimate (rows x price, plus the page fee for searches and employees, rounded up), and shows "Fetch details for 12 profiles, about $0.05".
2. On confirm brain checks the user's budget and the global switch, creates an `EnrichmentRun` row (`QUEUED`) with an idempotency key (user, operation, canonical input): the same request within 10 minutes returns the same run, so a double click never pays twice. It publishes the command.
3. The worker takes one command, checks the key is configured and `GET /balance` is above the floor, then starts the Mindcase job without `wait` (a tiny, quick request) and immediately reports the `job_id` so it is saved on the run. A crash or restart then resumes polling the same job instead of paying for a new one. If the start request fails before a `job_id` arrives, the worker looks at `GET /v1/jobs` for a job of that agent created after the request began before it tries again; if it cannot tell, the run is marked for review, not retried blindly.
4. It polls every 2 s growing to 10 s, with a total limit per operation. Rows are mapped to the allow-listed fields and checked against a zod schema that tolerates missing or extra fields (a changed upstream shape is counted and reported, not a crash). The raw JSON goes to `enrichment/<user>/<run>/raw.json` in the bucket.
5. It publishes the result: status (`SUCCEEDED`, `PARTIAL`, `FAILED`, `REJECTED_BALANCE`, `CANCELLED`, `TIMED_OUT`), rows, the estimated cost, a one-sentence summary, a classified failure with a hint, the bucket path. Late ack, bounded retries with a delay, then the dead-letter queue, as the spider does.
6. Brain stores the snapshot, fills only empty fields of the profile or company (a value the user typed is never overwritten), and the page shows the card as "Details fetched 2 minutes ago".

## Data model (brain, additive migrations)

- `EnrichmentRun`: id, userId, operation, operationVersion, status, trigger (`USER`, `SCHEDULE`), idempotencyKey, input (the links or filters), rowsRequested, rowsReturned, estimatedUsd, chargedUsd (only if the API reports it), mindcaseJobId, queuedAt, startedAt, finishedAt, failureKind, failureMessage, hint, notice, resultPath. Kept 90 days.
- `LinkedInProfileSnapshot` and `LinkedInCompanySnapshot`: one row per profile or company, `fetchedAt`, `runId`, `data` (jsonb of the allow-listed fields only). Profile card: name, headline, city, state, country, current title, current company and its link, followers, up to the last 3 roles. Company card: name, tagline, website, industry, size band, employee count, headquarters, specialities. Photos, recommendations, courses, volunteering, patents, honours and the long "about" are not stored. Kept 90 days after the last fetch.
- The user's monthly spend is the sum of `estimatedUsd` of their runs, not a separate table; limits come from env, with a per-user override table only when someone needs one.

## Cost and money safety

- The wallet is one shared prepaid wallet, so every user spends the owner's money. Defaults to confirm: $0.50 per run, $2 per user per month, 100 rows per run. The admin can raise them.
- Every operation sets its own row limit explicitly; the worker rejects 0 or a missing limit for any API. There is no code path that can ask for "all".
- Global stops: a switch for the admin, and a floor on the balance (for example $5): below it new runs are refused with a plain message and the admin sees a banner. A 402 or `rejected_balance` is its own final state, not a failure to retry.
- Reconciliation: a daily job compares our estimates with `GET /v1/usage/daily` and warns when they drift (a price change shows up here). Needs cron.
- Price pinning: the operation definitions pin the price they were built on; a contract test (below) fails when the public schema shows a different price.

## Failure handling

| What happens | What the system does |
| --- | --- |
| 401 bad key | Stop all runs, status `CONFIG`, admin banner; never retried |
| 402 or `rejected_balance` | Final `REJECTED_BALANCE`, nothing retried, admin banner "top up the wallet", user sees "temporarily unavailable" |
| 422 unknown parameter | A bug in our operation: `FAILED` with kind `BUG`, no retry, caught by the contract test before release |
| 429 | Back off (at least the stated 60 s), the worker's own limiter stays under 45 requests a minute so it should not happen |
| Timeout or 5xx on poll | Retry the poll, same job; after the limit, cancel the job (`DELETE`) and mark `TIMED_OUT` (rows already produced may be billed) |
| Job `failed` | Read the error, final `FAILED`, no blind retry |
| Wallet ran out mid-run | `PARTIAL` with the rows collected; the summary says which inputs were not covered; no automatic rerun |
| Link that does not exist | Reported per link as "not found", not as a failed run |
| Output shape changed | Lenient parse, `schemaDrift` counted in the run and on the admin page |
| Vendor down | A circuit breaker pauses calls for a few minutes; runs wait in the queue |
| Worker killed mid-run | The job id is saved, the next worker resumes polling it; a run with no job id is reviewed, not rerun |

## What the platform must give (the prerequisites the owner asked for)

Written from this one consumer so the platform is not built blind. The existing `.plan/cron-service.md` and `.plan/scheduler-architecture.md` stay on hold and are only cited.

**Worker service (needed before Phase 1).** The spider already has the pattern in `apps/spider/src/messaging` and the standard task contract. Make it a reusable core, not a second copy:

- W1 One command and result envelope in `packages/contracts` (run id, operation, version, idempotency key, trigger, budget, result path, status, failure kind and hint), used by spider tasks and enrichment.
- W2 A small worker core package (consume with prefetch and concurrency, late ack, bounded retry with delay, dead-letter, graceful stop, heartbeat, result publish, catalog announce, structured steps), extracted from `consumeQueue` and friends in the spider and adopted by the spider, then used by the Mindcase worker. Extract when the second consumer is written, so the shape is proven by two users.
- W3 A rate limit and concurrency port (`key`, `perMinute`, `maxInFlight`). Start in memory with one replica for the Mindcase key (60 requests a minute is per key, not per replica); a shared limiter (a row in Postgres) is needed before running more than one replica.
- W4 Scale by replicas on the queue (competing consumers) and, in Kubernetes, scaling on queue depth later. Nothing more is needed now.
- W5 Run records: do not reshape `SpiderSession`. `EnrichmentRun` is new and follows the same ideas; unify only if a third consumer arrives.

**Cron service (needed for Phase 3 only).** Phase 1 and 2 are all user-initiated and need no scheduler. Phase 3 needs: a daily spend reconcile and low-balance check, a weekly refresh of stale snapshots within budget, and retention (bucket and database). That is exactly the lean version in `.plan/cron-service.md` (one job registry in code, a run record, admin only). The large scheduler architecture is not needed for this; revisit it only if user-owned schedules become a product feature.

Suggested order, to confirm: worker core, then Mindcase Phase 1 and 2, then the lean cron service, then Phase 3.

## Scope and non-goals

- In scope: the plan above; later, `apps/mindcase`, contracts, brain enrichment service and tRPC, snapshots, the user buttons on `/profiles` and `/companies`, an admin page for balance, spend and failures.
- Out of scope: any non-LinkedIn Mindcase API, a generic passthrough, the email API, profile search and engager lists until the owner decides, selling or sharing the data, using Mindcase to send anything, a global cross-user cache (an option for later, per-owner keeps erasure simple).

## Approach (when locked, after the platform prerequisites)

- [ ] Platform: W1 envelope in `packages/contracts`, W2 worker core extracted from the spider, spider switched to it, all spider tests green.
- [ ] Verify with a real key (owner provides it): one `linkedin/profiles` run for a public figure, record the real job result shape, whether it reports a charge, what a missing profile costs. Update this plan with the facts.
- [ ] `apps/mindcase` skeleton: env (`MINDCASE_API_KEY` required, `MINDCASE_RPM` default 45, `MINDCASE_MIN_BALANCE_USD` default 5), client with a fake server for tests, health, Dockerfile, compose profile.
- [ ] Operations `profiles.enrich` and `companies.enrich` (tests first): input schema, row caps, price rule, mapper to the allow-listed fields.
- [ ] Brain: migrations (`EnrichmentRun`, two snapshot tables), `EnrichmentService` (estimate, dedupe, budget, queue), result consumer, tRPC `enrichment.estimate`, `request`, `list`; admin `enrichment.balance` and `enrichment.spend`.
- [ ] Body: Enrich action on profiles and companies with the estimate and confirm, "details fetched" card, a run list, an admin page for the wallet.
- [ ] Phase 2: `domain.lookup`, `employees.list` (preview, then add through the existing add-by-link), `jobs.list`.
- [ ] Deploy: `staging.yml` image, `deploy/` manifests (secret `MINDCASE_API_KEY` in `secrets.env`, status discovery annotations), idle-shutdown and power script lists.
- [ ] Retention: bucket lifecycle rule for raw results, database cleanup (on write now, scheduled when cron exists), erasure by link.
- [ ] Verify end to end, update `MEMORY.md`, set the plan to `done`.

## Edge cases and risks

- A double click, a retry of a message, or two tabs: the idempotency key and the unique active-run rule stop a second paid job.
- The same profile in two runs within 30 days: skipped as fresh unless the user presses Refresh.
- A user pastes a person link in the company flow or the reverse: rejected by the shared parser before any money is spent.
- Price or output changes at the vendor: the contract test and the daily reconcile notice; the lenient parser keeps the run alive.
- The vendor shuts down or changes terms: all calls sit behind the operation list and one client, so a replacement provider changes one package.
- Key leak: key only in the worker's secret, masked in every log and step, rotated by changing one secret; a leaked key can only spend the wallet, so keep the wallet small and top it up in small amounts.
- Personal data in raw results: private bucket, 14 days lifecycle rule (not applied until someone runs the gcloud command, as with the spider bucket), never logged, never returned to a user who does not own the row.
- Admin sees spend and balance; users see only their own runs and their own remaining budget.
- Not-found, private or deleted profiles return fewer rows than links; the UI says which links gave nothing.
- Time zones and "monthly" budget: calendar month in UTC.
- Staging cost: the worker is idle most of the time; one replica with a small request, and it does not count as activity for the idle-shutdown checker.
- A migration is additive; rollback is to stop the worker and hide the buttons, the tables stay.

## Verification

- Unit tests: operation input schemas (caps, no "all"), estimate maths (page fees), the mapper to allow-listed fields, the client against a fake server (queued, running, completed, failed, 401, 402, 422, 429, truncated, partial, a lost start response), budget and idempotency rules in brain.
- Contract test against the public schema endpoints (no key, run on a schedule or by hand, not in the merge gate so a vendor outage cannot block work): every parameter we send exists, every field we read exists, the price equals the pinned one.
- Integration tests with Postgres for the run and snapshot services; the queue path with the local RabbitMQ.
- One opt-in live smoke test (`MINDCASE_LIVE_TEST=1`, about $0.004): one profile end to end through the real API.
- Whole monorepo `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, clean of warnings; a Docker build of the new image.
- Real path: request an enrichment from the page, watch the run, see the card; say what could not be run.

## Open questions (must be empty before locking)

1. **Compliance stance.** Is the safe-side scope (enrich by URL, small employee preview, hiring signals, posts) right, with profile search, engager lists and emails held back, and the lawful basis and notice written down before any of those? Or do you want to widen it?
2. **Who pays.** One shared wallet with per-user limits. Are $0.50 per run, $2 per user a month and 100 rows per run good starting numbers? Is the app expected to bill users later?
3. **Project shape.** A worker app `apps/mindcase` with the key only there and the client inside it, and the link parser moved into `packages/contracts`. Right, or do you want a shared client package that brain can also import?
4. **Order.** Worker core first, then Phase 1 and 2, then the lean cron service for Phase 3 (since nothing before Phase 3 needs a scheduler). Right, or should cron come first?
5. **Phase 1 scope.** Only the two enrich operations first, then Phase 2? Or add the hiring signal (jobs) to the first release?
6. **Key and wallet.** Do you have a Mindcase key and a small balance? I need one run to confirm the open API facts (charge shown, missing profile cost). When you are ready I will tell you where to save `MINDCASE_API_KEY` in `apps/mindcase/.env`.
7. **Retention.** Raw results 14 days, snapshots and runs 90 days. Good?

## Outcome

Filled in when done.
