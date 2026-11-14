# Invite run stopped by a LinkedIn block (HTTP 999): say so, keep what was settled, and rest the account

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-11-14
- Locked by user: yes, 2026-11-14 (request: "fix this as well", session `d2c05221-ad4c-44c3-b97a-083d4127ea3c`)

## Goal

Session `d2c05221` (LinkedIn invites, account shreechand.sushi) ended "The invites could not be sent. Step 6: Could not open www.linkedin.com/in/andrenogueira3, the site answered 999." Make a block like this show up as what it is, keep what the run had already settled, and stop brain from asking the same account again a few minutes later.

## What staging showed (read on 2026-11-14, read-only)

- The run (3 min 7 s, Cloud Run job `spider-worker`) signed in fine and opened the feed. The first profile (`akinbo-ddamilola`) opened and showed a Message button and no Connect, so the task settled it as `ALREADY_CONNECTED` (nothing pressed). It then waited its 30 to 90 s gap on that page (about 88 s) and opened the second profile. LinkedIn answered HTTP 999 in 0.7 s. The kept `failure.html` is LinkedIn's 999 page, a script that redirects to `/authwall`.
- The runner turns a 999 or 429 into `VisitError('blocked')` on purpose ("the run stops; it never retries or signs in again against it"). The invite task lets it reach its catch-all, which answers the generic `ERROR` "The invites could not be sent." and throws the first profile's settled outcome away, because nothing had been pressed yet.
- Brain treats `ERROR` as "nothing pressed": all five invites went back to `QUEUED` with `tries + 1`, the account has no rest, and the next pass asked again at 15:14 UTC, 14 minutes later, against a site that had just asked the visitor to stop.
- The same account and proxy ran three invite runs earlier the same day without trouble (06:15, 07:19 and 08:55 UTC, verdict DONE). Messages, connections and the sign-in worked all day, so the account is signed in and the session is accepted. The proxy exit looks up as `ZA` while its country is recorded as United States (from the log); not proven to matter.
- Why LinkedIn answered 999 for that one visit is LinkedIn's decision (a block on the visitor, the IP or that profile). Nothing in the repo can undo it; what the repo can do is react to it correctly.

## Requirements

Confirmed (from the owner's request): fix this failure.

Decisions I made (the request leaves them open; each is easy to change):

- A new task verdict `BLOCKED`, "LinkedIn blocked a page", tone failure, for an invite run that stops because LinkedIn refused a page with 999 or 429. It replaces the generic `ERROR` in that case, before or after a press. Fixed sentence for the owner: "LinkedIn refused to open a page (HTTP 999 or 429), so nothing more was pressed."
- The run hands over its file as for `LIMIT_REACHED`: what was settled stays settled (the connected person, an invite that went before the block); the invite whose page was refused and the ones not reached are `NOT_SENT` and go back to the queue, one try counted each, as today for a run that stops early (they fail after 3 tries).
- Brain rests the account's invites for 2 hours after a `BLOCKED` run (`invitesStopUntil`), with the reason "LinkedIn refused to open a profile. Invites go on in 2 hours." The two hours are my choice: a 999 is usually temporary, and one run of up to 5 invites a day-sized batch loses little by waiting; the owner can change the constant.
- Only invites are changed. The other tasks that can meet a 999 (messages, connections, reads) keep their own handling; the runner's `blocked` rule is untouched.
- No migration, no contract change (the verdict is a task-defined code; the file schema is unchanged).

## Scope and non-goals

- In scope: `linkedinInvite/run.ts`, `answer.ts`, `index.ts` (spider), `linkedInInvite.hooks.ts` (brain), their unit tests.
- Out of scope: why LinkedIn blocked (not knowable), the proxy's country mismatch, other tasks' block handling, a per-profile block list, the earlier unusable-address fix (PR #223, separate).

## Approach

- [x] Read staging and the run's kept files (done above; no write).
- [x] Spider `run.ts`: a `VisitError` with reason `blocked` ends the run with outcome `BLOCKED` and hands over the file, before or after a press; `answer.ts` and `index.ts` give it its verdict and sentence. Update the two existing tests that expected a throw or `PARTIAL`, and add one for the first-profile-settled case.
- [x] Brain `linkedInInvite.hooks.ts`: `BLOCKED` is a handed-over verdict (not "nothing pressed"); it stops the account's invites for two hours with the sentence above. Unit test beside the existing hook tests.
- [x] Root gate, Outcome, `MEMORY.md`, commit.
- [ ] Open a PR when asked; after a deploy, check on staging that the next block shows the verdict, keeps the settled invites and waits two hours (not done: needs the deploy).

## Edge cases and risks

- A block after a press: the pressed invite's real outcome is in the file and stays; the verdict is `BLOCKED`, and if a press was unsure the run answers `UNKNOWN` as before (the existing precedence).
- A block on the Sent list (withdrawals) is treated the same: withdrawals not reached go back to `WITHDRAW_QUEUED`.
- Repeated blocks: each costs a try for the invites it did not reach, so after three blocks a stuck invite fails with "could not be sent in 3 tries"; with a 2 hour rest that is hours, not minutes.
- A 429 is handled the same as a 999 (the runner already groups them).
- `stopped()` already ends by time when `invitesStopUntil` is set, so no job or migration is needed to lift the rest.
- The brain task catalog learns the new verdict from the worker's announcement; until the new spider is deployed, brain simply never sees `BLOCKED`. An older brain given `BLOCKED` by a newer spider would treat it as a pressed run (state `UNKNOWN` until the file settles it), which is why the brain change is deployed with it.
- Rollback: revert the commit; behaviour returns to the generic error and immediate retry.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root.
- Unit tests: the spider run (blocked at the first profile, blocked after a settled profile, blocked after a sent invite) and the brain hook (rest set, file imported).

## Outcome

Shipped: a refused page (HTTP 999 or 429) now ends an invite run with the new verdict `BLOCKED` ("LinkedIn blocked a page"), before or after a press, and the run hands over its file (invite tasks `run.ts`, `answer.ts`, `index.ts`). Brain treats `BLOCKED` as a handed-over verdict (the file settles each invite; unreached ones go back to the queue with one try counted) and rests the account's invites for two hours (`BLOCKED_REST_MS`, `linkedInInvite.hooks.ts`). Tests: three spider run tests (the two existing ones changed, one added for a settled first profile) and one brain hook test. Root gate passes.

Not done: why LinkedIn answered 999 is unknown and not fixable here. A retry of the same invites started at 15:14 UTC on staging was still running when this was written (the result was not read), so whether the block lasts is not known. The fix is not deployed.

Follow-ups:
- If 999s keep coming for this account, look at the proxy (its exit address looks up as ZA while the account's proxy country is United States) and at how fast the account views profiles.
- The 2 hour rest is my number; change `BLOCKED_REST_MS` if the owner wants another.
- The other tasks that meet a 999 (messages, connections, reads) still answer the generic error; the same treatment could be given to them.
