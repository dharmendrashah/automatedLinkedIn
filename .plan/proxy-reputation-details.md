# Score breakdown and reports in the proxy test history

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-14
- Locked by user: yes, 2026-10-14 (the request settles the scope; the one open choice, comments, is decided below as "not stored")

## Goal

In the `/proxies` history drawer, show for every score why it is what it is: the blacklist verdict, the AbuseIPDB reports behind it (what kind of abuse, how many, how recent, how many reporters), and how the number was put together from reputation and speed. This extends `.plan/proxy-ip-reputation.md`.

## Requirements

Confirmed (request of 2026-10-14):

- C1 The score history in the drawer shows the blacklist state and the reports, so the owner can see how a score was reached, where an IP is blacklisted and for what reason, and where it is not.

Decided here (conservative, reversible):

- D1 Blacklisted means AbuseIPDB's abuse confidence score is 75 or more (the range its docs recommend for blocking). Below that: "Not blacklisted", and below 25 "Clean". Brain derives it; one constant in `proxyScore.ts`.
- D2 Reasons are the report categories AbuseIPDB attaches to reports in the last 90 days (for example Port Scan, Brute-Force, Web Spam), counted, plus the 10 most recent reports with date, categories and the reporter's country.
- D3 Report comments are NOT stored or shown: they are free text written by strangers, often log dumps, and AbuseIPDB itself warns they can contain personal information. Categories carry the reason.
- D4 Each history entry keeps its own detail, so a past day shows what was known that day. Entries saved before this change have no detail and say so.
- D5 The breakdown shows `reputation x 70% + speed x 30% = score`, with each part computed in brain from the same functions that score (no second copy of the formula in the web app).

Open questions: none.

## Scope and non-goals

- In scope: `verbose` on the AbuseIPDB call, a summary of the answer (categories, recent reports, distinct reporters, whitelisted, domain, country, hostnames), two JSON columns (`ProxyServer.abuseDetail`, `ProxyScore.detail`), a score entry view in the drawer (verdict, breakdown, reasons, recent reports, IP facts), a Blacklisted badge in the Score column, tests.
- Out of scope: report comments, the `/reports` endpoint (100 a day, paginated), reporter ids, any new AbuseIPDB call (the same one call a day per IP), changing the score formula.

## Approach

- [x] 1. Test first, then `core/abuseIpDb.service.ts`: send `verbose`, parse `reports`, `numDistinctUsers`, `isWhitelisted`, `domain`, `countryCode`, `hostnames`; return a `detail` summary (`categories` counted across all returned reports with their names from AbuseIPDB's category table, `recent` 10 newest without comments, caps on every list). Category names live in one file.
- [x] 2. Migration `add_abuse_detail` (additive): `ProxyServer.abuseDetail Json?`, `ProxyScore.detail Json?`; `db:generate`.
- [x] 3. Test first, then `proxyScore.ts`: `BLACKLIST_SCORE = 75`, `reputationState(abuseScore)` (`BLACKLISTED`, `SUSPICIOUS` from 25, `CLEAN`, `UNKNOWN`) and `scoreParts` (reputation, speed, weights).
- [x] 4. `ProxyScoringService`: store the detail on the proxy (and reuse it with the same-IP answer) and write it into the history entry.
- [x] 5. `ProxyServerService.scoreHistory` returns `detail` (plain typed object, not Prisma `Json`), `reputationState` and `parts` per entry; `proxyServer.list` carries `reputationState` so the Score column can show the badge.
- [x] 6. Body: selectable score history in the drawer with a detail panel (verdict badge, breakdown line, reasons with counts, recent reports, ISP, usage type, domain, country, Tor, whitelisted, "no detail saved" for older entries) and a Blacklisted badge in the Score column; unit tests for the helpers.
- [x] 7. `MEMORY.md` and this plan.

## Edge cases and risks

- `verbose` makes the answer larger: AbuseIPDB limits it to 10,000 reports, so a heavily reported IP can be a few MB. It is one call per IP per day; the timeout goes from 10 to 20 seconds for it, and only the summary is stored (about 2 KB).
- Categories are counted over the returned reports (at most 10,000); `totalReports` from AbuseIPDB stays the headline number.
- Unknown category id (AbuseIPDB adds one): shown as `Category <id>`.
- Report text is never read into a stored field (D3). Anything shown is a number, a country code or a name from our own table, and is rendered as text.
- Json columns: Prisma's recursive `Json` output type breaks the web app's type inference (TS2589), so the service casts to one plain `AbuseDetail` type before it reaches the router.
- Existing rows: `detail` is null; shown as "No details were saved for this score".
- The `abuseDetail` copy is reused with the 24 hour same-IP answer, so a reused answer shows the same reasons.
- Migration is additive; rollback is reverting code (the columns can stay).

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Unit tests: verbose parsing (counts, names, caps, no comments, missing fields), reputation state boundaries (24/25/74/75), score parts agree with `scoreProxy`, scoring service stores and reuses detail, `scoreHistory` output, drawer helpers.

## Outcome

Shipped on 2026-10-14: the AbuseIPDB call is `verbose` and summarised into `AbuseDetail` (reasons counted over the period with their names, the 10 newest reports without comments, distinct reporters, whitelisted, domain, country, host names); migration `add_abuse_detail` (`ProxyServer.abuseDetail`, `ProxyScore.detail`); `reputationState` (blacklisted from abuse score 75, suspicious from 25) and `scoreParts` in `proxyScore.ts`; `scoreHistory` returns detail, state and parts, `proxyServer.list` returns `reputationState`; the drawer has Tests and "Score and blacklist" tabs, the latter a selectable list with the verdict, the breakdown, the reasons, the newest reports and the address facts; the Score column shows a Blacklisted badge. Lint, type check, unit tests (brain 615, body 161) and build pass.

Deviation: an AbuseIPDB answer saved before this change is not reused (it has no detail), so the next test or daily run asks again and the proxy then has details.

Not verified: a real verbose call and its size on a heavily reported IP, the tab in a browser. Entries made before this change show "No report details were saved".
