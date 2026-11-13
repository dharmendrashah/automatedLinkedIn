# Warm-up for people with a pending invite (release preview campaign)

- Status: rejected (2026-11-13, not done; owner asked to focus only on campaign-detail-insights). Was: locked <!-- draft | locked | in progress | done -->
- Created: 2026-11-06
- Locked by user: yes, 2026-11-06 <!-- change to "yes, <date>" only after the user confirms -->
- Parent: [release-preview-outreach.md](release-preview-outreach.md)
- Related: [lead-pipeline-p3-engage.md](lead-pipeline-p3-engage.md) (reactions and comments)

## Goal

People who have a pending invite from us decide whether to accept without knowing us. Warm-up makes our account visible to them before they decide (a profile visit, a reaction on their recent post, later a comment), so more of them accept.

This is a hypothesis. We have no data on it for this product yet. The warm-up stays in the campaign only if the people warmed up accept more often than the control group.

## What we warm up, and how each action is seen

| Action | What the person may see | Built? | Risk | Use |
| --- | --- | --- | --- | --- |
| Profile visit (Visit profile block, `account.visitProfile`, `linkedin-view-profile` task) | "Viewed your profile", if their privacy settings show it (not guaranteed; to verify in Phase 0) | Yes. The account can visit for up to 8 browsing hours in a window | Low | Wave 1, first |
| Reaction on their post from the last 7 days | Our name under their post; LinkedIn usually tells the post's author (to verify on a test post) | Only after the engage task is merged, deployed, and checked live on our own post | Low to medium; "Act for real" stays off until tested | After the live gate |
| Comment on their post (approved draft) | A comment in their post's thread | No (phase 4 of the engage plan) | Highest; needs approval | Not in this plan |

No message is sent during warm-up.

## Requirements

Confirmed:

- Campaign "Release preview 2026" (staging, campaign id 01a1afe4-14ee-74e5-9bd5-ac5ab671c418). The 3 Warm up workflow runs daily at T+5 hours.
- Who: people with a pending invite from our accounts, with this campaign's label, 50 per run, oldest engaged first (the recipe in `packages/contracts/src/recipes.ts`).
- Invites: 3 accounts, 16 a day each, Monday to Friday, about 480 by 2026-11-20 (parent plan). Each invite comes from the account that holds the connection.
- Reactions and comments come from the account that sent the invite (engage plan).
- Warm-up goal: they see us on their timeline and are more likely to accept the invite (owner, 2026-11-06).

Decided (owner, 2026-11-06):

- Q1. Test design: 90/10, as in the recipe. 90 percent are warmed, 10 percent are the control. The control is about 48 people, so a comparison cannot show a small gain; see Q5.
- Q2. Wave 1 actions: visits and reactions. Reactions still wait for the live gate in Phase 3.
- Q3. Comments in this program: no.
- Q4. The account that sent the invite visits and reacts, as in the engage plan.
- Q5. Success: a connection request that is accepted is a success. Daily caps per account: visits 30 a day (a guess, LinkedIn publishes no number, to check in the first week); reactions 39 to 48 a day, as in the engage plan. The 10-point rule is dropped: with a 90/10 split the control is too small to measure it, so acceptance by group is reported, not used as a pass or fail gate.
- Q6. Repeat visits: a stamp on the person. A visit sets a timestamp on the person; the Profiles input skips anyone stamped in the last 7 days.
- Q7. A person is visited at most once in 7 days (follows from Q6).

## Scope and non-goals

- In scope: who is warmed, which actions, the order of actions for one person, the test design, the daily caps, the stop rules, the measurement, and the one dedupe change the visits need (Q7).
- Out of scope: messages, comments (phase 4), any change to Invite or First message, scraping beyond the visits the platform already makes, production.

## Approach

- [ ] Phase 0 (Nov 6 to 8): lock Q1 to Q7. Check visibility with two of our test accounts: one visits the other's profile; record whether the viewed-by list shows it, with account and date.
- [ ] Phase 1 (Nov 9 to 10): dedupe for visits (Q7). Read `VisitPoolService.lastVisits` and the Profiles input filter. Add the stamp (Q6) with tests first (co-located unit and integration tests): a timestamp on the person set when a visit finishes, and the Profiles input skips people stamped in the last 7 days. Without it, a daily warm-up visits the same people every day, because visits do not update `lastEngaged`.
- [ ] Phase 2 (Nov 10 to 12): change the Warm up workflow for wave 1 (keep its schedule off until Phases 0 and 1 are done):
  - Select accounts, then Visit profile and React. Reactions run only after the Phase 3 gate.
  - Split 90/10 (Q1). The control group keeps its tag and no action.
  - Visits capped at the Q5 number per account per day.
- [ ] Phase 3 (after PR 206 is merged, deployed, and the spider worker restarted): live test on the owner's own post, one reaction with "Act for real" on, then read `engage.json` and the post on LinkedIn. If it passes, add reactions to the warmed group only.
- [ ] Phase 4 (weekly, from Nov 13): compare acceptance by group (warmed against control), reply rate, and visits and reactions counts on the campaign page against the run folders. Report acceptance by group, against the success rule (Q5). Record the numbers in the plan's Outcome.

Timing for one person, measured from the day the invite was sent:

- Day 0 to 1: profile visit (once).
- Day 1 to 5: one reaction, only if they posted in the last 7 days; the engage rule gives 1 to 2 days between acts for one person.
- Stop when they accept (the first message takes over), when they are marked Do not contact, or after 14 days without acceptance.

## Edge cases and risks

- Repeat visits: visits do not update `lastEngaged`, so the Profiles input would return the same people daily. Fixed by Phase 1; not optional.
- Person with no post in the last 7 days: visit only.
- Their latest post is a repost, a company post, or a share: skip the reaction (engage rules).
- Private or removed profile: the visit fails. Count it as a failure, do not retry forever (the visit block already caps retries).
- Two of our accounts invited the same person: only the inviter visits or reacts (engage rule).
- LinkedIn restriction: too many visits or reactions can restrict an account. Start at the Q5 caps; a restriction or sign-out stops the account's acts (existing hooks). Read the run before the next one.
- Idempotency: a re-run of the same step must not visit or react again (visit record and `PostAct` unique key).
- Invites are Monday to Friday; warm-up must run on the same days, or visits happen for people with no invite pending.
- Staging only. Nothing here goes to production.
- Data: visit and reaction rows hold names and links. No message text, no secrets, no notes in logs.
- Rollback: switch the Warm up workflow off. With "Act for real" off, the reaction block only previews.
- Visibility unverified: if visits are not visible to the viewed person, the visit step adds no value and should be removed before wave 2.

## Verification

- Phase 0: the visibility check is recorded in this plan (accounts, dates, result).
- Phase 1: unit and integration tests for the dedupe; `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Phase 3: one live reaction on the owner's own post; `engage.json` and the post checked on LinkedIn.
- Phase 4: the campaign page counts match the run folders for the same days.

## Outcome

Filled in when done: visibility result, the accept rate of warmed against control, the acceptance by group against the success rule (Q5), what broke, follow-ups (durable ones also to `MEMORY.md`).
