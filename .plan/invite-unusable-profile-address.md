# Invite runs refused as "Invalid input": one unusable profile address blocked the whole account

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-11-14
- Locked by user: yes, 2026-11-14 (request: "this session is throwing an error called invalid input, check the session on staging, what is actually the error and fix it")

## Goal

Find out why the LinkedIn invites runs of one account end with "Invalid input" on staging, and fix it so one bad invite never stops the others.

## What staging showed (read on 2026-11-14, read-only)

- Session `a20be014-ee9b-441c-9a91-727c5e05674e` (task `linkedin-invite`, account `tripti.verma`, started "automatically, after the proxy tested ok") ended `INVALID_INPUT` in 14 s: the spider's runner refused the command before opening a browser. The runner never says which field, by design (it never echoes the input), so the session page and the logs only show "The input does not match what this task expects."
- Spider worker (Cloud Run job `spider-worker`) and brain run the same code line (`sha-a925a07` for spider, `sha-0012833` for brain; the task catalog message says build a925a07); version skew is not the cause.
- In the staging database, 43 invites are open (QUEUED, SENDING, WITHDRAW_QUEUED, WITHDRAWING). Checking each against `inviteSendSchema` and `inviteWithdrawSchema` (counts and flags only, no names): exactly one fails, an invite of account `01a14ff9` (Tripti's) whose person slug contains `ç` (U+00E7). The schema accepts only `A-Za-z0-9_%-` for a profile address (so nothing else can reach a selector).
- That invite has `tries = 42` and sits in the queue with its due date in the past. Every run of the account takes the oldest five due invites, so the bad one is in every batch, the runner refuses the whole batch, brain puts all five back (`NOTHING_PRESSED` includes `INVALID_INPUT`, `tries + 1`), and the next run does it again. Other invites of that account have `tries` 16 to 30 for the same reason. No invite of the account has gone out since 13 Nov 15:00 UTC.
- Only 1 of 957 people has a slug the invite task would refuse. The other accounts have no bad invite and are not affected.

## Root cause

1. Data: a person found by a workflow list has a raw non-ASCII character in their LinkedIn slug (LinkedIn can write a profile address with an accented letter). The invite contract is stricter, by design.
2. Code: brain builds the invite command without checking it against the task's schema, and a refused run only adds one to `tries`; nothing gives up (the comment on `LinkedInInvite.tries`, "after a few it fails", is only enforced for outcomes the task reports). So one bad row starves the whole account, and the user only sees "Invalid input" without a field.

## Requirements

Confirmed (from the owner's request): read what the error is on staging and fix it.

Decisions I made (the request leaves them open):

- Before asking for a run, brain checks each invite against `inviteSendSchema` and each withdrawal against `inviteWithdrawSchema` (the same schemas the spider uses). An invite that fails is ended with a fixed sentence ("The profile address or name could not be used. Nothing was sent.", state `FAILED`); a withdrawal that fails goes back to `SENT` with a sentence that it may still be pending. The rest of the batch goes out in the same run. If nothing is left, no run is asked for.
- The spider's refusal names the fields that failed, paths only and never values (for example `send.0.slug`), so the next one is read in a minute from the session page. The runner test already proves no input value leaks.
- No guess at how LinkedIn writes an accented address: I did not verify on a real profile whether `vanityName` is raw or percent-encoded, so I do not encode the slug. The person with `ç` is not invited; this is a follow-up (below).
- No migration. The stuck invite is ended by the new check on the next run (it is due now), not by a data script.

## Scope and non-goals

- In scope: `linkedInInvite.service.ts` (`dispatchNext`) with a pure helper and unit test, the integration test, and the runner's `INVALID_INPUT` message with its unit test.
- Out of scope: how slugs are created from supplier links (many small copies of the same regex); encoding accented slugs for LinkedIn; other tasks that take a slug (`linkedin-message`, `linkedin-connections`); the `NOTHING_PRESSED` set.

## Approach

- [x] Read staging (done above; no write).
- [x] `inviteRules.ts`: `askable(sends, withdrawals)` splits the rows into those the task accepts and those it would refuse, using the contract schemas. Unit test: a slug with `ç`, a name over 200, a note over 200, and good rows.
- [x] `linkedInInvite.service.ts` `dispatchNext`: end the refused rows, send only the askable ones, and use the askable ids in `onStart` and its counts.
- [x] Integration test (needs Postgres): one bad invite and one good invite for the same account; the run is asked for the good one, the bad one ends `FAILED` with the sentence.
- [x] `runner.ts`: `INVALID_INPUT` message with the failing paths; unit test.
- [x] Root gate, Outcome, `MEMORY.md`, commit.
- [ ] Open a PR and deploy; then check on staging that the next invite pass ends the bad invite and sends the rest (not done: needs the deploy).

## Edge cases and risks

- A batch where every invite is bad: nothing is asked for and the account is not marked as waiting; the next pass finds the next due invites. No loop because the bad ones are `FAILED`.
- Two passes at once: the end-the-bad-row update is guarded by `state: 'QUEUED'`, so it only touches what is still queued; the existing `InvitesTaken` check still protects the good rows.
- Idempotent: a second call finds no bad row left.
- The sentence must be fixed text with no names or addresses (the project rule for owner-readable reasons).
- Paths in the runner message: only schema paths, never values; an unknown-key refusal names the key, which comes from the sender's own code, not from a person.
- Rollback: revert the commit; the already failed invite stays failed (state change is not undone, which is the intent).
- Staging is not touched by this change until it is deployed; the invite stays stuck until then.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root; the integration test if Postgres is up.
- After a deploy: the next invite pass for the account ends the bad invite and sends the rest; a new `INVALID_INPUT` (if any) names its field.

## Outcome

Shipped: `dispatchNext` checks every due invite and withdrawal against the contract schemas (`askable` in `inviteRules.ts`) before asking for a run; a row the spider would refuse is ended (invite: `FAILED` with a fixed sentence; withdrawal: back to `SENT`, may still be pending) and the others go in the same run; if nothing is left no run is asked for. The spider's `INVALID_INPUT` message now names the failing fields (paths only). Tests: `askable` unit tests, two integration tests that fail on the old service and pass on the new one (14 of 14 pass against local Postgres), and a runner test.

Not done: the stuck invite on staging is only ended after this is deployed. Staging was only read, nothing was changed there.

Follow-ups:
- The person with `ç` in their slug cannot be invited. Encoding the slug (`%C3%A7`) is probably right, but I did not see how LinkedIn writes `vanityName` for such a profile, so I did not guess. Check on a real profile, then normalise slugs where they are cut from a link (six copies of the same regex in brain).
- Other tasks that take a slug (`linkedin-message`, `linkedin-connections`, reply and engage) validate with the same strict slug and may refuse the same person the same way.
