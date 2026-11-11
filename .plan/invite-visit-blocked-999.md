# Invite run stops on a LinkedIn 999 profile block

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-11-11
- Locked by user: yes, 2026-11-11 <!-- change to "yes, <date>" only after the user confirms -->

## Goal

A LinkedIn HTTP 999 (block) on a profile visit ends the whole invite run as `ERROR` and leaves the rest of the list unattempted. Keep `ERROR` as the verdict, but record the block clearly, stop pressing invites in that run, and let a later scheduled run continue the list after a cooldown. Also record a profile with Message and no Connect as `ALREADY_CONNECTED`, not `NO_CONNECT`.

## Requirements

Confirmed:

- Staging run `abc5ddeb-f81a-4972-ba39-76d3f198adff` (account tripti.verma@elitale.com, US proxy exit 72.244.57.185): `/in/caseycopeland/` and `/in/chase-lacewell-893a95a9/` loaded with no Connect button, then `/in/corey-clark-strategist/` answered HTTP 999, and the task ended `ERROR` ("The page did not load") at step 4.
- Root cause in code: `CamoufoxDriver.goto` throws `The site answered 999` for any status of 400 or more (`apps/spider/src/scraping/camoufoxDriver.ts:1041`). `runner.ts:687` turns that into `VisitError('load')`. `linkedinInvite/run.ts` rethrows any error before the first press (`run.ts` catch block near line 737), so the task ends `ERROR`.
- The runner already states the rule: "A block or a rate limit from the site is respected, never worked around" (`camoufoxDriver.ts:1040`).
- `no-connect-1.html` (Casey Copeland) shows `Message` and `Follow` in the profile header and no Connect control. This matches a 1st-degree connection, not a missing parser rule.
- The `failure.html` link opens a LinkedIn authwall JavaScript redirect (`/authwall?...`). That is a sign-in state, separate from the 999.

User answers (2026-11-11):

- Block outcome: keep `ERROR` as the verdict for a block.
- A profile with `Message` and no Connect: new `ALREADY_CONNECTED` outcome.
- Retry the same person in the run after a block: no.
- Pacing: wait 5 seconds after each invite, then open the next profile.

Open questions: none. Decided by the user on 2026-11-11:

- After a 999 block: record the block, press no more invites in this run, and continue the list in a later scheduled run after a cooldown. The re-login and feed-scroll recovery is not built (it works around the block).
- Block verdict: `ERROR`.
- `Message` with no Connect: new `ALREADY_CONNECTED` outcome.
- No retry of the same person in the run.
- Pacing: wait 5 seconds after each invite, then open the next profile.

## Scope and non-goals

- In scope: classify a 999 (and 429) on a profile visit as a block in the run (verdict `ERROR`, block recorded, no further presses in that run); pace invites with a 5-second pause; add `ALREADY_CONNECTED` to the invite outcome and contract.
- Out of scope: changing the proxy, rotating IPs, using a different browser profile, re-login or feed-scroll recovery after a block (this works around the block and is not allowed by the project's rules). Out of scope: the authwall sign-in path (already handled by `isSignedOutPage`).

## Approach

- [x] Confirm the open questions with the user and mark the plan `locked`.
- [x] Add a `blocked` reason to `VisitError` and throw it from `CamoufoxDriver.goto` (as `SiteRefused`) only for status 999 or 429; other statuses keep the `load` path.
- [x] In `linkedinInvite/run.ts`, a block before the first press rethrows and ends the run `ERROR` (`linkedinInvite/index.ts`), with nothing pressed, so the invites stay queued. A block after a press keeps the existing `attempted` path (PARTIAL, handover). Deviation: the remaining invites are not marked `NOT_ATTEMPTED`; brain returns them to the queue.
- [ ] Pace the list: 5 seconds after each invite. Not done: the owner gap `INVITE_LIMITS.gapSeconds` (30 to 90 s) stays. Open question, see Outcome.
- [x] `ALREADY_CONNECTED` already exists in `INVITE_SEND_OUTCOMES` and brain's `inviteRules.ts`, so no contract bump. Deviation from the plan.
- [x] Parse `Message` with no Connect as `ALREADY_CONNECTED` in `inviteReader.ts` (`parseProfileActions`, `messaged`); `sendOne` returns it without a press.
- [x] Unit tests: Message without Connect gives ALREADY_CONNECTED with no press; a 999 before any press rejects with reason `blocked` and no connect; a 999 after a send gives PARTIAL, no further connect, a warning. Not written: the 404 case and the 5-second pause case.
- [ ] Cooldown for the later scheduled run: not built. No value was given. Open question, see Outcome.
- [ ] Update `MEMORY.md` and the Outcome section; run the definition of done (done locally, passed; the commit is not yet made).


## Edge cases and risks

- A 999 right after a press: already handled by `attempted` (the run returns the current result and warns). Keep that path; do not press again.
- A 429 or 999 on the first profile of the run: nothing sent yet, so the run ends `ERROR` with zero sent and the block recorded, not a generic load error.
- An account block (LinkedIn restriction) is different from a page block; `Restricted` already covers it. Do not merge them.
- Retries: no in-run retries, to avoid pushing the account harder. A later scheduled run is the only retry.
- Idempotency: a blocked person must not be marked `SENT`; the next run must see them as not yet invited.
- Existing data: `invites.json` contract changes need a version bump (`INVITES_CONTRACT_VERSION`) and a check that the brain side still parses old runs.
- Security and secrets: do not log the proxy address or cookies in the new message. The `failure.html` and `input.json` links are signed and expire; do not commit them.
- Dev vs staging: staging has a US proxy exit that LinkedIn may block more often. The fix does not change the proxy.
- Rollback: revert the commit; the old `ERROR` path returns.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root.
- Unit tests in `apps/spider/src/tasks/linkedinInvite/` and `apps/spider/src/linkedin/inviteReader.unit.test.ts`.
- Staging: run one invite job with a known block and confirm the session shows `ERROR` with the block recorded and the rest not attempted; confirm a profile with Message shows `ALREADY_CONNECTED`.

## Outcome

Status stays `in progress` until the user answers the open questions below.

Shipped (uncommitted until the user confirms the commit): a `blocked` `VisitError` for HTTP 429 and 999 (`SiteRefused` in `scraping/errors.ts`, mapped in `tasks/runner.ts`); a `Message` link with no Connect becomes `ALREADY_CONNECTED` with no press (`inviteReader.ts`, `linkedinInvite/run.ts`); unit tests as above. Definition of done passed locally: `pnpm lint`, `pnpm ts:check`, `pnpm test:unit:run` (brain 1867, spider 1429) and `pnpm build`. Not run on staging.

Deviations from the plan:
- Pacing: the plan says 5 s after each invite. The owner gap is 30 to 90 s (`INVITE_LIMITS.gapSeconds`, shared with brain). Kept as is.
- Cooldown: no cooldown exists. A retry happens at the next scheduled run, which may hit the block again.
- `ALREADY_CONNECTED` needed no contract change.
- Remaining invites are not marked `NOT_ATTEMPTED`; they stay queued.

Open questions:
- Pacing: keep 30 to 90 s between invites (recommended), or 5 s?
- Cooldown: how long a later run waits after a block?
- Casey Copeland and Chase Lacewell: are they 1st-degree connections? A profile with Message and no Connect may also be a non-connection on some layouts.

Cause of the 999 (proxy exit, request rate or session) is unknown.
