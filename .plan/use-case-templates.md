# Use-case templates with cost and icon

- Status: done
- Created: 2026-10-18
- Locked by user: yes, 2026-10-18

## Goal

The "New workflow" page offers a library of ready-made templates, one per real use case. Each template card shows a few facts, at least an icon and what one run costs, so a user can pick a start without opening the canvas.

## Today (checked in the code)

- Five templates exist, plus "Start blank": engagers, problem, accounts, lookalikes, watch. They are `GOALS` and `templateGraph` in `packages/contracts/src/workflow.ts`.
- Their title, description and icon are hard-coded in `apps/body/src/pages/WorkflowNew.tsx` (`STARTS`). So the metadata lives in two places, and no card shows a cost.
- `workflow.create` builds a template with fixed sizes (`posts: 5`, `perPost: 50`) and only the ICP and time zone. Keywords, a customer link or job titles start empty, and the canvas asks for them later.
- `estimateGraph` (contracts) already prices any graph from `PRICE_MICROS`. Body has no runtime contracts dependency, so a cost must come from brain over tRPC.
- None of the templates uses the newer blocks yet: Search people, Merge, Find open jobs, domain lookup, If/Else, schedule with presets, CSV or Send via API.

## Proposal

### What every template carries (one definition, in contracts)

| Item | Example | Source |
| --- | --- | --- |
| id | `decision-makers` | contracts |
| title | "Decision makers in my market" | contracts |
| one-line description | "Searches people by title, place and company size, scores them, keeps the best." | contracts |
| icon | `UserSearch` (a lucide icon name; body maps names to components, as `block-look.ts` does) | contracts name, body component |
| use case or persona tag | Find new leads / Timing signals / Account-based / Monitor | contracts |
| cost | "about $1.40 per run", with the assumption ("25 people, full profiles of the qualified") | computed by `estimateGraph` in brain, never hard-coded |
| what you need | "An ideal customer, job titles" | contracts |
| what you get | "Qualified people in a list" / "a CSV" | contracts |

The graph builder stays in `templateGraph`. `GOALS` becomes the list of template ids, and the current five ids keep working, so the API `start` values stay compatible.

### Proposed library (11 templates; pick which ones ship)

| # | Template | Blocks (top to bottom) | Icon | Rough cost per run* |
| --- | --- | --- | --- | --- |
| 1 | People engaging with posts I choose (exists) | Posts list → commenters + reactors → dedupe → score → full profile → list | MessageSquare | ~$1.1 (5 posts × 50) |
| 2 | People talking about my problem (exists) | Find posts (keywords) → commenters + reactors → … → list | Search | ~$1.1 |
| 3 | Who works at my target accounts (exists) | Companies list → people at company (Leadership preset) → dedupe → score → list | Building | ~$1.4 (5 × 25) |
| 4 | People like my best customer (exists) | Customer profile → posts they engage with → engagers → … → list | Heart | ~$1.2 |
| 5 | Watch people I care about (exists) | Weekly schedule → profiles → their posts → engagers → … → list | UserRound | ~$0.8 a week |
| 6 | Decision makers in my market (new) | Search people (Decision makers preset) → dedupe → score → list | UserSearch | ~$0.10 per 25 |
| 7 | Companies hiring for a role (new) | Companies list → open jobs (role) → people at company (Leadership) → score → list | Briefcase | ~$0.15 + people |
| 8 | From a list of websites (new) | Websites → company → people at company → score → CSV | Globe | ~$0.004 a site + people |
| 9 | My competitor's audience (new) | Competitor company posts → commenters + reactors → dedupe → score → list | Swords or Target | ~$1.0 |
| 10 | New in their job (new) | Weekly schedule → Search people (changed jobs) → dedupe → score → list → Send via API | Sparkles | ~$0.10 per 25 a week |
| 11 | Engaged with me and my competitor (new, uses Merge) | My posts + competitor posts → engagers on each line → Merge ("every line") → score → list | Merge | ~$2.0 |

*The numbers are placeholders. The real figure is computed from the template's default sizes when the page loads.

### How it looks

- The New workflow page gets cards in a grid, grouped by use case (tabs or chips to filter), plus "Start blank".
- Each card shows the icon, title, one line, a cost badge ("about $1.10 a run" or "about $0.40 a week"), and small "needs" and "gives" lines.
- The choice is still name, then template, then the canvas. Unchanged.

## Requirements

Confirmed:

- Templates for real user use cases, each with a cost and an icon.
- Answered by the owner on 2026-10-18:
   - A card shows the icon, title, one line, cost, use-case tag, what you need and what you get. Nothing more.
   - All 11 templates ship.
   - Cost is per run at the default sizes.
   - Today's flow stays: the canvas asks for a template's inputs.
   - Cards are grouped by use case: Find new leads, Timing signals, Account-based, Monitor.
   - Built-in templates only.

Open questions: none.

## Scope and non-goals

- In scope:
   - A template catalog in contracts (metadata, graph, icon name).
   - A tRPC `workflow.templates` query that returns the metadata and computed cost.
   - The New workflow page cards.
   - The new templates the owner picks.
   - Tests.
- Out of scope:
   - User-made or shared templates.
   - A template marketplace.
   - Changing block behaviour.
   - Wallet or billing changes.

## Approach

- [x] 1. Lock this plan (answers above).
- [x] 2. Contracts, tests first:
   - `TEMPLATES` catalog (id, title, summary, icon name, tag, needs, gives, default options) next to `templateGraph`.
   - The new graphs.
   - A test that every template graph validates with no errors once its required inputs are given, and that no text names the data supplier.
- [x] 3. Brain:
   - `workflow.templates` returns the catalog plus `estimateGraph` for each, with assumptions spelled out.
   - `workflow.create` accepts the new ids (and the inputs, if question 4 says so).
   - Tests for both.
- [x] 4. Body:
   - `WorkflowNew` reads the catalog from the query instead of `STARTS`.
   - An icon-name map, cost badge, grouping, and optional input fields.
- [x] 5. Verify (all gates, the page in a browser if possible), MEMORY.md, Outcome.

## Edge cases and risks

- **Cost depends on inputs that are unknown at pick time** (how many posts, how many comments a post gets). The badge must say it is an estimate at the default sizes, and the canvas estimate stays the real check before a run.
- **"All" settings or big defaults could make a scary or wrong number.** Templates use "Up to N" defaults; none uses "All".
- **Scheduled templates:** a per-run cost can mislead. Show "a week" or "a month" for them (question 3).
- **Prices change:** cost is computed from `PRICE_MICROS` on each request, never stored in the template.
- **Old API callers** send `start: 'engagers'` and similar. Those ids stay valid.
- **Body bundle:** icons are names, so contracts stays React-free. An unknown name falls back to a generic icon.
- **Vendor name:** template text is part of the supplier-name guard test.
- **Templates that need an ICP:** none exists for a new user. The Score block already asks for one on the canvas, and the card says "needs an ideal customer".
- **Search people bills in pages of 25:** template defaults use 25 or 50 so the estimate is honest.
- No migration and no new env vars, so Docker and CI are unaffected. Rollback is a revert.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, plus the brain integration tests.
- Each new template is created through `workflow.create` and run once with the fake data service.
- The New workflow page is checked in a browser if one is available.

## Outcome

Shipped:

- **Contracts:**
   - The 11 templates as `GOALS`; the old five ids are unchanged. New ids: `decisionMakers`, `hiring`, `websites`, `competitor`, `newInJob`, `sharedAudience`.
   - `templateCatalog()` (title, summary, lucide icon name, use case, needs, gives, the sizes the cost assumes, `costMicros`) and `USE_CASES`.
   - `TEMPLATE_NUMBERS` moved here from brain.
   - "Who works at my target accounts" now keeps leaders (seniority director and up).
- **Brain:** `workflow.templates`.
- **Body:** the New workflow page reads the catalog and shows cards grouped by use case. Each card has an icon, an "Up to $X a run" badge, a use-case badge, and Needs, Gives and "Cost for" lines.

Costs at the starting sizes, as the most one run can spend (every engager counted and read in full):

| Template | Up to a run |
| --- | --- |
| engagers | $3.00 |
| problem | about $3.0 |
| accounts | $2.00 |
| lookalikes | $6.02 |
| watch | $9.03 |
| decision makers | $0.20 |
| hiring | $4.00 |
| websites | $1.44 |
| competitor | $3.01 |
| new in job | $0.10 |
| shared audience | $3.01 |

Deviations:

- "Engaged with me and my competitor" uses commenters only on each line, so the "every line" Merge compares two lines, not four.
- The competitor comes from the companies list, because the companies input has no link field.

Verified:

- `pnpm lint`, `ts:check`, unit tests and build all pass.
- Brain integration: 69 pass. A new test runs all 11 templates to SUCCEEDED with the fake data service.

Not verified:

- The page in a browser.
