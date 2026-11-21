# Release preview 2026: 3-way A/B/C test on invite note and first message

- Status: blocked (2026-11-22; see Outcome — the Split block's "Else" output cannot be wired through the canvas UI by any automation method tried; needs either a human doing the one drag in a real browser, or a code-level fix)
- Created: 2026-11-22
- Locked by user: yes, 2026-11-22

## Goal

Split the "Release preview 2026" campaign's invite note and first message each into 3 distinct angles (value-led, social-proof/curiosity-led, short direct ask), tag each person with which variant they got, and let the owner compare reply rate per variant later by filtering the Network page by label — no new dashboard.

## Requirements

Confirmed (owner answers, 2026-11-22):

- Scope: both the invite note (`Release preview 2026 · 2 Invite`, `withNote` branch) and the first message (`Release preview 2026 · 4 First message`) get their own independent 3-way split.
- Messages: Copilot drafts 3 different angles, not spintax variations of one message — value-led (already live), social-proof/curiosity-led, short direct ask. Each variant still uses spintax + variables internally for natural variety.
- Reply-rate comparison: manual, by filtering the Network page by campaign label + variant label (+ status `REPLIED`). No new reporting feature.
- The split is the product's existing `logic.split` block ("Split people"): a *stable* per-person share, not random per send, so a person who retries always lands in the same group — this is what makes the comparison valid.

## The pattern (verified against the code, 2026-11-22)

- `logic.split` ("Split people", `packages/contracts/src/workflow.ts`): takes anything, sends a stable share on, the rest to Else. One block only splits 2 ways; three groups need two chained splits (33% off the top, then 50% of the remaining 67%, which gives roughly 33/33/34).
- `process.tag` ("Add label"): tags everyone who reaches it; used once per variant branch with its own label (`invite-test-a/b/c`, `msg-test-a/b/c`), kept alongside the campaign's own label.
- Both are `input: 'profile', output: 'profile'`, matching `account.sendMessage` and `account.sendConnectionRequest` — this is the exact pattern already proven live in this same campaign's Invite workflow (`best` → `withNote`/`withoutNote`, each into its own "Send connection request" block), just extended from 2 branches to 3 and reused for the first message too. There is a half-built catalog entry for this (`experimentParts`, automation `A16` in `packages/contracts/src/automations.ts`) but it has no `BUILDERS` entry, so it was never wired into a one-click automation; this plan builds the same shape by hand on the canvas instead.
- Reply rate is already computed per campaign label in `campaignCounts.ts`; per-variant comparison reuses the Network page's existing multi-label filter (`labelsMode: 'all'` → Prisma `hasEvery`, `peopleFilters.ts`), no code change.

## Drafted and validated variants (2026-11-22)

Validated with `templateProblems`/`countVariants`/`renderAll` from `packages/contracts/src/template.ts`: no unknown variables, no unbalanced braces, longest variant under the block's limit.

First message (4,000 char limit):

- **Value-led** (already live, kept as variant A): 31,104 variants, longest 527 chars.
  `{Hi|Hello|Hey} {first_name:there}, {thanks for connecting|good to be connected|glad we are connected}. {We've built|We built|We have put together} something specifically for you and {company:your business}{, especially given your work as {title:a founder}|, especially given {headline:your profile}| and what you're building}: {it can help you|it's built to help you} {double|roughly double} your weekly lead pipeline and grow revenue without spending more on ads.{ Your move from {previous_company:your last role} and your focus on {top_skill:your craft} is exactly why this fits.|} {If you want|If it helps|Just say the word and} I can send over the {detailed research|full research} we did on {company:your business} along with a {lead list|ready-made list} of people who are {actually interested|genuinely interested} in {your services|what you offer}, and why.`
- **Social-proof / curiosity** (variant B): 41,472 variants, longest 336 chars.
  `{Hi|Hello|Hey} {first_name:there}, {thanks for connecting|good to be connected|glad we are connected}. We just helped a {handful of|small group of} {founders|agency owners|GTM teams} {like you|in a similar spot} {spot|find} leads on LinkedIn {they didn't know were already interested|that were already interested in what they do}, {some who turned into real clients|a few of which turned into paying clients} within weeks. {Curious|Wondering} if {company:your business} {has|is seeing} the same {pattern|opportunity}{ given your work as {title:a founder}|}. {Want me to show you what we found|Want me to share what stood out|Interested in a quick look}?`
- **Short direct ask** (variant C): 2,304 variants, longest 214 chars.
  `{Hi|Hello|Hey} {first_name:there}, {thanks for connecting|good to be connected|glad we are connected}. {Quick one|Short question}: {are you|is {company:your business}} {looking to grow|open to growing} your LinkedIn lead pipeline right now? {If so|If yes}, I have {some research|a few leads} on {your business|{company:your business}} {worth sharing|you might want to see}. {Interested|Worth a look}?`

Invite note (200 char limit, only a few sent a month per account):

- **Value-led** (already live, variant A): 72 variants, longest 139 chars.
  `{Hi|Hello|Hey} {first_name:there}, {I noticed|I came across} your work at {company:your company}{ as {title:a founder}|} and had an idea that could {grow your leads|double your pipeline}. {Would love to connect|Happy to connect|Glad to connect}.`
- **Social-proof / curiosity** (variant B): 96 variants, longest 136 chars.
  `{Hi|Hello|Hey} {first_name:there}, {we've been helping|just helped} {founders|teams} {like you|at similar companies} find leads {they didn't expect|already interested in them}. {Curious if you'd like to see how|Would love to connect and share more}.`
- **Short direct ask** (variant C): 24 variants, longest 115 chars.
  `{Hi|Hello|Hey} {first_name:there}, {quick one|short question}: {open to|interested in} growing your LinkedIn leads? {Would love to connect|Happy to connect} and share what I found.`

Labels: `msg-test-a/b/c` on the first-message split, `invite-test-a/b/c` on the invite-note split, in addition to the campaign's own `lead-release-preview-2026` label (kept automatically, not replaced).

## Scope and non-goals

- In scope: graph surgery on the two existing live workflows above (new `Split people` + `Add label` blocks, the existing single "Send message"/"Send connection request" block turned into 3, one per variant), on staging, through the app UI.
- Out of scope: a new reporting feature (owner chose manual filtering); wiring automation `A16` into a reusable one-click builder; changing the `withoutNote` branch of Invite (it sends no note, nothing to test); changing the split's 33/33/34 share; any code change (`packages/contracts`, `apps/body`) — this is workflow content, not product code.

## Approach

- [x] 1. Draft 3 angles per message/note and validate each with the real template engine (done above).
- [ ] 2. First message workflow: blocked — see Outcome. Variant A (`Split people` 33% → `Add label msg-test-a` → `Send message`, the existing value-led text) was built and confirmed correctly wired, but the `Else` output (the other ~67%) could not be connected to anything through the canvas; nothing was saved, so the live workflow is unchanged (still the single value-led message).
- [ ] 3. Invite workflow: not started, blocked by the same issue.
- [ ] 4. Reload and confirm: done for the reverted state (confirms nothing was saved).
- [ ] 5. Update `.plan/release-preview-outreach.md` and `MEMORY.md`: this plan's `MEMORY.md` entry records the limitation; the outreach plan itself is unaffected since nothing changed on the live workflows.

## Edge cases and risks

- **Automation risk**: wiring a Split block's "Else" output requires a manual drag onto the next block's input handle in the React Flow canvas (seen on `If person state`/`Fit to today's limit`: "Drag from here to take what this block did not pass on"); this is more fragile than the plain text edits done earlier in this session (which also hit stale-ref retries). Each drag will be checked with a screenshot immediately after; if a connection is missing or wrong, it is fixed or the block removed before moving on, and "Act for real" stays off throughout so a mis-wire cannot send anything.
- The campaign is live: 80+ real invites and 1 real first message have already gone out with earlier wording (see `.plan/release-preview-value-led-message.md`). Graph surgery only adds new blocks and a new fork; it does not touch or resend anything already queued. "Act for real" defaults off on any changed block, so nothing sends until the owner reviews and switches it on per block.
- 33/33/34 is approximate ("exact only on big batches" per the block's own description); fine for a first read, not a statistically powered test.
- The invite note test will fill slowly: each account gets only ~5 notes a month total, now split 3 ways, so expect a small sample for a while.
- Reply attribution: a label is stable once applied; if a person is re-invited or re-split later (e.g., list membership changes), the Split block's hash should keep them on the same side, but a changed list or added filter upstream is not covered by this plan.
- Rollback: each new block can be removed on the canvas ("Remove block and its lines"); the original single-message graph shape is documented above (variant A text) to rebuild if needed.

## Verification

- After each save: reload the workflow, reopen each new block, confirm text and "Act for real" state.
- Real path check (no sends, "Act for real" stays off): "Run a preview" on each workflow and confirm people appear to land across the 3 branches, not all on one.
- No `pnpm` commands apply (workflow content on staging, not a code change).

## Outcome

Blocked, 2026-11-22. Nothing was saved to the live workflow; it is unchanged (still the single value-led first message from `.plan/release-preview-value-led-message.md`).

What was verified to work on the canvas (`Release preview 2026 · 4 First message`):
- Inserting a new block in-line via the contextual "Add a block after X" buttons works reliably and auto-wires the new block from X's main output.
- Setting a `Split people` block's percent, an `Add label` block's labels, and a `Send message` block's text all work exactly like the earlier single-message edit.

What could not be done, after exhausting every method available in this session:
- The `Split people` block's **Else** output (the "rest", here ~67%) has no button-based way to wire it; the UI's own hint is "Drag from here to take what this block did not pass on" on a handle with `data-handleid="port:else"`.
- Tried, in order: the generic `dragElement` tool (uses HTML5 drag-and-drop events, which this app's canvas — built on `@xyflow/react`, listening for pointer events — never sees, so it silently did nothing); `runPlaywrightCode` with `page.mouse` pointer sequences (works mechanically — a connection line does appear once the handle is hovered, held, then moved — but every drop target rejected the connection): dropping on an ancestor node (correctly rejected, would be a cycle), dropping on a node that already has a predecessor (`Send message`, already fed by `Fit to today's limit`; `Add label`, already fed by `Split people`'s main output — both rejected with no change), and dropping on empty canvas (no "pick a block" prompt appears; the connection is just cancelled).
- Conclusion: every node in this product takes exactly one predecessor ("Comes from: X", always singular), and the only way to connect to a *new* predecessor-free node is to create it via "Add a block", which immediately wires it from a main output — there is no in-UI path left over for the Else output to land on. The one place this exact two-branch shape exists live (`Release preview 2026 · 2 Invite`'s `best → withNote` / `best → withoutNote`) was almost certainly produced by the Campaign Starter recipe generator (`packages/contracts/src/recipes.ts`), which emits the full node/edge graph as data, not by a person dragging in this canvas.

Not done: the 3-way split and the Invite workflow's note test (both depend on the same blocked connection); any save to either live workflow.

Options for the owner, not chosen here without a decision:
1. Do the one drag yourself in a real browser (the mechanism does work for a human, per the live Invite workflow's own existing shape) — I can give exact handle/target locations — then I finish the rest (labels, tags, message text) the same way I did for variant A.
2. Ask for a small code change instead: wire `automations.ts`'s `experimentParts` (already written, used only in its own unit test today) into a real `BUILDERS['A16']` entry, or add a brain-side mutation/script that can set a workflow's graph JSON directly, bypassing canvas dragging entirely.
3. Simplest fallback within reach today: use spintax's own top-level `{A|B|C}` picking inside the *existing single* `Send message` block (three full messages as spintax options) — loses clean per-person labels for a reply-rate-by-label comparison (spintax doesn't tag which option a person got), but needs no graph surgery at all, since it is just a text edit like the one already live.
