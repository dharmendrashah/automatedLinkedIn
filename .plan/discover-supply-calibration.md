# Discover supply: tell the owner the truth about how many people a day a campaign finds, and suggest enough posts to fill the invite room

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-11-15
- Locked by user: yes, 2026-11-15 (all four proposals accepted)

## Goal

Step 3 of the slow-invites work (steps 1 and 2 are PR #225). On staging campaign `01a1afe4` (Release preview 2026) the invite room was 34 a day (3 accounts) and the pool of people waiting to be invited was about 20, because Discover finds too few qualified people. The Starter (the campaign chat) promised otherwise: its constants say a post gives 15 people and 7 qualified ones ("measure in week one"), so it suggested 8 posts a day and told the owner "you will find about 120 people a day". Measured, a post gives about 10 people and 2 qualified or maybe ones. This plan puts the measured numbers in, so a new campaign starts with a suggestion that can fill its room, and says what it costs.

A good result: a new campaign's suggested posts a day is enough to fill the accounts' invite room at the measured yield, the chat sentence says what to expect and what it costs a day, and the owner of an existing campaign can see the same gap and what to change.

## Evidence (read-only look at staging, 2026-11-15)

Campaign `01a1afe4`, Discover (daily 09:00 Asia/Calcutta, 3 phrases, `postedWithin` 24h, commenters and reactors up to 50 a post, reads up to 200 profiles a run, `qualifyScore` 45, `maybeScore` 30):

| Day | Posts | People after dedupe | Qualified | Maybe | Cost (USD) |
|---|---|---|---|---|---|
| 11-10 | 14 | 122 | 22 | 5 | 0.78 |
| 11-11 | 8 | 91 | 18 | 7 | 0.60 |
| 11-12 | 8 | 38 | 11 | 0 | 0.27 |
| 11-13 | 9 | 281 | 38 | 16 | 1.36 |
| 11-14 | 8 | 11 | 2 | 0 | 0.10 |
| 11-15 | 9 | 13 | 0 | 5 | 0.12 |
| Total | 56 | 556 | 91 | 33 | 3.22 |

- Per post: about 10 people, 1.6 qualified, 0.6 maybe (2.2 together), about $0.058. The starter assumes 15 people and 7 qualified.
- Both qualified and maybe people are labelled and reach the Invite block, so the pool is about 21 a day. The room was 34 a day on 11-14.
- The yield is very uneven: a median day gives about 1.4 to 4 people a post, and one busy day (11-13) gave 31 a post. More posts smooth that out.
- `output.markPosts` ("Mark posts done") marked 0 posts on every run (`postId` is not on its input). Not part of this plan; it matters only if the window is widened, because posts would then come back.
- The invitable share of qualified people is not known yet: it was hidden by the bugs of PR #225. It is left out of the numbers until a run after that fix shows it.

Sample caution: one campaign, one ICP, one account set, six days, two of them a weekend.

## Requirements

Confirmed: the owner asked to continue with step 3 after steps 1 and 2.

Answered by the owner (2026-11-15): 1 yes (calibrate), 2 yes (cost in the sentence), 3 yes (supply line on the campaign page, in this change), 4 the owner changes the live staging campaign on the canvas (values given at the end).

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: `packages/contracts/src/recipes.ts` (`PEOPLE_PER_POST`, `QUALIFIED_PER_POST`, cost per post, the sentence), its tests, the chat text and its tests in `apps/body`, `MEMORY.md`; and, if question 3 is yes, one brain query and one card on the campaign page.
- Out of scope: changing `postedWithin`, the per-post commenter or reactor limits, new sources (people search, second-degree), automatic tuning of posts a day, the `markPosts` fault, editing any existing campaign, the invitable share, any schema or migration.

## Approach

- [x] `recipes.ts`: `PEOPLE_PER_POST = 10`, `QUALIFIED_PER_POST = 2`, `COST_PER_POST_USD = 0.06` with a comment naming the sample; `capacityOf` returns `costPerDayUsd` and its sentence says "about $X a day (measured)". `suggestedPosts` keeps `ceil(high / QUALIFIED_PER_POST)` capped at 50.
- [x] Tests first: `recipes.unit.test.ts` (`capacityOf` for 0, 3 and 5 accounts, the cap at 50, the cost), `steps.unit.test.ts` in the chat (suggested posts per account choice).
- [x] Chat: the posts question shows the new sentence; nothing else changes (the default is the suggestion).
- [x] Question 3 (yes): no new query. The campaign page already has "What your accounts can reach" fed by `campaign.insights`; it gains `capacity.waiting` (people with the campaign label, not connected, `inviteState NONE`, not Do not contact) and `capacity.discoverWorkflowId`, a fourth tile, and a note (`supplyNote`) with a link to the Discover workflow when fewer people wait than the campaign's daily share. Unit and integration tests.
- [x] `MEMORY.md`: the measured numbers and the sample caution, the `markPosts` observation, one changelog line.
- [x] Root gate: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, then `pnpm test:integration:run`.

## Edge cases and risks

- A thin sample: the constants are labelled as measured on one campaign and are meant to be re-measured; a strict ICP gives fewer qualified people a post, a loose one more. The sentence says "about".
- Cost: 17 posts a day is about $1.02 a day (about $31 a month); 50 posts about $3.00 a day. The owner sees it before accepting; the existing per-run estimate and caps are unchanged.
- Existing campaigns keep their stored answers; only new campaigns and the sentence shown while creating one change.
- The invite room is the real cap: more people than room only raises quality (the best are invited), so over-suggesting costs money, not safety. The suggestion stays capped by the room.
- Invitable share unknown: after PR #225 is live the share can be measured and the constant revised in a later small change.
- Weekend or quiet days: yield per post falls; the sentence does not promise a daily number.
- No migration, no env, no Docker or CI change; rollback is a revert.

## Verification

- Unit: contracts (`capacityOf`, the recipe answers) and body (chat steps). Root gate and the integration suite.
- Not run here: a real campaign creation in a browser (no signed-in session) and any live data.

## Outcome

Built on `fix/invite-connect-in-more`, in the same PR as the invite fix (#225). Gate green: lint, ts:check, unit (contracts, body 141 files, brain 182, spider 104), build, integration (brain 108 files, 620 tests).

- `recipes.ts`: `PEOPLE_PER_POST` 10, `FIT_PER_POST` 2 (was `QUALIFIED_PER_POST` 7), `COST_PER_POST_USD` 0.06, all labelled as measured on one campaign (2026-11-10 to 11-15). `capacityOf` returns `fit` and `costPerDayUsd` and its sentence says how many fit and what a day costs. Suggested posts a day: 3 accounts 5 to 17, 5 accounts 9 to 29, capped at 50.
- Chat: the posts question shows the sentence under the field; "Edit all fields" shows it in the hint.
- Campaign page: tile "Waiting to be invited" and a note with a link to the Discover workflow when fewer people wait than the campaign's daily share.
- Deviation: the supply line reuses `campaign.insights` instead of a new `campaign.supply` query (less code).
- For the live staging campaign `01a1afe4` (owner changes it on the canvas): open its Discover workflow and set `howMany` on the three Find posts blocks from 3 to 6 (18 posts a day, about $1.05 a day at the measured $0.058 a post). Expect about 2 people a post that fit, about 36 a day, against an invite room of about 34.
- Not run: a real campaign creation or the campaign page in a browser (no signed-in session); the measured numbers come from one campaign and six days and should be re-measured, and the invitable share (hidden until PR #225 is live) is not in them.
- Follow-ups: the `output.markPosts` step marks 0 posts on every run (`postId` is not on its input); re-measure yield and the invitable share after PR #225 is deployed; other sources (people search, second-degree) if posts alone cannot fill the room.
