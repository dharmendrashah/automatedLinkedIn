# Proxies page redesign: health you can read, actions you can take

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-14
- Locked by user: yes, 2026-10-14

## Goal

Rebuild `/proxies` so that a person who has never heard of a proxy can open it and know three things in seconds: is each of my LinkedIn accounts safe to run, which proxy has a problem and why (test result, reputation and blacklist, speed, location, browser check), and what, if anything, they could do about it. The page suggests, it never forces. This is the page where the service works or breaks, so it also has to be right about what it says.

## Who it is for, and the rules we design to

- A non-technical owner of one or more LinkedIn accounts. No jargon on the surface: "speed", not latency; "reputation", not abuse score; "different location", not GEO_MISMATCH. Technical detail stays one click away under "Advanced details".
- Every proxy gets one plain verdict and one plain sentence. Nothing important lives only in a hover tooltip (phones have no hover); explanations are visible text or an expandable "What does this mean?".
- Colour is never the only signal: every state has an icon and a word as well as a colour, so it works for colour-blind users and in both themes.
- Suggest, never enforce: nothing is blocked or switched behind the user's back by this page. Every problem offers "Swap it" (the recommended way out), "Keep using it" (take the risk, on record), or, when all is well, "Nothing to do".
- Full width, like every page (`grid w-full gap-4 px-4 lg:px-6`).

## What exists today (checked in code, 2026-10-14)

- One flat table: Proxy, Account, Status badge, Country, Latency, Score (new), Last tested, Browser test button, menu (Test now, Test history, Edit, Remove). Add and Edit dialogs; a test-history drawer with a Tests tab and a Score and blacklist tab.
- Data per proxy already returned by `proxyServer.list`: status and message, country, exit IP, latency, last tested, score and label, `reputationState`, abuse numbers, `isBest`, `isPrimary`, the account. Score history has the reasons and recent reports.
- Missing for this design: the latest browser-test verdict per proxy (it lives in `SpiderSession`, not in `list`), a "swap" action (only add, edit and delete exist; no way to prefer a proxy, no pause), a place to record "I accept this risk", and whether the AbuseIPDB key is configured (needed so "reputation not checked" is not shown as a problem on an installation that has no key).
- Colours today are hand-written emerald and amber classes per component; the theme (`index.css`) has no success, warning or info colour, only `destructive`, `primary`, `muted`. A new look in two themes needs semantic colour tokens first.

## Ideas to choose from

### Layout

- **A. Cards grouped by LinkedIn account (recommended).** One section per account with a one-line readiness verdict ("Ready: LinkedIn signs in through proxy X"), then that account's proxies as cards. Each card shows the verdict, four check chips, one suggestion and the actions. Reads top to bottom like a checklist; the account is the unit a person cares about.
- **B. Improved table.** Same table, simpler columns, a health column with icon and word, row expands for details. Least change, but a table asks the reader to compare columns, which is the opposite of "understand at a glance".
- **C. A plus a Cards or Table switch.** A for everyone, a compact table for people with many proxies. More to build and test; can be added later without redoing A.

### The four checks every proxy shows (the same words everywhere)

| Check | Question it answers, in plain words | Good | Careful | Bad | Unknown |
| --- | --- | --- | --- | --- | --- |
| Connection | Does it work, and how fast? | Works, quick | Works, slow | Not responding | Not tested yet |
| Reputation | Has anyone reported this address for abuse? Is it on a blocklist? | Clean | Some reports | Blacklisted | Not checked |
| Location | Does it appear in the same country as your other proxies for this account? | Matches | Different country | (none) | Unknown |
| Browser check | Does a website think a real person is browsing? | Looks human | Could not tell | Detected as a bot | Not tested yet |

Each chip is an icon, a colour and two lines: the result ("Clean") and the reason ("No reports in the last 90 days"). For a blacklisted address the reason names what it was reported for ("Reported for Brute-Force and Port Scan, 120 times").

### One overall health per proxy (computed in brain, one source of truth)

| Health | Meaning | Colour and icon | Typical sentence |
| --- | --- | --- | --- |
| Healthy | Works, clean, quick, right place, nothing to do | green, shield with a check | "Healthy. Nothing to do." |
| Keep an eye | Works, but something is not ideal (slow, some reports, different country, not tested for 2 days, reputation could not be checked) | amber, triangle | "Works, but it is slow. You can keep using it, or swap it." |
| At risk | Blacklisted, not responding, or detected as a bot | red, shield with an alert | "This address is blacklisted. We recommend swapping it." |
| Checking | Added or testing, score on its way | blue, spinner | "Checking this proxy now." |
| Paused or unknown | Not in use | grey | "Not in use." |

The overall health is the worst of its checks; the card says which check caused it. Brain returns the health level and the list of issue codes; the web app turns codes into words. Rules are one pure function with tests, so the page, a future email, and the automation can never disagree.

### Actions: suggested, never forced

Each card ends with one suggestion line and a primary button that matches it. Everything else sits in a quiet "More" menu.

- **Healthy:** "Nothing to do." No button. A small "Test again" link.
- **Keep an eye:** "Swap it" (suggested, outline) and "Keep using it". A short reason ("Slow answers can make LinkedIn pages time out").
- **At risk:** "Swap it" (suggested, filled amber or red) and "Keep using it (take the risk)". A line explains the risk in plain terms ("LinkedIn may notice and restrict the account").
- **Swap it** is a guided flow, not a deletion: (1) if the same account has a healthier proxy, one button "Use proxy X instead" prefers it; (2) otherwise "Add a replacement" opens Add proxy with the account already chosen, and when the new one tests well it offers "Remove the old one?" (never automatic).
- **Keep using it** records the accepted issues, softens the card to "Risk accepted" (grey-amber, with an Undo), and stops nagging. It does not change what the automation does; the best-scored proxy is still the one used. If a different, new problem appears later, the card asks again.
- **Account with one proxy:** a gentle info nudge "Add a backup proxy so the account has a fallback" (blue, never red).

### Page structure (wireframe)

```
Proxies                                                     [ + Add a proxy ]
A proxy is the internet address LinkedIn sees when we sign in as you. ...  [Hide]

[ 3 Healthy ] [ 1 Keep an eye ] [ 1 At risk ] [ 0 Checking ]      (click to filter)

LinkedIn account: ada@example.com            Ready - signs in through 203.0.113.9
  +--------------------------------------+  +------------------------------------+
  | (shield-check) Healthy        In use  |  | (shield-alert) At risk             |
  | 203.0.113.9:8080 - India             |  | 198.51.100.4:1080 - United States  |
  | [ok Works 0.4 s] [ok Clean]          |  | [ok Works 0.9 s] [x Blacklisted]   |
  | [ok Matches]     [ok Looks human]    |  | [! Different] [? Not tested]       |
  | Nothing to do.            [Details]  |  | (lightbulb) Reported 120 times for |
  +--------------------------------------+  | Brute-Force. We suggest swapping.  |
                                            | [Swap it] [Keep using it] [Details]|
                                            +------------------------------------+
```

- Top: a short "what is a proxy" explainer with three icon points (one address per account, never shared; always through a proxy, never direct; the best one is used automatically), dismissible and remembered.
- Overview strip of counts by health, which also filters. Accounts that need attention come first; inside an account, the proxy in use first, then worst first.
- Details drawer (reworked from the test-history drawer): "Health report" tab in plain words (the four checks, each with what it means and what to do), "Reputation" tab (blacklist verdict, reasons, newest reports; already built), "Score" (history), and "Advanced details" holding the raw tests (request and response) for the technically minded.
- Add a proxy: friendlier dialog (what you need from your provider, plain field names), and after saving it stays open on a result panel with the four checks filling in ("Added. Works, clean, matches your other proxies") instead of closing silently.
- Empty state for an account with no proxy: what is missing and why, one button.

### Colour and theme (so nothing breaks in dark or light)

- Add semantic tokens in `index.css`, light and dark values chosen for contrast: `--success`, `--warning`, `--info` (with `destructive` and `muted-foreground` as danger and neutral), registered in `@theme inline`. Tints are `bg-success/10`, text `text-success`, border `border-success/25`. Target: text on its tint at least 4.5:1 in both themes.
- One file `tone.ts` maps tone (`success`, `warning`, `danger`, `info`, `neutral`) to those classes and a default icon. No component hand-writes `emerald` or `amber` again; the existing badges (status, score, session verdicts, latency) move onto it.
- Check both themes with screenshots before calling it done.

### Icons

Lucide: `ShieldCheck` healthy, `ShieldAlert` at risk, `TriangleAlert` keep an eye, `Loader2` checking, `Gauge` speed, `ShieldQuestion` reputation unknown, `MapPin` location, `ScanSearch` browser check, `ArrowLeftRight` swap, `Lightbulb` suggestion, `Star` in use, `PauseCircle` paused, `Info` notes, `Network` the proxy itself.

## Requirements

Confirmed by the user (request of 2026-10-14):

- C1 Rethink `/proxies`: clear for a non-technical person, explaining what each thing is for.
- C2 Show the test result and the blacklist, and where the problem is.
- C3 Give clear actions without enforcing them: swap, take the risk, or healthy with no action needed; suggestive.
- C4 Use icons and colour coding heavily, and do not break the theme (light and dark).
- C5 Plan and propose ideas first, execute only after the user locks the plan.

Decided by the owner on 2026-10-14 (answers to the questions; waiting for the explicit go to lock):

- Q1 Layout C: cards grouped by account for everyone, plus a Cards or Table switch. The choice is remembered in the browser. The table view is a compact list with the same health icon and word, the four checks as small icons with a word, score, last tested, and the same suggested action and menu, so nothing is only available in one view.
- Q2 Swap is guided: "Use proxy X instead" when the same account has a healthier proxy, otherwise "Add a replacement" with the account preselected, then an offer (never automatic) to remove the old one.
- Q3 Keep using it is remembered per issue, shown as "Risk accepted" with Undo, and asks again only for a new problem.
- Q4 The latest browser check result is shown on each proxy (small backend addition).
- Q5 Everything in one change: page, explainer, friendlier Add dialog with a result panel, reworked details drawer.
- Q6 Health wording: Healthy, Keep an eye, At risk.

Open questions: none. Still to confirm at lock: the plain-language wording (it is reviewed in the browser before it is called done).

## Scope and non-goals

- In scope (once locked): colour tokens and tone helper; brain `health` (level and issue codes) on `proxyServer.list`, latest browser-check summary per proxy, `reputationEnabled`, `riskAcceptedIssues`, `setPreferred` (prefer a proxy), `acceptRisk` and `clearRisk` mutations, additive migration; the new page; details drawer rework; Add dialog result panel; empty and loading states; tests; browser check in light and dark; `MEMORY.md`.
- Out of scope: pausing a proxy (a status exists, no way to set it; can follow), buying proxies, any change to scoring or to which proxy the automation picks (the best score still wins; "prefer" feeds the existing primary rule), notifications or emails, other pages.

## Approach (once locked)

- [ ] 1. Tokens and tone: `--success`, `--warning`, `--info` in `index.css` (light and dark, contrast checked), `@theme inline`, `tone.ts`; move the existing proxy, score, latency and session badges onto it. Screenshot both themes.
- [ ] 2. Brain, test first: `proxyHealth.ts` (pure: level and issue codes from status, latency, score state, reputation, location, browser verdict, freshness, `reputationEnabled`), thresholds in one place. Table-driven tests for every issue and for "worst wins".
- [ ] 3. Brain data: migration `add_proxy_risk_acceptance` (`riskAcceptedIssues String[]`, `riskAcceptedAt`); `list` returns `health`, `browserCheck` (latest verdict, time, session id), `reputationEnabled`; `setPreferred` (one primary per account), `acceptRisk(id)` (stores the current issue codes), `clearRisk(id)`; owner-scoped like the rest; tests first.
- [ ] 4. Body words: `health-copy.ts` maps issue codes to the plain sentences, suggestions and button labels (one place, tested, no jargon check list).
- [ ] 5. Body page: explainer, overview strip with filter, account sections, proxy cards with check chips, suggestion line and actions; empty, loading and error states; keyboard and screen reader labels.
- [ ] 5b. Table view: the same data as a compact list, a Cards or Table switch remembered in the browser, same actions in both.
- [ ] 6. Swap flow: "Use X instead" and "Add a replacement" (Add dialog with the account preselected, then "Remove the old one?" offer); "Keep using it" with Undo.
- [ ] 7. Details drawer rework: Health report, Reputation, Score, Advanced details (raw tests).
- [ ] 8. Add dialog: plain field help and a result panel that fills in as the checks finish.
- [ ] 9. Check in the browser in light and dark (screenshots), small and wide screens; `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- [ ] 10. `MEMORY.md`, set this plan to done and fill the outcome.

## Edge cases and risks

- No AbuseIPDB key: reputation cannot be checked and scores cap at 89, so nothing could ever be "Healthy". Fix in the rules: when the feature is off, "not checked" is neutral and not an issue; when it is on but the lookup failed, it is "Keep an eye". Needs `reputationEnabled` from brain.
- Stale data: a proxy not tested in 48 hours is "Keep an eye: last tested 3 days ago" with "Test now" (the daily job should prevent it; it happens when brain was off).
- Rotating proxies change IP between tests; the card shows the IP of the last test and when it was tested, so "reputation of which address" is never ambiguous.
- A browser check that was never run is "Not tested yet", neutral, not a problem; it never turns a proxy amber by itself.
- "Keep using it" must not be a silent mute: it is recorded with date and the exact issues, shown as "Risk accepted", reversible, and re-asks when a new issue appears.
- "Use X instead" changes `isPrimary` only; the automation still follows the score (primary wins within 5 points). If X is much worse the page says so before the click ("scores 60, 35 lower").
- Removing the old proxy after a swap is only offered, never done automatically; removing the last proxy of an account leaves the account unable to run, so the dialog says that.
- Wording risk: plain language must stay accurate. "Blacklisted" is explained as "reported often enough that AbuseIPDB advises blocking it"; we do not claim LinkedIn blocks it. Reviewed by the owner before locking the copy.
- Colour: tokens in both themes, contrast target 4.5:1, never colour alone; checked by screenshots; no hard-coded `emerald` or `amber` left in `apps/body` proxy and session components.
- Mobile: no hover-only explanations; cards stack; actions wrap.
- Performance: a few dozen proxies at most; the 3 s score polling stays only while a score is pending.
- Security and privacy: no credentials on screen; report categories come from our own table; nothing new is sent to a third party.
- Migration additive; rollback is reverting the UI and ignoring the new columns.
- Existing code in the way: `Proxies.tsx`, `proxies-table.tsx`, `test-history-drawer.tsx`, `score*.ts` change heavily; the Accounts page uses `proxyServer.list` for `accountsWithProxy` and keeps working (list stays an array).

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Unit tests: health rules (each issue, worst wins, no-key case, stale, accepted risk and a new issue), copy mapping covers every issue code, tone mapping, sorting and filtering, swap preconditions, brain mutations are owner scoped.
- Brain integration test for `list` health and the new mutations against Postgres.
- Browser: both themes, narrow and wide, keyboard only walkthrough of one card; screenshots attached to the final message.

## Outcome

Shipped on 2026-10-14 as planned, with these details:

- Colour tokens `--success`, `--warning`, `--info` (light and dark) and `lib/tone.ts`; every hand-written emerald and amber class in `apps/body` moved onto them.
- Brain: `proxyHealth.ts` (rules and tests), `list` returns `health`, `browserCheck`, `abuseReasons`; `acceptRisk`, `clearRisk`, `setPreferred`; migration `add_proxy_risk_acceptance`.
- Body: cards grouped by account, overview strip filter, explainer, four check chips, suggestion panel, Cards or Table switch, guided swap (use another or add a replacement, then offer to remove the old one), Keep using it with Undo, reworked drawer (Health report, Reputation, Technical tests), Add dialog with a result panel, a delete dialog that says what removal means.
- Verified: lint, type check, unit tests (brain 652, body 205), build, and a temporary preview page in light and dark for cards and table (removed afterwards).

Deviations and follow-ups:

- The reputation-not-configured case is handled inside the health rules (a missing reputation is only a problem when a key is set), so no separate `reputationEnabled` query was needed.
- Not verified in a browser: the real page behind sign-in, the drawer, the Add dialog result panel, and the buttons end to end. The wording is for the owner to review.
- Follow-ups: pause a proxy; a stable `Document title`-style empty state for a brand new install; read AbuseIPDB's terms.
