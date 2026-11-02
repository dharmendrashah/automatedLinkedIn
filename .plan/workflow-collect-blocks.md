# Collect blocks for every LinkedIn data API, with links or search, saved and remembered

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-02
- Locked by user: yes, 2026-11-02 (15 blocks, jobs table, one PR per phase, foundation first)

## Goal

Every LinkedIn API of the data service has a "Collect" block in the workflow editor, each with its own settings (every input the API takes, "How many" starting at 10), working from links the owner types in the block and, where the API can search, from a search. What a block finds can be kept in the owner's lists (people in My network, companies in /companies, posts in /posts) under the workflow's name and remembered, so the same person, company or post is never paid for twice. The owner decides who stays: Do not contact removes them.

## What exists today (checked in the code and in the catalog, 2026-11-02)

The data service has 12 LinkedIn APIs. Seven already have a block, but with fewer settings than the API takes and without typed links (they read what the block before them passes on).

| API | Price | Links | Search | Block today | Gap |
| --- | --- | --- | --- | --- | --- |
| `profiles` | $0.004 a profile (search: + $0.10 a page of 25) | yes | yes | Get full profile (`collect.profile`, people from before), Search people (`collect.searchPeople`) | Search lacks 7 filters (years at company, past companies, schools, names, company HQ location, profile language, past titles in part); no typed links |
| `companies` | $0.004 a company | yes | yes (query, location, size, industry) | none | New block |
| `company-employees` | $0.004 a profile (+ $0.10 a page of 25) | yes (companies) | filters only | Find people at a company (`collect.employees`) | Companies come only from the block before |
| `domain-lookup` | $0.004 | domains | no | Find a company from its website | Limit default |
| `emails` | $0.02 an email | yes (profiles) | no | none | New block, expensive: needs a plain price warning |
| `jobs` | $0.001 a job | no | yes | Find open jobs (`collect.jobs`) only marks which companies hire | New block that returns the job postings themselves |
| `post-comments` | $0.002 | yes (posts) | no | Get commenters | No typed links |
| `post-reactions` | $0.002 | yes (posts) | no | Get reactors | No typed links |
| `posts` | $0.002 | yes (profile, company, post, feed URL) | yes (keywords, authors, mentions, type) | Find posts, Posts of people, Posts of companies | No typed links; "How many" default |
| `profile-comments`, `profile-reactions` | $0.002 | yes (profiles) | no | What this person engages with (both in one) | No typed links; cannot pick comments or reactions alone |
| `ads-library` | $0.002 | yes (Ad Library or company URL) | no | none | New block; an ad is a new kind of item |

Not every API has two versions: only `profiles`, `companies` and `posts` can search by filters; `company-employees` and `jobs` are filters-only; the rest take links only. The plan gives each API the versions it really has.

Saving and remembering today:

- A workflow's people, posts and companies live in the run (14 days) and in the workflow's output list (`output.list`). They do not reach My network, /companies or /posts. The precedent for that is post authors (`PostAuthorService.keep`, label `from posts`, target profile in the default client).
- "Get full profile" already reuses a full profile read in the last 30 days (`PersonSnapshotService.recent`) and saves what it reads. Nothing else is remembered; a search is always paid again.
- Do not contact is a state of a person; an archived or suppressed person is never added again by post authors.
- The data service bills a search of people by whole pages of 25 (`SEARCH_PAGE`), so a "How many" of 10 still pays for 25 and keeps 10. The block must say so.

## Requirements

Confirmed (your request, 2026-11-02):

- Use all the LinkedIn APIs of the data service as workflow blocks of the Collect group.
- Each API with its links version and its search version (where it has one).
- Each block has all the inputs its API accepts; "How many" defaults to 10.
- The inputs belong to the workflow only: links and search settings typed in a block are not added to any list or picker.
- What searches find (people, companies, posts) is shown in /network, /companies and /posts with the workflow's name as a label. A check box says whether to keep it, on by default; when on, results are saved to the database and remembered so the same one is not searched or paid for again.
- Not liked? The owner puts them on Do not contact.

Answered (2026-11-02): one block per version; found items join the pool as NEW with the workflow label; reads remembered 30 days and searches 7 days; jobs saved under the company; foundation first.

Open questions (must be empty before locking):

- Confirm the block list in Design 1 (15 blocks) and the jobs table in Design 4.

## Design (recommended answers)

1. **Blocks (decided: one block per version).** Every API gets one block per version it really has. That is 15 blocks, not 24, because most APIs have only one version. The 11 existing Collect blocks stay as they are (nothing is removed or renamed; retiring is `deprecated`) and keep reading what the block before them passes on. The new ones take their own typed links or their own search:

   | API | Links block | Search block |
   | --- | --- | --- |
   | profiles | Get profiles from links | Search profiles (all filters) |
   | companies | Get companies from links | Search companies |
   | posts | Get posts from links | Search posts |
   | company-employees | People at companies from links | (filters are part of the block) |
   | jobs | | Search job postings |
   | emails | Find work emails from links | |
   | post-comments | Commenters from post links | |
   | post-reactions | Reactors from post links | |
   | profile-comments | Comments by profile links | |
   | profile-reactions | Reactions by profile links | |
   | domain-lookup | Companies from website links | |
   | ads-library | Ads from links | |

   Search profiles and Search people (`collect.searchPeople`) overlap; the new one carries every filter and the old one stays as is. This is the cost of one block per version: more blocks to keep in step with the API, so each block is a thin definition over one shared builder per API (settings, parameters, rows), not a copy.
2. **Settings.** One field per API input, shown only for the chosen "Find by" (`showWhen`), grouped as simple first and "More options" for the rest. Links are typed in the block (a list of links, one per line). Every list or number the API caps is capped here too. "How many" starts at 10 for a block added from now on (`startConfig`); blocks already saved keep what they have, so no saved workflow changes. "All" is never offered without a cap (`ALL_CAP`).
3. **Keep and remember.** One check box on every block that finds people, companies or posts: "Keep what it finds in my lists and remember it" (default on).
   - On: each found person is saved as a target profile in the default client (My network), each company in /companies, each post in /posts, labelled with the workflow's name (as at the time of the run, 40 characters at most). Already known ones are left as they are and only get the label. Do not contact, archived or suppressed people and companies are never added and never read again.
   - Remember: a person or company read in the last 30 days is not read again (links mode skips them and says "N already known, not paid again"); the stored read is used. A search with the same settings in the last 7 days gives the same list from the stored reads instead of searching again. Both periods are settings of the platform, not of the owner.
   - Off, and in every preview: the results stay in the run only (14 days), as today.
4. **Items from the new blocks.** Companies, people and posts use the existing item kinds. Job postings become a new item kind (`job`) and ads a new kind (`ad`). With the check box on, job postings are saved under their company (a new table `LinkedInCompanyJob`, shown in a Jobs section of the company drawer on /companies, with the workflow label; a job is unique by its LinkedIn job id per owner and refreshed when seen again). Ads stay in the run (Output tab and CSV). A work email is added to the person it belongs to and kept with the profile when the box is on.
5. **Money.** Every block states its price in the block ("about $0.004 per profile, plus $0.10 per 25 found"), the estimate counts page fees and the cap, and the run dialog shows the total as today. Work emails ($0.02) say so in the block and ask once more in the run dialog.
6. **Cost trap.** The worker refuses a missing or 0 "How many" for any API; there is no path to "all".
7. **Pages.** /network, /companies and /posts need no new filter: labels already filter them. The label chip links to the workflow.
8. **Name of the supplier** never appears in the blocks, messages or errors.

## Scope and non-goals

- In scope: contracts (block definitions, settings, estimate, validation), brain (data operations per API, executors, keep and remember service, search cache table, new item kinds), body (forms, price text, the check box, run output for jobs and ads), tests, MEMORY.md.
- Out of scope: new pages for jobs or ads, writing to LinkedIn, other platforms of the data service (Instagram, Amazon, ...), changing the saved settings of existing blocks, a shared cache between owners (every owner keeps their own).

## Approach (one PR per phase, tests first)

- [ ] 1. Foundation: the keep and remember service (labelled adds, 30 day reuse, search cache table with a 7 day period), the check box on the blocks that already exist, the "N already known" note, the estimate, tests. No new block yet.
- [ ] 2. Existing blocks: every missing API input, a "Find by" setting and typed links, "How many" 10 for new blocks, price text. One group at a time (profiles, posts, engagement, company people).
- [ ] 3. New blocks in groups (profiles and companies, posts and engagement, emails and domains, jobs and ads); `job` and `ad` item kinds; `LinkedInCompanyJob` migration and the company drawer section; Output and CSV for them.
- [ ] 4. Verify with the real data service on small caps (one profile, one company, one post, one search of 10), a browser walk through the forms and the three pages, MEMORY.md.

## Edge cases and risks

- Found people join the pool that the Profiles, Companies and Posts input blocks and the visit blocks pick from (status NEW). A later workflow that takes "all new" would work on them too. The label filter of those input blocks limits this; say it in the check box help text. This is the main behaviour change and the reason for question 4 below.
- Privacy: these are people who did not sign up here. Saved ones follow the existing retention (marked for review after 180 days untouched), erasure and export, and Do not contact. The check box on by default is the owner's choice; the block explains what is stored.
- Label growth: one label per workflow name; a renamed workflow keeps its old label on old results; a deleted workflow leaves its label. Labels are capped in length and count per person.
- Idempotency: a step taken again after a crash keeps already known people unchanged; saving is an upsert by slug.
- A search that returns fewer rows than asked or none: step ends done with a note, nothing saved.
- Paid search pages: "How many" 10 on a people search still pays for one page of 25; the block says so, the cache avoids paying twice.
- Mixed kinds: Find posts by links accepts profile, company, post and feed links; a link of the wrong kind is dropped and counted, never sent.
- Do not contact people found by a search are dropped before saving and before any paid read.
- Limits of the data service: 60 requests a minute per key (the worker's limiter stays under it); 100 rows inline per request (the worker pages through).
- Migrations: additive (a cache table, label columns already exist). Existing graphs and runs read as before.
- Rollback: a code revert; the cache table and the saved labels stay unused.
- Not verifiable here without spending: runs with many rows; the plan's real checks stay capped.

## Verification

- `pnpm lint && pnpm ts:check --force && pnpm test:unit:run && pnpm build`, all brain integration tests.
- Per block: parameter mapping tests (every input reaches the API under its own name, extra keys never), estimate tests (page fees, cap, price text), keep and remember tests against Postgres (labelled add, known left alone, Do not contact skipped, 30 and 7 day reuse, unchecked saves nothing).
- Real path: small capped runs through the compiled worker and the browser for each API family, as in the workflow engine check.

## Outcome

Shipped on `feat/collect-blocks-all-apis` (2026-11-02).

- Contracts: 12 new Collect blocks (links: profiles, companies, posts, people at companies, work emails, commenters, reactors, comments by profile, reactions by profile, ads; search: companies, job postings), each with every input of its API and "How many" 10; `keep` box on them and on Search people, Find posts, Find people at a company and Find a company from its website; 7 missing filters on Search people; new item kinds `job` and `ad`; `keepLabelOf`.
- Brain: `CollectKeepService` (labelled adds to My network, /companies, /posts; jobs under the company; Do not contact, suppressed and archived never added or paid for), `CollectCacheService` (a search remembered 7 days), 30 day reuse of company pages, 90 day reuse of work emails, `recall` hook in `collectEach` (a remembered request is booked as done for $0), new executors, CSV columns, migration `20261102050000_collect_blocks_keep_and_cache` (additive).
- Body: icons, output rows for jobs and ads, the check box, Jobs section in the company drawer, work email in the person drawer.
- Verified: all gates and 389 integration tests; in the browser a real search of 2 companies ($0.008) was kept on /companies under the workflow's name, and the same run again cost $0.00.

Deviations from the locked plan:

- 12 new blocks, not 15. Where an existing block already is that version it was completed instead of duplicated: Search people is the profiles search (7 filters added), Find posts is the posts search (it already had every input), and Find a company from its website is the domain lookup (it already takes typed domains).
- Commenters, reactors and the profile engagement blocks start with the keep box off for commenters and reactors (they are not searches) and on for comments and reactions by profile (they find posts).
- The Search people estimate now counts the page fee ($0.10 per 25), so it is higher than before (the templates' costs rose with it).
- An unticked "Include reposts" is now sent as false (the data service includes reposts unless told not to).

Follow-ups: a step note saying "found earlier, not paid again" for a remembered search; the people path of keep (My network labels) and the work email are covered by integration tests but were not run live; ads are not kept anywhere but the run.
