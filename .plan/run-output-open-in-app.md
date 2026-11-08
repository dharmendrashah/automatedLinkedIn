# Run output rows open the app's own pages

- Status: in progress <!-- draft | locked | in progress | done -->
- Created: 2026-11-08
- Locked by user: yes, 2026-11-08 (author approved the design draft, option B for `/network`)

## Goal

A row in a run's output opens the post, person or company inside the app, on its own page with the drawer open, instead of LinkedIn. A post row's Details shows the author's name, not a URL.

## Requirements

Confirmed:

- Post rows open the post drawer on `/posts`.
- Person rows open the person drawer on `/network`.
- Company rows open the company drawer on `/companies`.
- The internal page opens the drawer straight away.
- "Few bugs": the post Details URL bug is in scope.

Resolved:

- Person link on `/network`: option B, `/network?open=<person id>`, chosen 2026-11-08. A person outside My network has no id, so their row keeps the LinkedIn link.
- Posts, people and companies that open in the app drop the LinkedIn link (the draft's default, accepted).
- A post or company not stored in the app: check what the drawer shows; if it is an error, the row keeps the LinkedIn link (see Edge cases).

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope: the Name cell and Details of the run output table; brain adds `personId` and `inApp` to the output and input read responses (not the CSV, not stored items); a pure helper with tests. `apps/body/src/pages/Network.tsx` is not changed.
- Out of scope: new drawers or pages; the CSV download; brain storage of items (unless the step-0 check fails); Unibox, Accounts, Posting; job, ad and conversation rows.

## Approach

- [x] Step 0: verified in the Stage 9 code check: `preview` survives the output read; the Network drawer loads by id and `people.get` is owner-scoped, so an owned id outside the table works.
- [x] Add `apps/body/src/components/workflows/block-output-rows.ts` with `nameOf`, `detailOf`, `internalPathOf`.
- [x] Use the router `Link` in the Name cell of `apps/body/src/components/workflows/block-output.tsx` for post, profile and company.
- [x] Post Details reads `preview.author.name`, empty without a preview.
- [x] Brain: add `personId` (profile items) and `inApp` (company items) to the workflow output and input read responses, one query per kind per result page; the CSV is not changed.
- [x] Profile links use `/network?open=<person id>`; `apps/body/src/pages/Network.tsx` is not changed.
- [x] Add `apps/body/src/components/workflows/block-output-rows.unit.test.ts`.
- [x] Run the repo gate (passes, 2026-11-08). [ ] Check the staging run tab (needs the author to sign in).

## Edge cases and risks

- A post with no `postId` (found by a workflow, not kept): `/posts?post=<slug>` may show nothing. Check what `PostView` shows for an unknown slug; fall back to the LinkedIn link if it is an error.
- A company not in `/companies`: same check for `CompanyView`.
- A person outside My network (no `personId`) or removed by retention: the row keeps the LinkedIn link.
- Slugs must be URL-encoded (short links `lnkd-<code>` keep their case).
- The `/network` drawer must open for a person id that is not in the current table rows (step 0).
- The Details fix depends on `preview` being present in stored post items; older items without it show an empty Details, not a URL.
- The output is kept 14 days, so the links only apply to runs still in the app.
- Oxlint: no non-component export from a `.tsx` file (hence the `.ts` helper).
- Rollback: revert the changed files; no migration. The `personId` field is additive.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Unit tests for each kind, slug encoding, null for other kinds, the post Details with and without a preview.
- On staging, after sign-in: a run with post, person and company output. Each row opens its drawer; a post row shows the author name in Details.

## Outcome

Shipped in code on 2026-11-08; the repo gate passes. Staging is not checked yet.

- Brain: `WorkflowOutputLinkService` (`apps/brain/src/database/workflowOutputLink.service.ts`) and the pure `linksOf` (`workflowOutputLinks.ts`). The `workflow.output` and `workflow.input` resolvers add `personId` to profile items (null when the person is not in My network) and `inApp` to company items (true when the owner has the company, not archived). The CSV mutations are unchanged.
- Body: `block-output-rows.ts` holds `nameOf`, `detailOf`, `internalPathOf` and `postDetailOf`. `block-output.tsx` renders a router `Link` when a page exists, and the LinkedIn link otherwise. A post's Details shows the stored author name, never the URL.
- Tests: `workflowOutputLinks.unit.test.ts`, `block-output-rows.unit.test.ts`, `workflow.unit.test.ts` (mock and assertion added), and `workflowOutputLink.service.integration.test.ts` (Postgres; passed locally).

Deviations:

- `inApp` on company items was added to carry the locked rule "if the drawer errors, keep the LinkedIn link". The Stage 9 code check showed a company not in the owner's list gives an error in its drawer. It is a read-response field only, not stored.
- The Scope line that said the `/network` page reads `person` was stale and conflicted with the Approach. It now says `Network.tsx` is not changed.
- Step 0 was verified in the Stage 9 code check and was not repeated.

Follow-ups:

- Check the staging run tab: a post, a person and a company row each open their drawer, and a post row shows the author name in Details.
- Conversation rows keep the LinkedIn link (see the design's Non-Goals and Open Questions).
- The design changed after Stage 9 (see `egm/goldfish_review_report.md`); the author should confirm the re-lock as the review requested.

