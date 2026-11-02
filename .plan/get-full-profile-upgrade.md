# Get full profile reads people and companies, and updates my lists

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-11-02
- Locked by user: yes, 2026-11-02 (three answers below)

## Goal

"Get full profile" (`collect.profile`) reads the full details of any LinkedIn profile or company: the people and companies that reach it and links pasted in the block. A tick, "Update my lists with what it reads", adds new people to My network and new companies to Companies and refreshes the ones already there with what was read.

## What exists today (code, 2026-11-02)

- It takes people only (`input: 'profile'`, no settings). Companies that reach it pass through unchanged and free; posts become their authors.
- It reuses a profile read in the last 30 days and saves every profile it pays for (`PersonSnapshot`), but it never adds anyone to My network and never touches Companies.
- My network rows (`Person`) take their title, company, skills and read state from the newest profile read when the people index refreshes. A company row takes its name, industry, website, size and country from a company read (`LinkedInCompanyService.applyRead` overwrites them where the read has them).
- The new keep machinery (`CollectKeepService`, `withKeep`, `rememberedCompanies`) already adds with a label, skips Do not contact, suppressed and archived, applies a company read to its row and refreshes the people index.

## Requirements

Confirmed (answers of 2026-11-02):

- It reads people and companies from the block before, plus pasted links of either kind (a profile link or a company link).
- The tick "Update my lists with what it reads": new ones are added (people to My network, companies to Companies, labelled with the workflow's name), ones already there are refreshed with the read. On for blocks added from now on, off for blocks already saved.
- A person or company read in the last 30 days is not read again (the stored read is used and still applied to the lists). An advanced tick "Read again even if read in the last 30 days", off, reads again and pays again.

Assumptions (said here so a reviewer can object): "account" means a LinkedIn profile (a person), not the owner's own LinkedIn accounts.

## Scope and non-goals

- In scope: contracts (the block's settings, estimate, version), brain (the executor, reuse of the people and company reads), body (start settings), tests, MEMORY.md.
- Out of scope: new pages; reading posts, jobs or ads; changing what Score does; changing the other keep blocks.

## Approach

- [x] Plan and answers
- [ ] Contracts: settings `links`, `readCompanies`, `keep`, `reread`; takes anything; estimate counts pasted links; version 2 with a migration that turns `readCompanies` off for blocks saved before (so a saved workflow never starts paying for companies that used to pass through)
- [ ] Brain: split `enrich` into a read of people that does not rewrite the step's output, and a read of company pages shared with "Get companies from links"; the new executor reads both, passes through what is neither (jobs, ads, posts are turned into their authors as before), and writes the output once at the end
- [ ] Brain: `withKeep` applies the tick; `reread` skips the stored reads
- [ ] Body: new block starts with the tick on
- [ ] Tests first for each part; all gates; browser check; MEMORY.md

## Edge cases and risks

- Companies that used to pass through now cost $0.004 each: the version 2 migration pins old blocks to "do not read companies", and the estimate and the run dialog show the cost.
- A company that reaches the block already carries a full page (from Search companies or Get companies from links): it is not read again.
- Output is written once at the end: the people part must not wipe what the company part wrote on an earlier tick (the engine runs a step again until its requests are done).
- A person on Do not contact is never read from a pasted link and never added; archived companies are not refreshed.
- A pasted link that is neither a profile nor a company link is dropped and counted in the step's note.
- Posts that reach it still become their authors (people); other kinds pass through unchanged.
- A preview reads only the first pasted link and keeps nothing.
- Rollback: a code revert; version 2 settings are plain extra keys and are ignored by version 1 code.

## Verification

- `pnpm lint && pnpm ts:check --force && pnpm test:unit:run && pnpm build`, brain integration tests.
- Integration: pasted profile and company links are read once, kept under the workflow's name, an existing company is refreshed, a second run asks for nothing, `reread` asks again, and an upstream company that already has its page is not read again.

## Outcome

Shipped on `feat/collect-blocks-all-apis` (PR 177).

- `collect.profile` is version 2: settings `links`, `readCompanies`, `keep` ("Update my lists with what it reads") and `reread`; it takes anything (`takesAnything`, `input: 'start'`), so it also starts on its own from pasted links. A block saved before keeps passing companies through (migration sets `readCompanies: false`).
- Brain: `readPeople` (the people read, no output rewrite), `readCompanyPages` (shared with Get companies from links) and `readFull`, which starts both reads together and writes the output once at the end; `withKeep` adds new people and companies and refreshes existing ones; `reread` skips the stored reads.
- Found on the way: two reads of one step must not share a call key (`batch-0` was shared, so the company read was treated as done); company batches are now `companies-<n>`.
- A preview now gives a `howMany` only to a block that has one.
- Verified: integration tests (pasted links read once and kept, an existing company refreshed, no second read, `reread`, Do not contact, an upstream company with its page not read again).
- Not done: a browser walk through the block's settings.
