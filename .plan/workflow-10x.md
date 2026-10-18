# Workflows 10x: results first, live runs, spend control, guided setup

- Status: locked
- Created: 2026-10-18
- Locked by user: yes, 2026-10-18

## Goal

Make workflows 10x better at producing qualified leads, and the experience 100x easier, judged by the five user personas. Each phase below ships as its own PR with its own detailed plan (`.plan/workflow-10x-<phase>.md`), written and locked before it starts.

## How this was found

- **Product map:** a factual map of today's screens and code (pages, canvas, block catalog, runs, lists, ICP, usage).
- **Persona reviews:** GTM engineer, founder, agency owner, sales rep and platform admin each read the map and the code, and gave their pains, 10x capabilities, UX changes and one "do not build".
- **Correction from the sales rep, checked in code:** /lists has only the All, Qualified and Maybe tabs, and no bulk selection.

## What the personas agree on

| Theme | Who asked | Their words |
| --- | --- | --- |
| Results first: a daily leads inbox, not tables | Sales rep, Founder, Agency, GTM | "New since last visit", "Monday summary", "review queue", "why 62?" |
| A score you can trust: reasons and every signal | Sales rep, GTM, Founder, Agency | "Title matches +30, size fits +20", "commented 2 days ago" |
| Live, plain run status | GTM, Agency, Admin | "Running: scoring 140 people, $1.80 so far", retry countdown, no PARTIAL or WALLET_LOW codes |
| Spend you set once | Agency, Founder, Admin | A monthly cap per client, "$38 left this month", cost per qualified lead |
| Guided setup; canvas behind "Advanced" | Founder, Agency | Goal, customer, budget and schedule in plain words |
| A tuning loop | GTM, Sales rep | Re-score a past run for free, threshold slider, cost per qualified lead per block, "not a fit" teaches |
| An editor that keeps the graph in view | GTM | Settings in a side panel, results strip under the canvas, versions |
| Operator console | Admin | Health, failures inbox, platform-wide erasure with a receipt, burn rate |

### Do not build (agreed)

- An AI "build my workflow" generator (GTM). Suggestions from known lists are fine.
- Sending or sequencing messages inside the app (sales rep). Keep it a hand-off: copy an opener, open the profile, mark Contacted.
- One list that mixes several clients' leads (agency).
- Showing clients the shared wallet (admin). They see their own cap and spend only.
- More canvas features for founders (founder). The canvas stays for power users.

## Phases (proposed order; each is one PR with its own locked plan)

### Phase 1: Leads inbox (Lists 2.0)

The biggest daily value: the sales rep, founder and agency all start here.

- **Inbox across all lists:** "New since your last visit" is the default view, with counts on each tab (New, Qualified, Maybe, Contacted, Not a fit, Do not contact).
- **One status flow:** New, Contacted, Replied, Not a fit. Qualified and Maybe become a fit filter, not a second status.
- **Score with reasons:** the breakdown is saved per person ("Title matches +30, …"). It shows as a sortable, coloured chip on each row and in full in the drawer.
- **Every signal shown:** all signals stacked with how recent they are, not only the first.
- **Triage mode:** a split view (list on the left, person drawer on the right) and keyboard keys:
   - J / K to move, Q / M / X for qualify, maybe, not a fit, C for contacted, O to open on LinkedIn.
   - D for do not contact, which still asks to confirm.
- **Bulk select and undo:** bulk select with bulk actions; undo toasts replace confirm dialogs, except for do not contact.
- **Hand-off:** "Copy opener", built from their comment or signal (a template, no AI), and "Mark contacted" with the date.

### Phase 2: Live runs in plain words

- The canvas lights up the active block with live in and out counts, the spend so far, and "retrying at 14:32".
- One status sentence per run: "Running: scoring 140 people, about $1.80 spent so far."
- Every failure is one plain sentence that opens the block on the field to fix. Raw messages from the data service never reach the screen.
- The Runs tab gets a badge when a run needs attention.

### Phase 3: Spend you set once

- A monthly cap per client, set by the platform admin only. The client sees the cap and what is left.
- A warning at 80% of the cap. At the cap only that client pauses; other clients keep running.
- The run dialog says "This run: up to $4 · $38 left this month."
- Cost per qualified lead on every run, every workflow, and every statement line. Each statement line links to the run behind it.
- The schedule form shows the cost: "Weekdays at 9am · about $6 a week · about $26 a month".

### Phase 4: Guided setup

- A wizard, offered next to the canvas, with four steps: goal (plain cards), your customer, weekly budget, and when to run. "Switch on" ends it. The canvas stays the default editor.
- "Describe your customer in a sentence" fills in suggested titles, seniority, sizes and industries, which you tick or untick. Rule-based from our own option lists; no AI.
- Plain words everywhere: "Strong fit / Maybe" instead of a score, "Runs every Monday" instead of "trigger", and no ICP, dedupe or API jargon on the simple path.
- The home page becomes a "This week" summary: new people and why, spend, and what runs next.

### Phase 5: Tuning loop

- Re-score and re-filter a past run's people for $0 after changing the ideal customer or the thresholds. Only within the 14 days run items are kept.
- A threshold slider over the last run's score distribution ("+38 qualified").
- Cost per qualified lead for each block: spend, pass rate and qualified people added.
- A preview size you choose, with its projected cost per qualified lead.
- "Not a fit" feedback: after enough rejections the app points out the pattern ("VP Finance keeps failing; exclude it?").

### Phase 6: Editor

- Block settings in a side panel instead of a modal, so the graph and the last output stay visible.
- A results strip under the canvas with the last run's people, scores and reasons, opening the person drawer.
- Version history with "what changed", tied to each run.
- "For each" is hidden from the block picker unless already used.

### Phase 7: Operator console (/admin)

- **Health:** worker, queue depth, oldest waiting item, retries, and the error rate over the last hour and day.
- **Failures inbox:** grouped by plain reason, with client, workflow and run, and "Retry now".
- **Wallet:** trend, burn rate, "about N days left", and "Top-up done" that records the amount.
- **Clients table:** spend, cap, % used, failed runs, pause and resume.
- **Erasure across clients:** enter a profile link, preview everything that will be removed, confirm, then download a dated receipt.

### Later (not planned yet)

- Agency: switching between client accounts, a library of workflows and ideal customers to copy into a client, and a read-only share link that expires. This needs a decision on how accounts and clients are modelled.
- A cache of recent reads shared across workflows (privacy and retention questions).
- Split tests between two branches.
- A digest by email or Slack.

## Requirements

Confirmed:

- Improve workflows 10x in function and 100x in UX, planned with the persona agents.
- Answered by the owner on 2026-10-18:
   - **Order:** Phases 1 to 7 as listed.
   - **One status flow:** New, Contacted, Replied, Not a fit; Qualified and Maybe only as a filter. In review becomes New, and Done becomes Contacted, through an additive migration.
   - **Score reasons:** saved when a person is scored; people scored before show "Reasons appear on the next run".
   - **Guided setup:** the canvas stays the default. The wizard is an extra option ("Set up step by step") on /workflows/new, not a replacement.
   - **Spend caps:** set by the admin only; clients see their cap and what is left.
   - **Copy opener:** a fixed template filled from the person's signal; no AI and no sending.

Open questions: none.

## Scope and non-goals

- In scope: this roadmap and the order of the phases. Each phase is planned in detail, and locked, before it starts.
- Out of scope: everything under "Do not build" and "Later".

## Approach

- [x] 1. Lock this roadmap (order and the six answers).
- [x] 2. Write `.plan/workflow-10x-phase-1-leads-inbox.md`, review it with the sales rep and founder agents, and lock it.
- [ ] 3. Build phase by phase, one PR each, re-running the persona review on the screens at the end of each phase.

## Edge cases and risks

- **Status migration:** mapping old statuses must be additive (a new column or enum values first, a backfill, and the old values removed only later), so nothing is lost and a rollback stays possible.
- **Score reasons are personal-data-adjacent:** they follow the existing retention (members reviewed after 180 days, Maybe after 30).
- **Live run counts:** polling every 3 s is enough; no websockets in Phase 2.
- **Caps:** checked when a run is queued and before each paid call in the worker, so a running job can finish but no new paid call starts over the cap.
- **Erasure across clients:** the admin acts on every client's data, so it is admin-only and audited. Whether a suppression entry may be kept is a question for counsel.
- **Wizard:** builds the same graphs as the templates, so the engine is unchanged.

## Verification

Per phase: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, the brain integration tests, and a persona re-review of the new screens.

## Outcome

Filled in when done.
