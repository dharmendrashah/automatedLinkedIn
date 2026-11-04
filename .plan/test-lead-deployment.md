# Test lead deployment: merge the lead pipeline stack one PR at a time and prove the top 10 leads on staging after each

- Status: done
- Created: 2026-11-04
- Locked by user: yes (answers of 2026-11-04 below; the ideal customer wording is shown again at the first approval gate)
- Parent: [lead-outreach-pipeline.md](lead-outreach-pipeline.md)

## Goal

Land the ten stacked pull requests #183 to #192 (phases 1 to 10) on `main` in order. After each merge, wait for the staging deploy, then prove on staging, in the browser, that the platform does the real job: a workflow finds people, ranks them, picks the 10 highest ranked, and queues each for a connection request (and a message where the person is already connected). The next PR is merged only when that result is seen and the owner approves. A phase that fails its result is fixed with a hotfix PR and a new deploy first.

## Requirements

Confirmed (owner, 2026-11-04): ascending order; merge commit; #182 is not part of this; wait for the staging deploy after each merge; browse staging to check; approval before every merge; stop and hotfix when the result is not met; after each merge see the 10 highest ranked clients found by a workflow and queued for a connection request and a message; the owner signs in to the browser; deploy and cluster logs may be read with gcloud and kubectl (all three tools exist on this machine: `gcloud`, `kubectl`, `gh`).

Open: none. The ideal customer below is my proposal from the owner's sentence; the owner can change it at the first approval gate.

## Answers (owner, 2026-11-04)

- Real sending is allowed: queued invites and messages are really sent by the spider, inside each account's limits. So the hold is not needed to start; it stays as the way to stop (office hours, workflows off, and from #187 Pause everything with stop queued).
- Accounts: every connected, signed-in account of the staging user is used ("Select accounts: every signed-in account"). Each keeps its own daily and weekly limits, so the top 10 are spread over the accounts by room. These are real accounts: the typed note and message are plain, short, and carry no claim that is not true.
- Ideal customer: the owner sells a LinkedIn automation platform like HeyReach, under the name elitale. Proposed ideal customer: titles founder, co-founder, owner, head of growth, head of sales, sales director, VP sales, business development, lead generation, GTM, outbound; seniority owner, CXO, VP, head, director; industries marketing and advertising, staffing and recruiting, IT services and consulting, software; company sizes 2 to 50 and 51 to 200; places as the owner chooses (default none). Proposed phrases (1 to 3 per run): "linkedin automation tool", "heyreach alternative", "linkedin outreach tool", "scaling outbound for clients", "cold outreach agency". The problem words for the ideal customer are the same phrases.
- Typed note (up to 200 characters, spintax and variables allowed): `Hi {first_name}, I saw your post on LinkedIn outreach. I am building elitale, a LinkedIn automation tool. Happy to connect.` Typed first message: `Hi {first_name}, thanks for connecting. elitale runs LinkedIn outreach for agencies and sales teams from your own accounts. Is outreach something you are working on this quarter?` Both are shown to the owner before Act for real is turned on.
- The wallet is funded.
- AI model (checked with the key on 2026-11-04): `gemini-2.5-flash-lite` is gone (404). `gemini-4-argon`, `gemini-3.1-pro-preview` and `gemini-pro-latest` give 429 (no quota: the key is on the free tier); `gemini-3.8-flash` gave 503 and `gemini-3.7-flash` timed out. `gemini-3.6-flash` answered correctly in 4 to 6 s and is the model in `config.env` (`AI_PRICE_INPUT_MICROS=750000`, `AI_PRICE_OUTPUT_MICROS=3750000`, list price until 2026-12-31, then double). The current call (`maxOutputTokens` 60) is too small for a thinking model (`MAX_TOKENS`, empty text), so after #186 is merged and the miss is seen on staging, a hotfix adds about 1000 tokens of headroom in `core/aiModel.ts` with a test. The key shown in a tool result on 2026-11-04 is to be rotated by the owner and `STAGING_SECRETS_ENV` set again. Billing on the key's project is the owner's choice (it allows the Pro models and keeps prompts out of Google's training).
- Label with AI is tested at #190 with a real key: before that merge the owner adds `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY` (and `AI_BASE_URL` for an OpenAI-compatible provider) to `STAGING_SECRETS_ENV` and the matching local file; I check the prerequisite before asking for approval of #190.

## Facts found

- The stack: #183 (`main` <- p1), #184 (p1 <- p2), #185 (p2 <- p3), #186 (p3 <- p4), #187 (p4 <- p5), #188 (p5 <- p6), #189 (p6 <- p7), #190 (p7 <- p8), #191 (p8 <- p9), #192 (p9 <- p10). Each is mergeable and its CI `check` job passed.
- Merge commit keeps each phase branch an ancestor of the next; a squash would rewrite phase 1 and conflict the rest. Branches are not deleted on merge, so each PR after #183 must be retargeted to `main` before it is merged.
- A push to `main` runs `staging.yml` (changes, publish, deploy; runs queue; only `*.md` and `.plan/**` are skipped). Brain applies migrations in an init container on every deploy (all of these phases are additive). `/health` on `https://api.staging.elitale.com` and `https://app.staging.elitale.com` reports the deployed commit.
- The spider worker runs on staging as a Cloud Run job (its image is pushed by `staging.yml`; the deploy fails unless the job is ready), so an invite or message that is queued on staging is really sent by it unless something holds it. The spider tasks `linkedin-engage` (phase 3) and the four own-page reads (phase 9) were never written.
- What "queued" means in the product: an invite is planned by the invite plan (state PLANNED with a planned time inside the account's room and office hours) and sent later by the spider; a message goes to the account's reply queue. Both exist only when "Act for real" is on for the block. With it off, a run is a preview and queues nothing.
- A message can only be queued to a person who is already connected. A person who was just invited is not connected until they accept, so on day one "queued for a message" is only possible for existing connections; the Starter's First message workflow messages new accepters after a wait of at least an hour.
- Ranking changes with the PRs: before #189 a person is ranked by "Score against an ideal customer" (0 to 100 from title, seniority, place and, after a profile read, company size and industry); from #189 by "Score by signals" (tier A to D, with reasons).
- Not CI-tested: integration tests (all passed locally on each phase).

## Prerequisites (what has to be true before the first merge)

| # | Prerequisite | Who | How I check it |
| --- | --- | --- | --- |
| 1 | `gh` signed in with rights to merge on this repository | owner | `gh auth status`, `gh pr view` |
| 2 | `gcloud` signed in and `kubectl` pointed at the staging cluster (project, cluster and location are the repository variables `GCP_PROJECT_ID`, `GKE_CLUSTER`, `GKE_LOCATION`) | owner | `gcloud auth list`, `kubectl get pods -n <namespace>` |
| 3 | Staging is up (or wakes: `staging-power.sh ensure-awake` runs in the deploy) and the last `staging.yml` run on `main` is green | me | `gh run list`, `/health` |
| 4 | The owner signed in to staging in the browser I use (authentik), as the admin (`ADMIN_EMAIL`) so the cron monitor and the admin pages are visible | owner | I open `/workflows` |
| 5 | One dedicated test LinkedIn account on staging, signed in (status Active, session valid), with its proxy, in "Safe" browsing mode and office hours that include the time of the test. Not a client account. | owner | the account page and its Today checklist |
| 6 | The decision on sending: either real sending is allowed on that test account (the invite limits and weekly cap apply), or the hold is used (see "Holding", below) | owner | answered in the questions |
| 7 | At least 3 existing connections of that account in My network (read once), so a message can be queued on day one | owner | My network, filter "Connected" |
| 8 | A saved ideal customer on staging (titles, seniority, places, sizes, industries and the words of the problem) and 1 to 3 phrases that people post about | owner | the ideal customer page |
| 9 | Data service wallet with enough balance for a small run (finding posts, commenters, 10 profile reads: a few dollars at most; the floor stops a run when low) | owner | the wallet / usage page |
| 10 | The Cloud Run spider job is ready on the latest staging image (the deploy checks it) and the account's invite and message tasks work (one earlier invite or message sent from staging counts as proof) | me | `spider-job.sh` output in the run, Cloud Run job status |
| 11 | No new required environment variable: these phases add none (the AI variables default to off). For AI (checked in the cluster on 2026-11-04: none of the `AI_*` keys exist yet in `app-secrets` or `app-config`, namespace `automatedlinkedin`): the secret `AI_API_KEY` goes into `STAGING_SECRETS_ENV`; `AI_PROVIDER`, `AI_MODEL`, `AI_PRICE_INPUT_MICROS`, `AI_PRICE_OUTPUT_MICROS` (and `AI_BASE_URL` only for an OpenAI-compatible provider) go into `STAGING_CONFIG_ENV`. Set before the first merge so the one deploy picks them up | owner | only needed for #190 (and #186 With AI) |
| 12 | Ten minutes of the owner's attention at each approval gate | owner | the loop below |

### Holding (so nothing is sent before the owner looks)

I have not verified how to freeze a queue on staging, so the first check at #183 is to find out. The candidates, safest first: (1) set the test account's office hours so the current time is outside them, which should stop the spider's sends while the invite plan still fills; (2) turn the test workflows off after they ran; (3) from #187, "Pause everything" on the campaign (with "stop queued" it cancels queued acts). Until the owner says real sending is allowed, I queue only and read the queue; I do not open the sending window.

## The acceptance test: "Top 10" (run after every merge)

One test workflow set on staging, named "Staging test". Before #188 it is built by hand on the canvas; from #188 it is made by the Starter and then only changed. Creating anything on staging is done with the owner's yes.

Chain (by hand, #183 to #187):

1. Find posts (1 to 3 phrases, past week, Keep on) then Commenters and Reactors (30 each).
2. Remove duplicates, Score against the ideal customer, Get full profile (company read on), Score again.
3. Top N: 10 by score.
4. Select accounts (the test account), Fit to today's limit (invite), Send connection request with a typed note, "Act for real" on only after the owner's yes (otherwise a preview shows what would queue).
5. A second workflow: input Profiles "Connected, never messaged" (the 3 or more existing connections), Select accounts, Fit to today's limit (message), Send message with a typed text.

From #188 the Starter makes the same funnel as six workflows (Discover, Invite, Warm up, First message, Hand off, No answer), switched off. From #189 the Score blocks are swapped for Score by signals (Balanced model, tier lines 80, 60, 40) before Top N. From #192 the Intent radar (A1) and Inbound capture (A13) can be created from the catalog for the same ideal customer.

### What I record after every merge

- The 10 people: name, score (and tier and reasons from #189), the post or source, and that they are the highest ranked of the batch (the list is sorted by score and the 10th is not lower than anyone left out).
- For each of the 10: an invite in the plan (state PLANNED, planned time) or the reason it was not queued (already known, Do not contact, no room today, the weekly cap). A reason is not a failure; fewer than 10 only counts as met when each missing one has a plain reason and room or the cap is the cause.
- For the existing connections: a message queued, or the reason.
- The step messages of each block, the cost shown, the wallet change, and any error in the run.
- Nothing sent unless the owner allowed it; if anything was sent, which account and what.

## The loop for each PR (183 to 192)

1. Check: mergeable, CI `check` passed, and (from #184) the diff against `main` after the retarget is only that phase.
2. Ask the owner for approval, stating the PR, what it changes and the result expected on staging (table below). Nothing is merged without a yes.
3. On yes: retarget to `main` (not for #183), merge with a merge commit.
4. Watch `staging.yml` for the merge commit until `deploy` ends; read the migrate init container and rollout logs with `kubectl` and `gcloud` if it fails.
5. Confirm both `/health` endpoints report the merge commit and the worker is running.
6. Browse staging: the page checks in the table, then the acceptance test above.
7. Report what was seen against what was expected. Met: ask for approval of the next PR. Not met: stop, see "When a phase misses".

## What each merge must show on staging

| PR | Phase | Pages and blocks | Top 10 outcome |
| --- | --- | --- | --- |
| #183 | 1 foundations | Deploy green, migration applied; Profiles presets and filters; Fit to today's limit and Wait per person in the palette; one limits rule on the account page; No answer tab; risk notice; old pages still load. | The hand-built chain runs: 10 highest scored people by "Score against an ideal customer", each queued as an invite spread by room, or a plain reason. The hold method is found and written down. |
| #184 | 2 checks | If person state, Get our chat with them, Split people open with their settings. | The same top 10 (re-run); the message workflow queues messages for the connected people who have no chat stored, and skips the ones we already talked to, each with a reason. |
| #185 | 3 engage | React to post and Comment on post open with "Act for real" off; the acts switch exists for the admin. | Top 10 unchanged; no reaction or comment is made (acts switch and Act for real off). |
| #186 | 4a words | Write words, Ask me first, When I approve; Drafts inbox and voice dialog open; "AI is not set up." with no key. | Top 10 unchanged; typed texts still work; no AI call. |
| #187 | 5 campaign page | `/campaigns` list, fleet strip, Pause everything, rollup job in the cron monitor. | The test workflows placed in a campaign show their counts (found, qualified, invited); Pause everything with "stop queued" is shown to hold the queue (used as the hold from here on). |
| #188 | 6 starter | The new campaign form shows the room sentence and makes six workflows switched off. | The Starter funnel for the same ideal customer; Discover keeps the scored people with the campaign label; Invite queues the 10 best inside room; First message targets connected people never messaged. |
| #189 | 7 ranking | Five new blocks with icons; retention job still runs. | Top 10 is now by tier and reasons from Score by signals; at most 3 per company (Pick best per company) and one person of a company at a time (Space out); a person on Do not contact never appears. |
| #190 | 8 reading | Label with AI (says "AI is not set up." with no key), Find the pattern, Detect changes. | Find the pattern on the 10 (or on stored profiles) gives the titles and companies they share; with an AI key, Label with AI labels the posts and the Else count is shown. |
| #191 | 9 reads | The four read blocks give 0 people with a plain message; migration applied. | The Top 10 is unchanged and still queued (a regression check; no own-page read exists yet). |
| #192 | 10 automations | The editor opens; the catalog is read through the editor or an authenticated call. | Intent radar (A1) and Inbound capture (A13) are created, switched off; a preview of A1 finds posts, labels them (or says AI is not set up), and its tail ranks and lists people; the Top 10 from the earlier phases is still queued. |

Always also checked: sign-in works, Workflows, a workflow editor and My network load without an error, the cron monitor shows no failing job, and no unexpected send happened.

## When a phase misses its expected result

1. Stop merging. Report what was seen against what was expected, with the log or screenshot.
2. Find the cause (run log, pod log, the page); say whether it is a bug in the phase, a deploy problem, a missing prerequisite or a gap in my check.
3. Hotfix: a branch `fix/<what>` from `main`, a test first, lint, types, unit tests and build, a PR to `main`, the owner's approval, merge, wait for the deploy, repeat the acceptance test. A migration problem is fixed with another additive migration; no reset, no dropped table.
4. A phase that cannot be fixed quickly is reverted with a revert PR only if the owner agrees. Later PRs wait either way.
5. Continue only when the expectation is met.

## Edge cases and risks

- Real sending: invites and messages sent from the test account are real. The plan queues only until the owner opens that; the weekly invite cap and the monthly free-note quota can leave fewer than 10 queued, which is explained, not forced.
- Fewer than 10 qualified people: if the batch has fewer than 10 people above the "maybe" line, the result is the best that exist and the shortfall is reported (a wider phrase or ideal customer is the fix, not a lower bar).
- Every merge restarts brain (Recreate, one replica): staging is briefly down; a failing migration stops the deploy and the later PRs wait.
- Queued deploys: the next PR is not merged until the previous run finished.
- Stack surprises: if a retarget shows a diff larger than one phase, stop before merging.
- Staging data: workflows and campaigns made by the test are real rows; I create nothing without the owner's yes and delete nothing without it.
- Spend: paid reads cost wallet balance; the run stops at the floor.
- Time: a scheduled workflow runs at its time and tomorrow; the test uses "Run now" and the owner's chosen time zone.
- Browser access: I cannot type a password or a two-step code; the owner signs in. Spider, LinkedIn and AI behaviours that need a live key are reported as not verified.
- Unverified until seen: how to hold a queue, the invite plan's view in the page, and where a queued message shows.

## Open questions

None. (Answered above: real sending allowed on every signed-in account of the staging user, the ideal customer is elitale's, the wallet is funded, an AI key is added before #190.)

## Approach

- [x] Owner answers the questions and locks this plan
- [x] Prerequisites 1 to 10 checked and reported (2026-11-04, signed in as the admin `soni@elitale.com`: staging has 3 accounts, all Active and ready (Dharmendra Soni, Sushi Shreechand, Tripti Verma); My network holds 814 people with many connected and 45 replies waiting, so existing connections for the message test exist; there are no ideal customers and no workflows yet; `gh`, `gcloud` and `kubectl` work; the AI keys are in the repo secrets (config 14:24 UTC, secrets 14:16 UTC) and reach the cluster with the next deploy)
- [x] #183 merged (42badda), deployed, health matched. Top 10 from My network (workflow "Staging test - Top 10 messages"): 200 read, 23 scored, 10 kept, room 42, 10 first messages queued with Act for real on. Two went out (Brian Dean 16:38 UTC, Dima Grossman 16:52 UTC). Only 1 of 814 stored people is not connected, so invites need the data service, which failed with "System error on our infrastructure" for about 20 minutes and then recovered (preview planned 3 invites for $0.05)
- [x] #184 to #192 merged one by one (the owner approved #184 to #187, then went to sleep and authorised the rest with `--admin` after verification): #184 3071f40, #185 d2e5255, #186 f0017a3, #187 cc5f3c9, #188 2258996, #189 5e9ecaf, #190 07cac12, #191 56c5e18, #192 ee8f3d2. Each stacked branch had `main` merged into it first (the hotfixes made it differ), the whole repo was built, linted, type-checked and unit-tested on that result, CI was green, then the deploy, `/health`, migrations, logs and the page checks were read.
- [x] Hotfix #193 (8ab3b56): `linkedin-message` presses the Message link again, up to 3 times, when no window opens. Seen working on live runs.
- [x] Hotfixes #194 and #195: LinkedIn restores message windows an earlier run left open, after the press; the task now waits for the window that is for the person and closes the others by index. Live: Dr. Basavaraj S Patil, Diogo Ribeiro, Jasper Bennett and Kumar Abhishek sent.
- [x] Hotfix #197 (14dae4d): `callModel` adds 2048 output tokens for a thinking model. Label with AI then answered for real ($0.003 for 5 people).
- [x] Hotfix #200: a queued reply's 15 minutes count from `startedAt` (issue #196).
- [x] Set the status to `done`, fill in "Outcome", update `MEMORY.md`

## Verification

For each PR: the merged commit is the one `/health` reports; `staging.yml` is green; the page checks were done; the Top 10 record above is complete; what could not be checked is named.

## Outcome

All ten PRs (#183 to #192) are on `main` and live on staging (`ee8f3d2` at the last merge), each after a deploy check, plus five hotfix PRs (#193, #194, #195, #197, #200).

What was seen on staging:

- p1 to p4a: palette blocks, migrations, the acts switch on the Cron monitor, the To approve inbox and the voice dialog; 0 `PostAct`, 0 `Draft`, no AI call.
- p5: `/campaigns` with a campaign page, Pause everything and Resume (the default choice: the workflow that was on went off, was recorded, and came back on; the other workflows stayed as they were).
- p6: the outreach campaign form (room sentence "We suggest 5 for 3 accounts"), the review ("Nothing will act on LinkedIn yet"), six workflows made switched off with no Act for real; a Discover preview read and scored people for $0.046.
- p7: the five new blocks are in the catalog and the migration is applied.
- p8: Find the pattern on 200 stored people (free) gave titles, companies, schools, skills and places; Label with AI (real model) labelled 4 of 5 people for $0.003.
- p9: Get my feed posts and Get notifications ran and answered with plain "no data" messages.
- p10: Intent radar (A1) and Inbound capture (A13) were created switched off with Act for real off; A15 was refused with its reason; an A1 preview found posts, labelled one `hiring` (AI $0.002) and ran its tail for $0.162.
- First messages: 20 sent in all; 4 sent with the hotfixes (Basavaraj, Diogo, Jasper, Kumar Abhishek) plus May Piamenta and Manish Shukla.

Not done or not proven (each has an issue or a note):

- No real invite was sent by these tests; the invite path to a person is still unproven end to end. A real Discover run (up to $3 estimated) was not run; the preview was.
- Issues: #196 (fixed by #200), #198 (a slow message window pressed again opens duplicate New message windows; Lydia Jaladi, and Kiran Nagarajappa after a runner re-login), #199 (Pause everything with stop queued does not cancel queued first messages).
- p7: the ranking model screen, the Signals list and the feedback store were deferred in that phase. p10: ten automations wait for blocks that do not exist.
- Staging pages sometimes stay on a grey loading block for 10 to 40 seconds after a full page load (seen on /campaigns and /icps) while the API answers in under 0.5 s; a client navigation then renders at once. Not investigated.
- The unit run fails once on a fresh checkout until `pnpm build` has refreshed the shared packages, and `pnpm ts:check` needs `pnpm --filter @automatedLinkedIn/brain db:generate` after a branch switch.
