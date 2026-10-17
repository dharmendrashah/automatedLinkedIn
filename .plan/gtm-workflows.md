# GTM workflows: find people who show interest, score them against an ICP, move them into lists

- Status: locked (Phase 1 in progress, see `.plan/gtm-phase-1-lists-icp.md`)
- Created: 2026-10-17
- Locked by user: yes, 2026-10-17

Builds on `.plan/mindcase-integration.md` (the Mindcase API facts, costs and the worker) and the target posts list (`.plan/linkedin-posts.md`, PR 51). No code is written until the owner locks this plan.

## Decisions from the owner (2026-10-17)

- Risk: the owner accepts the LinkedIn terms and legal risk of using a third-party data vendor (this plan is not legal advice). Phases 2 and 3 use signal-based sources only: no profile search by filters, no bulk dumps, no emails.
- Billing: one shared data wallet (the vendor account), with a per-client ledger; the owner bills each client monthly for the data spend (see Billing and the ledger). One client is one account: no teams and no several users per client for now.
- No caps (2026-10-17): the product sets no per-run, per-month or per-candidate spending limits. What stays is technical, not a budget: every collect block has a required "how many" number (the data service needs an explicit number, and "all" cannot be estimated, so it is never sent), the user sees an estimate and confirms before a run, and runs stop when the shared wallet reaches a low-balance floor.
- Lists are separate from `/profiles` and its status; they belong to the workflow automation. A "copy to target profiles" action can come later. Each workflow gets its own output list, created with the workflow, which receives every person it filters in.
- Scoring uses two numbers: 60 or above is qualified, 40 to 59 is Maybe (kept 30 days), below 40 is discarded after the run. The Maybe people live in the same output list, shown as a tab (see Scoring and the two thresholds).
- ICP object as proposed is enough for v1. Rules-only scoring in v1.
- The visual canvas is in v1 (changed on 2026-10-17; it replaces "form builder first"): a guided start (ideal customer, then goal), then the canvas. Triggers are time, an API call, or another workflow; inputs are posts, profiles, companies and accounts. See The v1 interface.
- The owner's own connections are in scope when they match the ICP (phase 4, through the spider and the owner's own account).
- Retention: raw run rows 14 days, runs 90 days, list members reviewed after 180 days without contact, Maybe 30 days, spend ledger on a monthly basis.
- Order: lists and ICP first, then the engine with the flagship flow, then more sources and schedules.
- The owner has a Mindcase key (it goes in `apps/mindcase/.env`, never in chat or git).
- Hidden vendor (2026-10-17): nothing in the product body shows the word Mindcase or that a third party supplies the data (see The vendor stays invisible).
- No client keys or accounts (2026-10-17): clients never bring their own data account or key. The platform provides the data from the shared wallet, and no client sees the supplier's name, sign-up, key or invoice.
- No billing system yet (2026-10-17): the app records the ledger and monthly statements only, and invoicing happens outside the app. Prepaid client credit is not planned for v1.
- Accepted risk (2026-10-17): one client's large spend can reach the shared wallet floor and pause every client's new runs. The owner accepts this risk.

## Persona review (2026-10-17)

Five read-only persona reviews of this draft (scores out of 10). Changes are applied where they fit the owner's decisions. The prepaid credit idea is dropped (no billing system yet) and the global-halt risk is accepted; the canvas question stays open (open question 7).

| Persona | Score | Change applied |
| --- | --- | --- |
| Dana, GTM engineer | 7 | Preview run shows pass rate and cost per qualified person before a full run |
| Marcus, agency owner | 7 | Usage, monthly statements, CSV export and the spend-per-client view move into Phase 2 |
| Asha, platform admin | 7 | Warning level and a per-client pause; the global-halt risk is accepted by the owner |
| Priya, founder | 6 | Plain review with "Run it" and a cost total is the default entry; the canvas opens from Advanced (open question 7) |
| Tomas, sales rep | 6 | Lists become a work queue with a status, post link and date per row; the Seen set moves into Phase 1 |

## Goal

A GTM engineer describes the ideal customer once (the ICP), and the platform keeps finding new people who show real interest in the problem the engineer's service solves, scores each against the ICP, and moves the qualified ones into lists, on demand or on a schedule, inside a budget. It is an n8n-style builder: a workflow is a graph of steps (sources, filters, scoring, list actions), chosen from a fixed catalog.

"Unlimited customers data" is made precise as: an unlimited supply over time (the workflows keep running and keep finding new people), not unlimited rows per run. Volume per run follows the signal (people who actually engaged), and each collect block has its own "how many" setting. A person who commented on a post about the problem is worth far more than one found by a bulk dump, so the product competes on signal, not on size. This is also the line the project and the law draw (see Compliance).

The three discovery ideas from the owner, as signals:

1. **Understand a profile.** A profile (a customer you already like, a competitor's buyer, a target) is read as a card: who they are, what they post about, what they comment on and react to. The same card then seeds lookalike searches.
2. **A profile's network, reading their posts.** Posts by a profile (or by a person in your own connections) are read, and everyone who engaged is a candidate.
3. **All commenters (and reactors) of a post can be ICP candidates.** The flagship flow: you paste posts into the posts list, the workflow reads the commenters and reactors, keeps those who fit the ICP, adds them to a list and marks the post processed.

## What the platform has today (checked 2026-10-17)

- Lists of pasted links: profiles, companies, posts (status `UNPROCESSED` and `PROCESSED`, soft delete). Profiles and companies are flat tables with no list concept.
- Brain worker (`apps/brain/src/worker`, done): `defineConsumer` and `defineJob` with retry, dead letter and a job registry, `database/taskHooks.ts`. This already gives the scheduled-job part of the old cron plans, so the lean cron service in `.plan/cron-service.md` is not needed first; the large scheduler plan stays on hold.
- Task outbox (done): `TaskDispatch` publishes after a database write and retries. The workflow engine reuses the idea for Mindcase commands.
- Spider tasks: browser tasks for the user's own LinkedIn account (sign-in, session). Not a fit for Mindcase calls, which need no account.
- Nothing yet for Mindcase, lists, ICPs or workflows.

## Mindcase building blocks and the facts that shape the design

From the live catalog (prices as of 2026-10-17; verify with a real key, see the Mindcase plan):

| Node source | Mindcase API | Price | What a row holds | Input limits |
| --- | --- | --- | --- | --- |
| Commenters of a post | `linkedin/post-comments` | $0.002 per comment | `commenterName`, `commenterHeadline`, `commenterUrl`, `commenterFollowers`, `comment`, `commentedAt` | one post URL per run |
| Reactors of a post | `linkedin/post-reactions` | $0.002 per reaction | `reactorName`, `reactorHeadline`, `reactorUrl`, `reactorLocation`, `reactionType` | one post URL per run |
| Posts of a profile or company, or by keyword | `linkedin/posts` | $0.002 per post | post text, author, reactions, comments, `postedDate` | URLs or keyword queries, filters |
| What a person comments on or reacts to | `linkedin/profile-comments`, `profile-reactions` | $0.002 per row | the post they engaged with, its author | one profile URL per run |
| Full profile | `linkedin/profiles` | $0.004 per profile | name, headline, experience, skills, location, follower count | URL list |
| People at a company | `linkedin/company-employees` | $0.004 per profile plus about $0.10 per 25 | full profile with filters (title, seniority, location) | one company URL per run |
| Open roles (hiring signal) | `linkedin/jobs` | $0.001 per job | title, company, description | search filters |
| Website to company page | `linkedin/domain-lookup` | $0.004 per result | company URL | domain list |

Consequences:

- **Cheap rows already carry the headline.** A comment or reaction row has the person's headline (and location for reactors) for $0.002. So the engine filters and scores on the headline first and pays $0.004 for the full profile only for people who pass. This is the main cost control.
- **There is no "connections" API.** Mindcase cannot read a person's connection list. "My connections" has to come from the user's own account through the spider (their own session, LinkedIn's own rules), or be left out. Phase 4, owner decision.
- **One URL per run** for posts, commenters, reactors and employees: 10 posts means 10 jobs. The 60 requests a minute per key limit and the per-run job time decide the pace; the engine batches and paces.
- **A limit of 0 means every row.** No node can ever send 0 or a blank limit.
- Not known until tested with a real key: whether a result reports its charge, the cost of an empty or missing result, idempotency of `POST /run`.

## Concepts

- **ICP** (saved object, per owner): include and exclude title keywords, seniority levels, industries, company headcount bands, locations, optional "problem keywords" (words that show need when found in a comment or post), and signal weights. Reused by any workflow, so changing the ICP changes how every workflow scores.
- **Item**: what flows between steps. A typed record `{ kind: profile | company | post, slug, url, name?, headline?, location?, followers?, signals[], score?, reasons[] }`. A signal is `{ type: commented | reacted | posted | employee | hiring, via: <post or company url>, at }`, so every person keeps the reason they were found.
- **Step (node)**: one entry of a closed catalog. Each has a config schema (zod), typed input and output ports (the item kind), a required "how many" setting where it collects data, a cost rule, and a small executor. No custom code and no generic "run any API" block.
- **Workflow**: a named graph of steps stored as JSON (nodes, edges, config), with a trigger (manual, daily, weekly), an owner, a run budget, thresholds, an on/off switch and its own output list.
- **Run**: one execution. It records each step's items in and out, the estimated and (when known) charged cost, and failures.
- **List**: a named list of people, separate from the target profiles. Each workflow owns an output list that is created with it and receives everyone the workflow filters in. A member records where the person came from (the signals) and has a state, `QUALIFIED` or `MAYBE`, and a work status (`NEW`, `IN_REVIEW`, `DONE`, `NOT_A_FIT`) that the user sets; the list page shows the states as two tabs. A person is in at most one of the owner's lists (the Seen set, 2026-10-17); moving someone to another list is one atomic write. A later "copy to target profiles" action can turn a member into a `LinkedInProfile`.

### Step catalog

| Group | Steps |
| --- | --- |
| Trigger | On a schedule (every N hours, daily or weekly, at a chosen time), When called by API (a per-workflow secret address; the call carries the input items), When another workflow finishes (receives that workflow's output), Run by hand |
| Input, from this tool | Posts (the posts list or pasted links), Profiles (a list or pasted links), Companies (a list or pasted links) |
| Collect (the blocks the data service runs) | Get commenters, Get reactors, Find posts (by keywords, or of a profile or company), What this person engages with, Get full profile, Find people at a company, Find open jobs, Find a company from its website |
| Input, own account (phase 4) | My LinkedIn account: my connections that match the ideal customer, their recent posts |
| Transform | Remove duplicates and people already seen, Remove suppressed people, Filter by rules (headline, location, followers, signal type), Keep top N, Combine (merge branches), Enrich (full profile) |
| Score | Score against an ideal customer (rules, v1; two outputs: Qualified and Maybe) |
| Action | Add to the output list (as qualified or maybe), Add or move to another list, Mark posts done, Tag, Send to another workflow |
| Held, owner decides | Email lookup, outreach actions, an AI classifier of comments |

### Profile insight (the "understand a profile" step)

Input: a profile URL. Runs `profiles` (the card), `posts` (their last N posts) and `profile-comments` and `profile-reactions` (what they engage with, limited by a how-many number). Output: a card with headline, role, company, topics (the most frequent words and hashtags across their posts and comments, counted without a model), the authors and companies they engage with most, and the posts they commented on. The card is shown to the user and its "what they engage with" posts can be fed straight into Commenters of posts to find lookalikes. No language model in v1.

### Scoring and the two thresholds

Every candidate gets a score from 0 to 100 from the ICP rules. Example weights (set on the ICP, tunable): title matches an include keyword +30, seniority matches +20, industry matches +15, company size matches +10, location matches +5; a comment containing a problem keyword +20, a comment without one +10, a reaction only +5; an exclude keyword in the title disqualifies. More than one signal adds up.

Two thresholds per workflow, with these defaults:

- **Qualified, 60 or above.** The full profile is read (paid), the person is scored again on it, and a person who still passes goes into the output list as `QUALIFIED`.
- **Maybe, 40 to 59.** An optional band (on by default, switchable). Stored in the same output list as `MAYBE`, with only name, headline, link, location and the signals; no paid enrichment. Deleted after 30 days unless the user promotes the person to qualified (which then triggers enrichment).
- **Below 40.** Discarded when the run finishes. Raw rows follow the 14 day rule.

The first score uses the headline (and location or follower count where the row has them), because that is all a comment or reaction row carries; the second uses the full profile. Raising the threshold gives fewer, better people, fewer paid profiles and less personal data stored; lowering it gives volume at a higher cost and more data on people who do not clearly fit. The run page shows how many fell in each band, so the engineer can tune the numbers.

### Billing and the ledger

- One shared data wallet (the owner's vendor key, only in the data worker). The owner bills each client monthly for the data spend, so the platform must know the spend per client exactly.
- `SpendLedger`: one row per finished collect step run (client, workflow, run, step run, estimated amount, charged amount when the vendor reports it, status, time). It holds amounts only, never data about the people found. A partial run (the wallet ran out) records what was actually delivered. If the vendor does not report the charge, the amount is the rows returned times the pinned price, and the daily reconcile against the vendor's usage report flags drift.
- No caps on clients (owner decision, 2026-10-17). The only stop is the global wallet floor (default $5, an admin setting): below it new runs are refused with a plain message and the admin sees a banner. Because nothing limits a client, the estimate-and-confirm screen before every run is the control, and the admin sees spend per client at any time. An optional per-client limit can be added later without changing the model (default none).
- Monthly basis (owner decision, 2026-10-17): the billing period is the calendar month in UTC. When a month closes, each client gets a statement row (runs, rows collected, amount per workflow and in total) that the client can see and export as CSV; invoicing itself stays outside the app. Detail rows are kept until their month is closed and invoiced, plus a 90 day dispute window (a proposal to confirm, open question 1); statements hold amounts only and are kept as long as the owner's accounting needs.
- Clients see their own spend as a plain amount labelled "Data cost", never with a supplier name.

## Flows the first version must support (templates)

1. **Warm engagers from posts I choose (flagship).** Posts list (unprocessed) → Commenters + Reactors → remove seen and suppressed → filter by headline and signal → Score against ICP → apply the two thresholds → Enrich qualified candidates → Add to the workflow's output list → mark each post processed.
2. **Posts about my problem.** Posts matching keywords (last 30 days, top N by engagement) → Commenters → same tail as flow 1. Finds interest nobody pointed at.
3. **Who works at my target accounts.** Companies list → People at a company (title and seniority filters, a small "how many") → Score → Add to list; plus Open roles as a hiring signal tag.
4. **Lookalikes of a good customer.** Profile insight on a customer → their engaged posts → Commenters → same tail.
5. **Keep watching (scheduled).** Weekly: Posts of the top profiles in a list → new commenters since the last run → same tail. Needs Seen-set and budget.
6. **My network (phase 4).** My connections' recent posts → Commenters → same tail.

Illustrative cost of flow 1 for 10 posts, 100 comments and 100 reactions each: up to 1,000 comments ($2.00) + 1,000 reactions ($2.00), then about 15 percent pass the headline filter, say 300 full profiles ($1.20): about $5.20, shown before the run starts. The real pass rate decides the cost per qualified person; the run page reports it.

## Compliance and policy gates (read first)

The people found through commenters, reactors, employee lists and connections' posts did not sign up here. This is the heaviest use of the whole product, and it is where the owner's phrase "unlimited customer data" meets the project rules: automation here acts for the signed-in user within LinkedIn's rules and privacy law, and a feature whose purpose is bulk collection of other people's data, or evading controls, is not built. So the plan builds signal-based discovery with these gates instead of a bulk dump:

- **Signals, not dumps.** Every candidate has a recorded reason (they commented on or reacted to a post about the topic, worked at a target company, a role is open). No "all employees", no "all followers", no profile search by filters in the first versions.
- **No spending caps, but no blind runs.** Every collect block needs a "how many" number (never "all"), the estimate is shown and confirmed before a run, and the wallet floor stops new runs. The user can choose any number, so a large run is possible by design.
- **Minimisation.** A list member keeps name, headline, location, profile URL and the signals (reason, source link, date). The full profile is read only to score, and what is stored of it is a short allow-list. Photos, "about", experience beyond the current role, and the comment text beyond a short excerpt are not kept. People below the Maybe threshold are not stored after the run; Maybe people are stored with the minimal fields only and for 30 days; raw rows are deleted with the run (14 days at most).
- **Retention.** Raw run rows 14 days; runs 90 days; Maybe members 30 days; list members not touched for 180 days are shown for review and purged unless kept; the spend ledger on a monthly basis (amounts only; see Billing and the ledger); the suppression list is kept, as profile links only, so a person who objected never returns.
- **Suppression and erasure.** A suppression list (per owner, and a platform-wide one for erasure requests) is checked by every workflow. A deletion removes the person from all lists and bucket copies and blocks adding them again.
- **Lawful basis and notice.** For GDPR and UK GDPR the basis is legitimate interest, which needs a written balancing test and a privacy notice that says people can object; DPDP in India has comparable duties. This is not legal advice; the owner takes it to counsel before real use in the EU, UK or India.
- **Outreach is separate.** Nothing in this plan sends a message. Outreach, when built, goes through the user's own LinkedIn account within LinkedIn's limits and with opt-outs honoured; cold email stays off.
- **Vendor and platform terms.** LinkedIn's terms prohibit scraping, and the vendor does the scraping. The owner accepted that risk on 2026-10-17. Mindcase's own terms and privacy policy must still be read before production.
- **Own account data** (connections) is the user's own and is handled under the account rules already in `.plan/linkedin-account-linking.md`; only connections who match the ICP are kept, and it still needs LinkedIn's permission questions answered there before any build.

## The v1 interface

The owner's outline (2026-10-17): a sidebar entry for workflows; a guided start that asks about the ideal customer and what the user wants to achieve (with options to pick or suggestions); then the canvas, where the user chooses when it runs (time, an API call, or another workflow), picks the input blocks (posts, profiles, companies, accounts), processes them, and runs each output through data-collecting blocks, and so on, block after block.

### Sidebar

- **Workflows**: the list (name, goal, trigger, last run, on or off, output list), a "New workflow" button, and a tab "Ideal customers" to manage the saved ones.
- **Lists**: a work queue for each output list, with Qualified and Maybe tabs. Each row shows the person, the reason as a link to the post or company that found them, the date found, and a status the user sets and filters by (New, In review, Done, Not a fit). Move, delete, CSV export and, later, "copy to target profiles".
- **Usage**: the client's data cost by month, by workflow, by run, with the monthly statements. The platform owner's admin view adds spend per client and the wallet balance with its warning level (open question 2).

All pages are full width (`grid w-full gap-4 px-4 lg:px-6`).

### New workflow: the guided start (three screens, then a plain review)

1. **Your ideal customer.** Pick a saved one or describe a new one. The user first says what they provide (a short choice: outbound or sales agency, recruiting, marketing services, software product, consulting, design or development services, other). That pre-fills suggestions as chips the user can accept, remove or add to: job titles, seniority, industries, company size bands, locations, "words that show someone has this problem", and titles to exclude. Suggestions are fixed presets in v1 (no AI). Saved as an ideal customer (the ICP object).
2. **What do you want to achieve?** Cards to pick one, or "Start from a blank canvas":
   - Find people talking about my problem (posts found by keywords, then their commenters and reactors).
   - Find the people who engage with posts I choose (my Posts list).
   - Find the right people at my target companies (my Companies list).
   - Find people like my best customers (lookalikes through what a customer engages with).
   - Keep watching key people and companies for new interest (scheduled).
   - Find companies that are hiring for what I solve (open jobs as a signal).
   - Find warm people in my own network (shown when the own-account phase exists).
   A goal asks one or two short questions (which list, how many people, how often) and pre-builds a graph from the matching template.
3. **Name, output list and review.** A workflow name; its output list is created with it and can be renamed. The review says in plain words what the workflow does, how many people each run collects (the "how many" number, in words), and the data cost up to $X per run. It offers two buttons: "Run a preview" and "Run it" (starts a run after the estimate is confirmed). The graph is pre-built from the goal and opens under Advanced.

### The canvas (Advanced)

Opened from the review's Advanced button or from an existing workflow. It is the same graph the guided start builds.

- **Layout.** Left: a palette of blocks in groups (Triggers, Inputs, Collect, Process, Output) to drag in. Centre: the canvas (React Flow). Right: the settings of the selected block, drawn from the block's schema, with that block's own estimate. Top bar: workflow name, autosaved draft, "Run now", on or off switch, and the total estimate for a run ("Data cost up to $X"). Tabs: Canvas, Runs, Settings (the two thresholds, the output list, the API address and its secret).
- **Blocks as cards** with an icon, a title and a one-line summary of their settings. During and after a run each card shows its state (waiting, running, done, failed) and each line between blocks shows how many items passed ("124 people"). Clicking a card previews the first 50 items it produced (while the run is within its retention).
- **Typed connections.** Blocks have ports typed by what flows (post, profile, company, account). The editor only joins matching ports and says why when it refuses. Branches are allowed (one output to several blocks) and joined by a Combine block; there are no loops, no code blocks and no conditions beyond Filter and Score.
- **Ready to switch on** needs exactly one trigger, at least one input, a connected path to an output, and every required setting filled. The same validation runs in the browser and in brain (one pure function in `packages/contracts`).
- **Blocks the user sees** (names only; none mentions a supplier):
  - Triggers: On a schedule, When called by API, When another workflow finishes, Run by hand.
  - Inputs: Posts, Profiles, Companies, My LinkedIn account (phase 4).
  - Collect: Get commenters, Get reactors, Find posts, What this person engages with, Get full profile, Find people at a company, Find open jobs, Find a company from its website.
  - Process: Remove duplicates and people I already have, Filter, Score against my ideal customer (Qualified and Maybe outputs), Keep top N, Combine, Tag.
  - Output: Add to list, Mark posts done, Send to another workflow.

### Triggers

- **On a schedule**: a frequency (every N hours, daily, weekly) and a time of day in the user's time zone (stored with the zone). A workflow with a run still active skips the tick.
- **When called by API**: each workflow has an address and a secret token, shown once and stored hashed, that the user can rotate. A `POST` with a list of links or items starts a run and returns the run id. The call is tied to its owner (it can only feed that owner's workflow), the body is validated by the input block's schema, the size and rate are limited, and the call is idempotent through an optional key header.
- **When another workflow finishes**: starts when a chosen workflow of the same client finishes and receives its output items; the "Send to another workflow" block does the same from the middle of a graph. Loops between workflows are refused when saved (the chain of workflows must be acyclic), with a depth limit as a second guard.

### Preview run (before the first real run)

- Runs the workflow on a small sample first: by default one post, or 20 people from an input list, with a size the product sets as the most a preview can use. Same blocks, thresholds and ICP as the real workflow.
- It is a real, charged run, recorded in the ledger, with its data cost shown and confirmed first. It writes no list rows, marks no post processed and sends nothing to another workflow.
- Result: the pass rate at each step, how many fall into Qualified, Maybe and discarded, the data cost, and the cost per qualified person (cost divided by qualified people, labelled as a sample estimate). "Run it" then shows the scaled estimate for the full run.
- Raw rows of the preview follow the 14 day rule.

### Runs and usage

- **Runs tab**: each run with its trigger, status, the counts per block, how many fell in Qualified, Maybe and discarded, the data cost, and plain-language errors. A run opens as a replay on the canvas.
- **Usage page**: spend by month, workflow and run, with the monthly statements as in Billing and the ledger.

### The vendor stays invisible

The product never shows that a third party supplies the data (owner decision, 2026-10-17).

- Nothing the browser receives or shows contains the vendor's name, address or field names: pages, emails, tRPC answers, error messages, CSV exports, the admin pages. Fields such as a vendor job id or a `provider` stay inside the data worker and the brain worker and are never returned.
- The block catalog lives in `packages/contracts`, which body imports, so its identifiers and labels are neutral (`collect.commenters`, not a vendor-named id). Vendor-specific code, environment names, queue names and endpoints live only in `apps/mindcase` and in brain's worker and database internals.
- Vendor errors map to a short fixed set of plain messages ("The data service is busy, try again soon", "Temporarily unavailable"). Vendor photo links are never passed to the browser (they expire anyway and are not stored).
- No client setup: no screen asks a client for a key, an account or a sign-up with the supplier, and no client-facing page links to the supplier.
- Enforced by tests: a unit test scans `apps/body/src` and the catalog in `packages/contracts/src` and fails on the vendor's name (case-insensitive), and a brain test checks that run, step and ledger answers have no vendor fields.
- Not covered by this rule: legal notices. Hiding the supplier in the product does not remove the duty to describe the recipients of personal data in a privacy notice, or to name the supplier as a processor in the client agreement when the law or a contract asks for it. Clients who act as controllers for the people they target are likely to ask. That sits outside the app screens and is for the owner and counsel before the first paying client.

## Architecture

```
 body (React): /workflows /lists /icps  -- tRPC -->  brain (API: CRUD, estimate, start run)
                                                      |  Postgres: Icp, List, Workflow, Run, StepRun, Item, SpendLedger, Suppression
                                                      v
                              brain worker: "advance run" consumer + "workflow-schedules" job
                               runs local steps itself (filter, score, dedupe, add to list, mark processed)
                               sends a command per Mindcase step  --> RabbitMQ mindcase.run
                                                                         |
                                                                         v
                                                          apps/mindcase worker (one key, pacing, budget guard)
                               <-- RabbitMQ mindcase.done -------------  api.mindcase.co, raw rows to private bucket
```

- **Step catalog in `packages/contracts`**: pure data and zod schemas (neutral id and label, config schema, typed ports, "how many" rule, cost rule) plus the pure `validateGraph` (matching ports, no loops, one trigger, a path to an output). Body renders the palette, config forms, validation and live estimates from it, brain validates with it, and the data worker announces which blocks it can execute (as the spider announces tasks). No I/O in the package, and no vendor names (see The vendor stays invisible).
- **Engine in the brain worker**: state machine over the graph. A step is ready when its inputs are done; the engine writes the step's output items to the database (not memory), so a crash resumes from the last finished step. Local steps run inside the worker; Mindcase steps are dispatched through the outbox pattern and answered by a result consumer that stores items and enqueues "advance". Fan-out (one run per post) is paced by the worker and shown in the estimate.
- **Idempotency**: a run has a key (workflow, trigger time); a step run has a key (run, node); a Mindcase job id is saved the moment it is known, so a restart resumes polling and never pays twice (as in the Mindcase plan).
- **One engine for one-off use too**: the single Enrich button on `/profiles` and `/companies` from the Mindcase plan is a one-step workflow, so there is no second code path. `EnrichmentRun` in that plan is replaced by the step run records here.
- **Scheduling**: a `defineJob` in the brain worker checks the time triggers and starts due runs, skipping a workflow whose last run is still active and every workflow while the wallet is below its floor. The API-call trigger is an Express route on brain (token in a header, hashed in the database), and a finishing run enqueues the workflows that listen to it.
- **Seen set**: `(userId, slug)` of every candidate ever scored, with the last score, so the same person is not paid for again and re-added; a fresh snapshot (30 days) is reused.
- **UI**: the guided start, the canvas, the runs and usage views are described in The v1 interface. The canvas editor is React Flow in `apps/body`; the graph is stored as JSON and validated by the shared `validateGraph`. Full width pages as always.

### Data model (additive migrations)

- `Icp`, `Workflow` (graph JSON, `goal`, `qualifyScore`, `maybeScore`, `maybeEnabled`, `outputListId`, `enabled`, the trigger settings, the API token hash and the ids of the workflows it listens to), `WorkflowList` (a named list; the output list of a workflow is one of these), `WorkflowListMember` (`listId`, the minimal person fields `slug`, `url`, `name`, `headline`, `location`, `state` `QUALIFIED` or `MAYBE`, `status` (`NEW`, `IN_REVIEW`, `DONE`, `NOT_A_FIT`), `postUrl?`, `score`, `reasons`, `signals` JSON, `addedByRunId?`, `addedAt`, `lastTouchedAt`, `expiresAt?` for Maybe), `WorkflowRun`, `WorkflowStepRun`, `WorkflowItem` (run items, deleted with the run), `SpendLedger`, `Suppression`, and the Mindcase snapshot tables from the Mindcase plan.
- `LinkedInProfile` is not touched. A list member is its own small row, unique per `(listId, slug)`. A later "copy to target profiles" action creates the `LinkedInProfile` from a member (link only plus the allow-listed fields).

## Phases

0. **Prerequisites.** Owner answers, a real Mindcase key and one test run to record the real shapes and charges (updates the Mindcase plan). Confirm the brain worker is enough for scheduling (it is).
1. **Lists and ICP, no automation.** `WorkflowList` and members (with the Qualified and Maybe tabs and the work status), `/lists` as a work queue, add people by hand (a link, with an optional name, headline and location) and move them between lists, list CSV export, "Do not contact" on a row, hard deletes, the Seen set (everyone already in a list or in `/profiles`, so nobody is added twice); `Icp` and `/icps` with a score preview on sample headlines and locations. Useful alone and the sink for everything after. Plan: `.plan/gtm-phase-1-lists-icp.md`.
2. **Engine v1, the canvas and the flagship flow.** `packages/contracts` block catalog and `validateGraph`, `apps/mindcase` worker (client, pacing, wallet floor, fake server for tests), engine, the vendor-name guard tests, the guided start (ideal customer, goal, name, plain review), the preview run, the canvas editor under Advanced with the palette, typed connections, settings panel, estimate, run replay and the Runs tab, the Usage page with monthly statements and their CSV export, and the owner's spend-per-client view and wallet balance. Blocks: Posts, Profiles, Companies, Get commenters, Get reactors, Remove duplicates, Filter, Score, Get full profile, Add to list, Mark posts done. Triggers: Run by hand and On a schedule. Template 1. Needs its own short plan, possibly split into engine and canvas.
3. **More blocks and triggers.** Find posts, Find people at a company, Find open jobs, What this person engages with, Find a company from its website, Combine, Keep top N, Tag; the API-call trigger and the workflow-to-workflow trigger with its cycle check; retention jobs for runs, the ledger, Maybe members (30 days) and the 180 day review. Templates 2 to 5.
4. **Own network.** A spider task that reads the user's own connections (own account, LinkedIn's limits), scores them against the ICP and keeps only the matches, then reads connections' posts. Template 6. Gated on the account-linking permission questions.
5. **Polish and extras (each needs its own decision).** A gallery of shared templates, an AI classifier for "this comment shows need", email lookup, outreach hooks.

## Scope and non-goals

- In scope: the plan above, in phases; each phase gets its own short plan when it starts, referencing this one.
- Out of scope for now: sending anything, profile search by filters, "all followers" or "all employees" dumps, email finding, arbitrary custom code or any Mindcase API outside the LinkedIn catalog, selling or sharing data, a cross-user shared cache, mobile.

## Edge cases and risks

- **Cost blow-up from fan-out, with no caps.** Posts times commenters times enrichment multiplies, and nothing limits a client's spend. The estimate uses the numbers typed in each block and is shown and confirmed before a run; the wallet floor stops new runs; the admin sees spend per client. A run that hits the floor reports a partial result (rows already paid for are kept). The owner carries the risk that a client's large run costs more than the wallet or than the client will pay; the ledger makes the amount provable.
- **Low-signal commenters** ("Great post!", bots, people at agencies). Rules can require a minimum comment length or follower count, and the score weighs a real comment above a reaction. The pass rate is shown so the engineer can tune.
- **The same person through many posts.** Deduped by slug inside the run and by the Seen set across runs; signals are merged so more signals raise the score.
- **A source post that was deleted or is private.** A not-found result is a per-input outcome, not a failed run; the post is marked processed with a note so it is not retried forever.
- **A post processed twice** (double click, retry): the unique step run key and the "mark processed" step being the last action prevent a second paid run; an unprocessed post whose run failed stays unprocessed.
- **Vendor outage, 402, 429, changed output**: handled as in the Mindcase plan (circuit breaker, final `REJECTED_BALANCE`, lenient parsing with a drift counter).
- **The wallet is shared.** A global floor, an admin banner, and the ledger so each client's spend is exact. The admin sees a warning at a higher level (open question 2) and can pause one client's runs without touching the others. A global floor halt still stops everyone; the owner accepts this risk (see Decisions). A client must never see another client's runs, lists or spend (every call is scoped to the owner, as for the other lists).
- **Loops between workflows.** A triggers B and B triggers A would spend without end. Saving a chain that closes a loop is refused, and a chain depth limit (5) is a second guard.
- **The API-call trigger is an open door.** The token is long, random, shown once and stored hashed; it can be rotated; calls are rate limited and size limited; a call can only feed its own owner's workflow; the body is validated like any input; an optional idempotency key prevents a retried call from running twice.
- **A vendor name leaks into the product** (a label, an error, a field in an answer). The guard tests fail the build; any new block label goes through the same test.
- **Editing a workflow while it runs.** A run uses the graph version it started with (the graph is copied into the run), so an edit never changes a run in progress.
- **Right to object after the fact.** A suppressed person is removed everywhere and cannot return; suppression keys on the profile slug and, where known, the profile id.
- **Workflow definitions are user data.** Config is validated against the catalog on save and again at run time; a catalog version bump migrates or rejects old graphs with a clear message.
- **Time zones for "weekly" and "monthly".** UTC, stated in the UI.
- **Migrations are additive.** Rollback is stopping the worker and disabling workflows; the tables stay.
- **Staging cost.** The Mindcase worker idles most of the time; it must not count as activity for the idle-shutdown checker.
- **The graph model can grow into n8n's complexity.** It stays small on purpose: a closed catalog, items typed, no loops, no code nodes, branching only as a later step. Anything more is a new decision.

## Verification

- Unit tests per block (config schema, "how many" rule, cost rule, executor), `validateGraph` (port types, loops, missing trigger or output), the estimator, the score function with fixture rows, the engine state machine (resume after a crash, partial run when the wallet floor is hit, duplicate trigger, workflow-to-workflow cycle), the API trigger (bad token, replay with the same key, oversized body), suppression and seen filters, the data client against a fake server, the monthly statement totals, and the vendor-name guard tests.
- Contract test against the public Mindcase schema endpoints (no key; not in the merge gate): every parameter and field we use exists, prices match the pinned ones.
- Preview run: writes no list rows, marks no post processed, and reports the pass rate and the cost per qualified person.
- Integration tests with Postgres (lists, runs, moves in one transaction) and RabbitMQ (command, result, retry, dead letter).
- One opt-in live smoke test with a real key (about $0.05): one post, a few comments, one enrichment, end to end through the engine.
- Whole monorepo `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, clean of warnings; Docker build of the new image; state what could not be run.
- Real path per phase: run the flagship template against a real public post and read the run page, list and spend.

## Open questions (must be empty before locking)

Answered by the owner on 2026-10-17 (see Decisions from the owner): risk acceptance and signal-based sources only, billing through one shared wallet with a per-client ledger on a monthly basis, no caps, one client per account, lists separate from `/profiles`, the two thresholds, the ICP object, the canvas in v1 with time, API and workflow triggers, own connections when they match the ICP, retention numbers, Maybe in the same list, order, the vendor hidden from the product, Mindcase key.

Locked on 2026-10-17 with the proposed answers below (the owner locked the plan without changing them; each can be reopened in the phase plan that builds it). Question 7: the canvas stays in v1, opened from Advanced.

1. **Monthly ledger detail.** I read "monthly basis" as: the billing period is the calendar month (UTC), each closed month produces a statement per client (amounts only), and the detail rows are kept until the month is invoiced plus 90 days. Right, or should the detail rows be kept differently?
2. **Wallet floor.** With no caps, the one stop is a low-balance floor on the shared wallet (proposed $5, an admin setting), below which new runs are refused. Good? Do you also want a warning to you when the wallet falls under a higher level (for example $25) so you can top up in time?
3. **Goals and blocks.** Are the seven goal cards and the block names in The v1 interface what you want, or should some be added or renamed?
4. **API trigger.** A per-workflow secret address and token (shown once, rotatable) is the proposed protection. Enough for v1, or do you want something stronger such as signed requests?
5. **How the client sees cost.** As a dollar amount labelled "Data cost" (proposed), or in credits that you price yourself?
6. **Time zones.** Schedules are set in the client's own time zone (proposed), while monthly statements stay in UTC. Good?
7. **Guided start first.** The founder review asks for the guided start as the whole v1, with the canvas under Advanced. The plan keeps the canvas in v1 (your decision) and opens it from Advanced. Keep that, or drop the canvas from v1?

## Outcome

Filled in when done.
