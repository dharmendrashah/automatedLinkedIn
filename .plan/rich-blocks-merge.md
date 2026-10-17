# Richer, easier blocks and a Merge block

- Status: done
- Created: 2026-10-18
- Locked by user: yes, 2026-10-18

## Goal

Every block gets a friendly form like the schedule block: a plain explanation, only the settings that matter, presets, a live cost hint, and the real options the data service offers. "Get commenters" and "Get reactors" offer "All" or "Up to a number". A new Merge block joins several lines into one.

## What the data service accepts (asked on 2026-10-18 with an unknown setting; it answers 422 and charges nothing)

| Operation | Settings |
| --- | --- |
| posts | urls, queries, maxResults, postedLimit, includeQuotePosts, includeReposts, sortBy, authors, mentioning, contentType |
| post-comments | posts, maxResults, postedLimit, includeReplies |
| post-reactions | posts, maxResults, reactionTypeFilter |
| profile-comments, profile-reactions | profiles, maxResults, postedLimit |
| company-employees | companies, maxResults, locations, jobTitles, yearsAtCompany, yearsOfExperience, companyHeadcount, recentlyChangedJobs, pastJobTitles, seniorityLevels, functions, industries |
| jobs | jobTitles, maxResults, locations, company, workplaceType, employmentType, experienceLevel, salary, postedLimit, sortBy, industryIds, easyApply, under10Applicants |
| domain-lookup | domains, maxResults |
| profiles (search) | queries, searchQuery, maxProfiles, locations, seniorityLevel, function, industry, yearsOfExperience, yearsAtCompany, companyHeadcount, currentCompanies, pastCompanies, currentJobTitles, pastJobTitles, schools, names, companyHQLocations, profileLanguages, recentlyChangedJobs, recentlyPostedOnLinkedIn |

The allowed values of the choice settings (for example reaction types, content type, workplace type) are found the same free way before they are offered.

## Proposed options per block

- Get commenters: All or Up to N; only comments from the last day, week, month; include replies.
- Get reactors: All or Up to N; reaction types (like, celebrate, support, love, insightful, funny).
- Find posts: several keywords; posted within; sort by latest or most relevant; content type; include reposts and quote posts; only from these authors; mentioning someone.
- Posts of people / of companies: how many per person or company; posted within; include reposts.
- What this person engages with: how many; posted within.
- Find people at a company: how many; job titles; past job titles; seniority; function; industry; location; years at the company; years of experience; company size; changed jobs recently.
- Find open jobs: job title; location; remote, hybrid or on site; full time, part time, contract; experience level; posted within; easy apply only; under 10 applicants.
- Find a company from its website: websites; how many.
- Remove duplicates: choose what counts as already seen (my lists, my profiles, do-not-contact always).
- Keep top N: by score or by followers.
- Score: the ideal customer, plus the qualified and maybe scores on the block itself (today they live in workflow settings).
- Every block: a one-line "what it does", what comes in and goes out, a cost hint ("about $0.002 per person"), presets where they help.
- New Merge block: several lines in, one out.

## Requirements

Confirmed: Get commenters and Get reactors offer "All" or "Up to a number"; a Merge block; every block richer and easier.

Answered by the owner on 2026-10-18:

- "All" keeps a safety cap of 1,000 per post and is priced that way.
- Merge offers: combine everything (each item once), only items that came in on every line, only items from a chosen main line that are not in the others. It joins two or more blocks of any kind (for example several collect blocks).
- Every block in the proposal above, in this round.
- Add a "Search people" block.
- The qualified and maybe scores move onto the Score block (workflow values are the fallback for blocks saved before).

Allowed values found (free): reaction types LIKE, PRAISE, EMPATHY, APPRECIATION, INTEREST, ENTERTAINMENT (one per request); comment age any, 24h, week, month; post age any, 1h, 24h, week, month, 3months, 6months, year; post sort relevance, date; content type all, videos, images, jobs, live_videos, documents, collaborative_articles; job workplace remote, hybrid, office; employment full-time, part-time, contract, internship, temporary; experience internship, entry, associate, mid-senior, director, executive; job age 1h, 24h, week, month; job sort relevance, date; salary 40k+ to 200k+; functions 1 to 26; headcount 1, 2-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5001-10000, 10001+; years 1 to 5 (bands); search seniority 100 to 320. Industries (hundreds of codes) are left out this round.

Open questions: none.

## Approach

- [x] 1. Lock this plan.
- [x] 2. Find the allowed values of each choice setting (free).
- [x] 3. Contracts: new settings per block, "All or Up to N", Merge, estimates; tests first.
- [x] 4. Brain: pass the new settings to the data service, Merge executor; tests.
- [x] 5. Body: a shared friendly form (explanation, in/out, cost hint, presets) and per-block layouts.
- [x] 6. Verification, MEMORY.md, Outcome.

## Edge cases and risks

- "All" can be expensive on viral posts; the estimate and run dialog must say so, and the wallet floor still stops a run.
- Old saved blocks keep working: new settings have defaults that mean "as before".
- Settings the data service ignores or renames: checked live with a few cents once, within the agreed test budget.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests with the fake data service (the new settings reach the request, Merge modes), one small live check of the new filters.

## Outcome

Shipped:

- Contracts: field kinds `toggle`, `limit` (All or Up to), `parent`, text placeholders, `advanced` and `costHint`; every block in the proposal has its settings. New blocks are Search people and Merge. Estimates price "All" at 1,000 per post and search in pages of 25, and a preview never reads all.
- Brain: the param builders send only the settings that filter. There are executors for Search people and Merge, plus dedupe skip choices, top N by followers and per-block scores.
- Tests: integration tests for the Merge modes, Search people and the exact request params.
- Body: a richer settings dialog and summaries per block. The workflow settings say their scores are only the fallback.

Deviations:

- Presets were not added: the defaults plus "More options" kept forms short enough.
- Industries are left out (hundreds of codes).
- Search people `maxProfiles` must be a multiple of 25, found in the live check. It now asks for a full page and keeps N.

Verified:

- lint, ts:check, unit tests and build all pass.
- Brain integration: 68 pass.
- One live check (about $0.12): find posts with sort and kind, comments with age and replies, reactions filtered to Like, and Search people with title, location, seniority, department and size.

Not verified:

- The employees and jobs filters live.
- The new form in a browser.
