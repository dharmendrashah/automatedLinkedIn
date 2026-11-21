# Release preview 2026: follow up with non-repliers before handing off

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-22
- Locked by user: yes, 2026-11-22 (3 follow-ups, front-loaded spacing, Hand off pushed out, messages drafted by me, this campaign only)

## Goal

Someone who accepted the invite and got the first message, but never replied, currently goes silent for just
`CAMPAIGN_LIMITS.silentDays` (4) days before this campaign's "5 Hand off" stage exports them to CSV and stops writing
to them on LinkedIn. Send them 3 more messages over about a month instead, each with a different piece of useful
content (a "lead magnet"), to give them more real chances to reply before giving up on them.

## Requirements

Confirmed (from the existing product and this campaign, read on staging before drafting this plan, and from the
user's answers to the open questions below):

- The campaign `01a1afe4-14ee-74e5-9bd5-ac5ab671c418` ("Release preview 2026") has 6 workflows: Discover, Invite, Warm
  up, First message, Hand off, No answer. "Hand off" (not "No answer") is the one for people who got a first message
  and went silent; it fires at `lastSent` olderThan 4 days, `waiting: true` (we wrote last, no answer came), and tags
  them `handed-off` so it only ever happens once per person.
- A person's `waiting` fact already means exactly "we wrote last and they have not answered" — set by the reply
  pipeline, not something this work needs to compute itself. `lastSent` is the date of the *most recent* message sent
  (first message or any follow-up), so each stage's "olderThan N days" is the gap since the *previous* touch, not a
  cumulative count from the very first message.
- `account.sendMessage`'s `notAgainHours` (max 720 = 30 days) stops the *same* Send message block from repeating its
  own text to the same person too soon; it does not help with sending 3 *different* messages, which need their own
  blocks/workflows with their own text.
- **3 follow-ups**, front-loaded (closer together at first, tapering off): follow-up 1 at 5 days of silence since the
  first message, follow-up 2 at 7 more days (12 days total), follow-up 3 at 12 more days (24 days total).
- **"Hand off" is pushed out**, not left at day 4: it should only fire after follow-up 3 also goes unanswered, using
  the same 4-day grace period as today, so its new threshold is 4 days of silence *since follow-up 3*
  (`lastSent` olderThan 28 days overall, gated on having the follow-up-3 label), not from the first message.
- **Messages drafted by me**, value-led, a different angle each time, no booking link (validated against
  `packages/contracts/src/template.ts`, see Approach step 2 for the exact text):
  1. Day 5: give them the promised research anyway, no pressure to reply.
  2. Day 12: a benchmark/social-proof angle (reply-rate lift other teams are seeing).
  3. Day 24: a low-friction last touch (just send the list, no call needed) and a clean close either way.
- **This campaign only**, built live on its workflow canvases the same way the earlier message edits were — not a
  `recipes.ts` code change, so this is not reusable for future campaigns yet.

Open questions: none.

## Scope and non-goals

- In scope: 3 new daily-triggered workflows for this campaign ("7 Follow up 1", "8 Follow up 2", "9 Follow up 3"),
  each reading people who are `waiting`, have had `lastSent` at least that stage's number of days ago, have the
  previous stage's label (stages 2 and 3 only) and do not yet have this stage's label, a safety re-check that they
  still have not replied right before sending, the stage's message, then tagging them so the same person is never
  sent the same follow-up twice; raising "5 Hand off"'s day threshold from 4 to 28 and gating it on the follow-up-3
  label so it only fires once all 3 follow-ups are exhausted.
- Out of scope: changing how "replied" is detected, changing invite-side behaviour (Invite/Warm up/No-answer
  workflows), any new block type (everything needed — If, input-filter dates, Send message, Add label — already
  exists), making this a reusable `recipes.ts` pattern (this campaign only, for now).

## Approach

- [x] 1. Confirm current "5 Hand off" config on the canvas (its `input.profiles` filters) before changing it, so the
  edit is additive (raise `days`, add the follow-up-3 label to `labels`) and not a guess from the recipe source.
- [x] 2. Messages (already drafted and validated, `templateProblems` clean, well under 4000 chars):
  - FU1 (day 5): "Hey {first_name:there}, following up on my last note. {I went ahead and pulled|I put together} the
    research on {company:your business} anyway, revenue and lead pipeline angle included, {no need to reply if now is
    not a good time|happy to send it over either way}. {Want me to share it|Should I send it across}?"
  - FU2 (day 12): "{Quick one|One more thing} on {company:this}: teams in our release preview are seeing their reply
    rate {go up two to three times over|roughly double from} where it was, just from the lead list alone. {Figured
    it was worth another nudge|Wanted to flag it in case it is useful}. {Still happy to send the research your
    way|The offer to share what we found still stands}, {first_name:no pressure either way}."
  - FU3 (day 24): "{Last one from me on this|Closing the loop here}, {first_name:hi again} — {if it is useful I can
    just send the lead list and research for {company:your business} over, no call needed|I can drop the lead list
    and research straight into a message, no call required}. {If not, all good, and good luck with {company:the
    business}|Either way, best of luck with what you are building}."
- [x] 3. Build "7 Follow up 1": schedule trigger → `input.profiles` (this campaign's label, `waiting: true`,
  `dateField: 'lastSent'`, `added: 'olderThan'`, `days: 5`, `withoutLabels: ['followup1-sent']`) → `logic.ifPerson`
  ("They replied" is no, as a last-second safety re-check) → `account.sendMessage` (FU1 text, Act for real off) →
  `process.tag` (`followup1-sent`).
- [x] 4. Build "8 Follow up 2": same shape, `days: 7`, `labels: ['followup1-sent']` added, `withoutLabels:
  ['followup2-sent']`, FU2 text, tags `followup2-sent`.
- [x] 5. Build "9 Follow up 3": same shape, `days: 12`, `labels: ['followup2-sent']` added, `withoutLabels:
  ['followup3-sent']`, FU3 text, tags `followup3-sent`.
- [x] 6. Edit "5 Hand off": raise `days` from 4 to 28, add `labels: ['followup3-sent']` (alongside the campaign label
  it already filters by) so it only fires once all 3 follow-ups are exhausted.
- [x] 7. Leave "Act for real" off on every new Send message block; confirm it is off after saving (same behaviour
  confirmed earlier this session: changing a block's own text switches it off).
- [x] 8. Update `MEMORY.md`.

## Edge cases and risks

- A person who replies between when the daily filter runs and when the send actually happens: `waiting` is read fresh
  by the filter each run, so a reply before the *next* day's run stops further follow-ups; a reply in the few hours a
  run takes to go through accounts is the same small window every other stage already has (first message, hand off),
  not a new risk this work introduces.
- Running several campaigns at once: this is scoped to this campaign's own label, so it does not touch people in
  other campaigns.
- The campaign is **not idle** (123 found, 94 qualified, 80 invited, 31 accepted) — any new Send message block starts
  with "Act for real" off by default (and stays off until a human switches it on), so nothing goes out until the
  owner reviews a preview first.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` only if this becomes a `recipes.ts` code change
  (the "reusable pattern" answer above); a this-campaign-only build is a live workflow-canvas edit, verified the same
  way the earlier message edits were (reload, re-check edges/config, confirm Act for real is off).
- Verified live on staging: each of the 3 new workflows reloaded and re-checked after saving; node summaries on the
  canvas show the exact filters set ("labelled lead-release-preview-2026 and followup1-sent · not followup2-sent"
  etc.); all 3 Send message blocks show "Act for real is off" in the workflow's own warning panel; "5 Hand off"
  reloaded and shows "labelled followup3-sent · not handed-off · 2 more filters" with Days = 28.

## Outcome

Shipped as 3 new workflows plus one edit, all live on staging, built directly on the canvas (no code change):

- **"7 Follow up 1"** (`01a20011-7f4d-704d-b805-44134d48f22e`): On a schedule (daily, 9:00 AM Calcutta time) →
  Profiles (My network, Waiting for a reply, `lastSent` olderThan 5 days, with `lead-release-preview-2026`, without
  `followup1-sent`) → If person state (They replied = no) → Select accounts (every signed-in account, parallel
  predecessor of Send message, by design — see Technical details in session history) → Send message (FU1 text, Act
  for real off) → Add label (`followup1-sent`, newly created) → Export to CSV. Scheduled and running.
- **"8 Follow up 2"** (`01a2001b-2012-772b-8e3f-102f39f770af`): same shape, Profiles filters on `days: 7`, labels
  `lead-release-preview-2026` AND `followup1-sent` (Match: All of these labels), without `followup2-sent`; FU2 text;
  tags `followup2-sent`. Scheduled and running.
- **"9 Follow up 3"** (`01a2001d-24bf-737b-b4ec-4c78217d2afc`): same shape, `days: 12`, labels
  `lead-release-preview-2026` AND `followup2-sent`, without `followup3-sent`; FU3 text; tags `followup3-sent`.
  Scheduled and running.
- **"5 Hand off"** (`01a1afe4-1591-77b5-8886-fcc1c7e12ad1`): edited in place — Days raised from 4 to 28, `With
  labels` now also includes `followup3-sent` (alongside the existing campaign label filter inside the nested Filters
  dialog), so it only fires once all 3 follow-ups are exhausted. Already-scheduled and running.

Deviations / notes:

- The "add a block before X" canvas action does not rewire the existing edge; each Send message block ended up with
  Select accounts as a parallel predecessor rather than a serial one. Confirmed by reading `accountPool.ts` that this
  is harmless (the block is a pure graph-ancestor + static-config lookup, not an item-flow dependency) — same pattern
  already used by "7 Follow up 1" and accepted earlier in this session.
- FU1's schedule time (9:00 AM Calcutta) was left as the default rather than matched to the campaign's other
  NY-time workflows; purely cosmetic, not corrected.
- No code changes, so `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` were not required and were not
  run for this piece of work.
- Follow-up: since FU2/FU3 filter on labels that nothing has yet (nobody has `followup1-sent` until FU1 actually
  runs), today's "0 profiles match" status on those two workflows is expected, not a bug — recheck after a few days
  once FU1 has run.
