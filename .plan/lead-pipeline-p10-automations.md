# Lead pipeline, phase 10: the sixteen automations (recipes)

- Status: done for the automations whose blocks exist (A1, A10, A11, A13, A14 and the A16 pattern); the other ten wait for blocks, see Outcome
- Created: 2026-11-04
- Locked by user: no (all sixteen automations were confirmed on 2026-11-04)
- Parent: [lead-outreach-pipeline.md](lead-outreach-pipeline.md) (section "Blue-sky automations" holds the ideas and diagrams)
- Needs: phases 1 to 9 for the blocks each recipe uses; the Starter (phase 6) offers them

## Goal

Write down, for each of the sixteen automations, the exact chain of blocks with the settings and default values, how it runs, what it hands on and what happens when something is empty or wrong, so each can be built by a GTM engineer on the canvas or created by the Starter. No code is written in this task.

## Requirements

Confirmed (owner, 2026-11-04): all sixteen automations; the nine new blocks; the ranking model; the three reads and the mutual-connections read.

Open: none.

## Scope and non-goals

- In scope: the sixteen recipes, the shared parts (tail, exclusions, lanes), five small block changes, the Starter registry entries, golden tests.
- Out of scope: new blocks beyond those of phases 1 to 9; any act that is not already planned; booking calls (problem two).

## Shared parts

Tail (every finder ends with it; "Tail" below):

| Step | Block | Defaults |
| --- | --- | --- |
| 1 | Remove duplicates (people) | leave out people in my lists: on; leave out people at companies labelled `customer` |
| 2 | Score by signals | model Balanced; Keep tier D on |
| 3 | Get full profile | only tiers A to C pass (an If on the score at least 40 before it); also read their company: on |
| 4 | Score by signals | same model, now with the profile |
| 5 | Add label | `lead-<name>`; replace tags beginning with `tier-`; tag `tier-<a to d>` by an If chain |
| 6 | Add to list | the workflow's list |

Exclusions (in every recipe that reaches people): the model's "never rank" rules, the customers label, Do not contact and suppressions (always), and a colleague contacted lately (N5, in recipes that invite or message).

Lanes (from phase 7): lane A review, B standard, C warm-up only, D parked.

| Lane | Starts from | Chain (defaults) |
| --- | --- | --- |
| A | label `tier-a`, invite none | React to post x2 over 2 days (pool accounts), then Write words (a note up to 200 characters, voice, goal "a warm one-line reason to connect"), Ask me first, When I approve, Send connection request with `{written}` |
| B | label `tier-b`, invite none | Stage 2 of the parent plan (no note), then Stage 3 and Stage 4 |
| C | label `tier-c`, invite none | Stage 3 reactions only (accounts from Select accounts); no invite; rescored weekly |
| D | label `tier-d` | weekly: Profiles, Score by signals, Add label replacing `tier-`, nothing else |

Five small changes the recipes need (each is one setting, added where noted):

| # | Block | Change | Default |
| --- | --- | --- | --- |
| C14 | Add label | "Replace tags beginning with" (phase 7) | empty |
| C15 | Add label | takes companies as well as people | as before |
| C16 | Search people | "From an ideal customer": takes titles, seniority, places, sizes and industries from a saved ideal customer | off |
| C17 | When called by API | an optional field `outcome` (up to 20 characters), readable as the fact `api.outcome` | none |
| C18 | Write words | "Topics": up to 20 lines; when filled, the block starts a chain with the least recently used topic (built with C13 in phase 8) | empty |

## The recipes

Each recipe: runs, what the Starter asks, steps (block, settings, what it hands on), tags, and what happens when nothing is found. Defaults are the values the Starter uses; the owner can change any on the canvas.

### Wave 1

#### A1 Intent radar

Runs: every 3 hours between 08:00 and 20:00. Asks: 1 to 3 phrases for each of asking for a tool, complaining, switching, hiring, funding; the voice.

| # | Block | Settings | Hands on |
| --- | --- | --- | --- |
| 1 | On a schedule | every 3 hours, between 08:00 and 20:00 | start |
| 2 to 6 | Find posts x5 | posted within 24 hours; how many 10; sort by date; Keep on | posts |
| 7 | Remove duplicates | leave out posts I already processed: on | new posts |
| 8 | Label with AI | read post text; labels asking, complaint, switching, hiring, funding; sure at least 70; read at most 100 | posts with `label`; Else: not sure or no AI |
| 9 | If | has label `label:asking` or `label:switching` | urgent / the rest |
| 10 | Urgent: Write words | With AI; voice; goal "a helpful comment, no pitch"; length short | posts with `written` |
| 11 | Urgent: Ask me first | at most a day 10; expire after 12 hours | inbox |
| 12 | When I approve: Fit to today's limit, Comment on post | For comments; accounts From Select accounts; days apart 1 | planned |
| 13 | Urgent: authors | the posts' authors, then Tail, lane A | people |
| 14 | The rest (and the Else of step 8): Commenters, Reactors, Tail, lanes | how many 30 each | people |

Tags: `src-intent`, `label:*`. Nothing found: Done, "No new posts." If AI is off or capped, the Else of step 8 feeds step 14, so the radar still finds people.

#### A2 Buying committee builder

Runs: weekly, Monday 07:00. Asks: the label of target accounts; buyer, champion and user titles; people per company (3).

| # | Block | Settings | Hands on |
| --- | --- | --- | --- |
| 1 | Companies | label `target`, how many 100 | companies |
| 2 | Find open jobs | job titles related to the problem; posted within 30 days | companies with hiring signals |
| 3 | Score company | model Balanced; keep A and B | scored companies |
| 4 | Top N | 50, by score | the best 50 |
| 5 to 7 | People at the company x3 | buyer / champion / user titles; seniority as set; how many 5 each | people |
| 8 | Add label x3 | `role:buyer`, `role:champion`, `role:user` | tagged |
| 9 | Tail steps 1 to 2 | | scored people |
| 10 | Pick best per company | per company 3; spread over roles on | the best |
| 11 | Space out people of one company | days apart 3; stop after a reply, 14 days | one per company |
| 12 | Tail steps 3 to 6, then lanes | | listed |

Tags: `src-account`, `role:*`. No people at a company: the step says "3 companies had nobody."; a company is never invited twice in 3 days.

#### A8 Content flywheel

Two workflows. Asks: topics (up to 20 lines), the voice, the account that posts.

Make a post (weekly, Monday 09:00): Write words (kind post; Topics filled; With AI; voice; length medium) then Ask me first (at most a day 1; expire after 72 hours); When I approve: Write a post ("From the block before"; audience Anyone; comments Anyone). The post limits (1 hour apart, 3 a day) apply.

Harvest (daily 10:00):

| # | Block | Settings | Hands on |
| --- | --- | --- | --- |
| 1 | Posts | my own posts, posted 3 or more days ago, not done, how many 10 | posts |
| 2 | Commenters and reactors | how many 100 each | people |
| 3 | If person state | connected to any of my accounts is no | not connected / connected (Else) |
| 4 | Not connected: Tail, then Send connection request | the note names the post (`{written}` from Write words, goal "thank them for engaging with the post") with Ask me first | invites |
| 5 | Connected: Get our chat, If we already talked is no, Write words, Ask me first, Send message | goal "thank them and ask one question" | messages |
| 6 | Mark posts done | runs last | posts done |

Add label `src-post`; the signal `engagedOurPost` carries the post key, so the funnel is by post. A post nobody engaged with passes nothing; an empty week makes no post (Topics empty means the block says "Add a topic.").

#### A15 Closed loop with other channels

Two workflows. Asks: the HTTPS address of the other tool (optional), the colleagues pause (14 days).

Out: the hand-off stages 5 and 6 of the parent plan end with Send via API to that address.

Back (When called by API; the call sends `profiles` and `outcome`):

| # | Block | Settings | Hands on |
| --- | --- | --- | --- |
| 1 | When called by API | profiles (links), outcome (replied, booked, unsubscribed, bounced) | people with `api.outcome` |
| 2 | If the event says | `api.outcome` is one of replied, booked, unsubscribed | stop / the rest |
| 3 | Stop contacting them | reason "Replied elsewhere"; pause their colleagues on, 14 days | stopped |
| 4 | Add label | `replied-elsewhere` or `bounced` | tagged |

An outcome the call gets wrong (a link that is not a profile) is dropped with a sentence in the call's answer; a person not in My network is created as stopped. The outcomes count in the calibration (phase 5).

#### A16 Experiment engine

Not a workflow of its own: a pattern added to any recipe. Asks: what to compare (note, opener, send time, segment), the share (50).

| # | Block | Settings |
| --- | --- | --- |
| 1 | Split people | share 50 (a stable side per person) |
| 2 | Add label on each side | `variant-a`, `variant-b` |
| 3 | Each side's own Send block | the two versions |

Compare in the campaign page by two tags: accepted and replied rates with sizes, "Small sample" under 30 people a side. The owner chooses a winner; nothing changes by itself.

### Wave 2

#### A3 Trigger-based account engine

Runs: daily 06:30. Asks: target label, the roles to watch, the score line that starts outreach (60).

| # | Block | Settings |
| --- | --- | --- |
| 1 | Companies | label `target`, how many 500 |
| 2 | Find open jobs | the watched roles; posted within 7 days |
| 3 | Score company | triggers on; keep A and B |
| 4 | Add label | `trigger:hiring` on the companies (C15) |
| 5 | Run another workflow | A2's people steps, sending the companies; wait for status |

A company that crosses the line twice in a week is sent once (Remove duplicates on companies with "already sent in the last 14 days").

#### A4 Job-post tool detector

Runs: weekly. Asks: the tools or pains to look for (up to 8).

| # | Block | Settings |
| --- | --- | --- |
| 1 | Companies | label `target`, how many 200 |
| 2 | Find open jobs | any role, posted within 30 days, 20 each |
| 3 | Label with AI | read job text; one label per tool plus `unrelated`; sure at least 75 |
| 4 | Add label | `tool:<name>` on the companies (C15); Keep writes the company signal `tool` |

A company with no jobs gets nothing; Score company counts `tool` as +8.

#### A5 Customer lookalike graph

Runs: monthly. Asks: the customers label; people to find (100).

| # | Block | Settings |
| --- | --- | --- |
| 1 | Profiles | label `customer`, how many 100 |
| 2 | Get full profile | on |
| 3 | Find the pattern | top 10 (the owner ticks and presses "Use as ideal customer") |
| 4 | Search people | From an ideal customer (C16); how many 100; Keep on |
| 5 | What this person engages with | 5 each; then Commenters and reactors; how many 30 |
| 6 | Merge, Tail | model Fit first |

Fewer than 5 customers: the pattern says "Too few to see a pattern."; step 4 is skipped.

#### A7 Shared-context notes

An insert for lane A and B: Get full profile, then Compare with my account (accounts any of mine; school, past employer, place), then Write words whose goal is "mention the shared school or employer if there is one" or a typed note `{Hi {first_name}, fellow {shared_school:colleague}...}`. No shared fact: the fallback text is used. The account's own profile must be read once first ("Get my profile").

#### A12 Reactivation engine

Runs: weekly, Sunday 18:00. Asks: how long a connection counts as dormant (90 days), the "not now" wait (180 days).

| # | Block | Settings |
| --- | --- | --- |
| 1 | Profiles | connected, never messaged, connected more than 90 days ago; or label `not-now` and last reply more than 180 days ago |
| 2 | Get full profile | read again (paid, shown) |
| 3 | Detect changes | watch job, company; compare with the previous read |
| 4 | Score by signals | model Intent first |
| 5 | If | score 60 and over, and a change |
| 6 | Get our chat, Write words, Ask me first | goal "a short reason to reconnect from the change" |
| 7 | When I approve: Select accounts, Send message | |

Else (no change): parked, looked at next week; people read twice the same day are counted once.

#### A13 Inbound capture

Runs: every 4 hours. Asks: the lane for inbound (A).

| # | Block | Settings |
| --- | --- | --- |
| 1 to 3 | Get notifications (viewed, engaged, accepted), Get profile viewers (on a Free account only companies come back, so no people from it), Get my requests | since the last time |
| 4 | Merge, Remove duplicates | |
| 5 | Score by signals | model Intent first |
| 6 | If person state | not connected, or connected and never messaged |
| 7 | Wait per person | after "I added them", at least 0, plus up to 2 hours |
| 8 | Write words, Ask me first | goal "thank them for looking, one question" |
| 9 | When I approve | Send connection request with `{written}`, or Send message |

A free account sees few viewers: the step says so; people who requested to connect are answered by A-lane rules (accept above a score, as finder 10).

### Wave 3

#### A6 Warm path finder

Runs: daily 11:00, tier A only. Asks: nothing beyond the voice.

| # | Block | Settings |
| --- | --- | --- |
| 1 | Profiles | label `tier-a`, invite none, no mutual read yet; how many 20 |
| 2 | Fit to today's limit | for mutual reads |
| 3 | Get mutual connections | people a run 3 |
| 4 | If person | mutual count at least 1 |
| 5 | Write words, Ask me first | goal "mention {mutual_name} as someone we both know"; note up to 200 |
| 6 | When I approve | Send connection request with `{written}` |

Else (no mutual): lane A as usual. About 6 to 8 reads a day an account; a person is read once in 90 days.

#### A9 Competitor displacement

Runs: weekly. Asks: the competitor (company link and name), phrases (up to 5), former-employee titles.

| # | Block | Settings |
| --- | --- | --- |
| 1 | Companies | the competitor |
| 2 | Posts of companies, Commenters | newest 5, 50 each |
| 3 | Find posts | the phrases; posted within 30 days; Commenters and reactors |
| 4 | Search people | worked before at the competitor; the titles; how many 50 |
| 5 | Merge, Remove duplicates | |
| 6 | Score by signals | the signals `competitor` (+6) and `employee` (+8) as the model has them |
| 7 | Split people | 50 |
| 8 | Send connection request x2 | opener A "a switching story", opener B "a comparison question" (typed or With AI); Add label `variant-a` and `variant-b` before each |

Zero found on a door: that door's step says so; the others go on.

#### A10 Events and community harvest

Runs: weekly. Asks: event names, hashtags, community phrases (up to 8).

| # | Block | Settings |
| --- | --- | --- |
| 1 | Find posts | each phrase; posted within 30 days; Keep on |
| 2 | Label with AI | read post text; labels speaker, attendee, organiser, other |
| 3 | If | has label speaker or organiser |
| 4 | Authors and commenters, Tail | signal `posted` |

Member lists of groups and subscribers of newsletters are not available, so the harvest is only what posts show; the recipe says so.

#### A11 Second-degree expansion

Runs: weekly. Asks: how many of the best connections to watch (25).

| # | Block | Settings |
| --- | --- | --- |
| 1 | Profiles | connected, best score first, how many 25 |
| 2 | Posts of people | newest 3, past week |
| 3 | Commenters and reactors | 30 each |
| 4 | If person state | connected is no |
| 5 | Tail, lane B | |

#### A14 Referral loop

Runs: monthly. Asks: the customers label, the voice.

| # | Block | Settings |
| --- | --- | --- |
| 1 | Profiles | label `customer`, connected |
| 2 | Get our chat, If person | we wrote to them in the last 30 days is no |
| 3 | Write words, Ask me first | goal "ask who else should hear about us, one sentence" |
| 4 | When I approve | Select accounts, Send message |

The names a customer sends back are added by the owner through "Add people" and become finder 1; a customer who says no is stopped (N8).

## Starter registry

Each recipe is one entry in the registry of phase 6: its questions are the "Asks" above, `build` returns the workflows of its steps switched off with "Act for real" off, the review screen shows the cost and the room, and the golden test checks every graph validates with only notes. Recipes A2, A8 and A15 create two workflows; A16 is a pattern the owner adds to a workflow from a menu.

| Wave | Recipes |
| --- | --- |
| 1 | A1, A2, A8, A15, A16 |
| 2 | A3, A4, A5, A7, A12, A13 |
| 3 | A6, A9, A10, A11, A14 |

## Approach

- [ ] The five small changes (C14 to C18) with their tests (C14 was built in phase 7; C15 to C18 not built)
- [x] Golden graph tests: each built recipe's workflows validate with no error, every block setting parses, every act block is off (`automations.unit.test.ts`); the cost of paid blocks is shown by the editor, not by a recipe review screen
- [ ] Wave 1 recipes on a test user as preview runs through the worker (not run; no real posts, no model)
- [x] Registry: all sixteen in `AUTOMATIONS` with what each waits for; `campaign.automations` and `campaign.createAutomation`; no review screen

## Edge cases and risks

- Cost: A1 reads five searches every 3 hours, about 40 posts a run at $0.002, and engagers of the non-urgent posts: the review screen shows the daily estimate, and the wallet floor stops runs.
- Overlap: two recipes with the same phrases and accounts compete for the same people and room; the review warns.
- AI off: A1, A4, A10 still run on their non-AI branches; A8 and A14 with typed words skip Write words.
- Human load: every AI recipe feeds one inbox; the daily total of Ask me first limits (10 each) is shown in the review and the owner can lower it.
- Staleness: intent signals fade; A1 and A13 run often for that reason.
- LinkedIn limits: every send, react and read keeps the limits of phases 1, 3 and 9.
- Unverified until built: signal weights, label quality, the rate at which urgent posts convert, the read pages of phase 9.
- Rollback: delete the campaign and its workflows; no person data is touched.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; contracts golden tests for the recipes; brain integration tests for the small changes.
- Real path: wave 1 recipes as previews through the worker on a test user with real posts, the review screens in the page, one live run per recipe after the owner's go-ahead. State what could not be run.

## Outcome

Shipped (not seen in a browser; no run through the worker with real posts; no model call):

- Contracts `automations.ts`: the catalog of the sixteen (`AUTOMATIONS`, with the wave and, for each one that cannot be built yet, the one thing it waits for), one form of answers (`automationAnswersSchema`: name, a saved ideal customer, phrases, accounts, a typed note and message, the customers label, a start time) and `buildAutomation` for A1 Intent radar, A10 Events and community harvest, A11 Second-degree expansion, A13 Inbound capture and A14 Referral loop; A16 is `experimentParts` (a stable split and two labels, the owner draws the two sends). A tail shared by the finders: leave out people already known and customers, Score by signals with tier D kept out of the profile read, Get full profile, Score by signals again, Add label, Add to list.
- Every built graph validates with no error, every block setting parses, and every act block keeps Act for real off (tests). The two new facts `item.label` and `item.labelConfidence` are offered by If the event says, which A1 and A10 use to branch on the label.
- Brain `AutomationService.create` (refuses an automation that waits for a block, a missing answer or an ideal customer that is not the owner's; makes the workflows switched off; removes what it made when one fails) and tRPC `campaign.automations` and `campaign.createAutomation`.
- Checks: lint (0 warnings), ts:check, unit tests, clean `pnpm build --force`, the new integration test and the whole brain suite.

Deviations (deferred, not built):

- Waiting for blocks that do not exist: A2 (people at a saved list of target companies, Top N on companies), A3 (Add label on companies, C15), A4 (Label with AI reading a job text), A5 (Search people from an ideal customer, C16), A6 (the mutual read and AI words for invites), A7 (Compare with my account), A8 (Write words from topics, Write a post from the block before, C13 and C18), A9 (Search people by a former employer), A12 (two stored reads, AI words for messages), A15 (an outcome field on When called by API, C17). Each is in the catalog with its reason.
- A1 has no comment branch: the urgent posts (asking, switching) go to their authors, tagged `urgent`, and every other post, the unlabelled too, goes to the engagers; Write words for invites and messages is not built, so A13 and A14 send the owner's typed words (with `{first_name}` and the like) and no recipe uses AI words or Ask me first for them.
- No tier labels or lanes: the tail labels people with the campaign label and a source tag, and tier lanes need an If chain on the tier that is not drawn here.
- No review screen (cost, room, warnings), no Starter page for the automations, no calibration of outcomes; the editor shows the cost of each paid block as before.
- The recipes are named after the automation, not placed in a campaign (stage OTHER).
