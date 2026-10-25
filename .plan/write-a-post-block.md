# "Write a post" workflow block

- Status: done, not run live <!-- draft | locked | in progress | done -->
- Created: 2026-10-26
- Locked by user: yes, 2026-10-26 (every default accepted)

## Goal

A new workflow block, "Write a post", where the owner writes a LinkedIn post (words, a link, photos, a video or a document) inside the block, like on the Posting page, and a run of the workflow posts it from one of the owner's accounts. It builds on the posting work (`.plan/posting-send-task.md`): the `linkedin-post` task, `PostPublicationService` and its limits.

## What exists today (checked in code, 2026-10-26)

- Blocks come from one closed catalog (`packages/contracts/src/workflow.ts`: `BLOCK_TYPES`, `BLOCKS` with `group`, `input`/`output`, zod `config`, `fields` the canvas draws), one executor each (`apps/brain/src/worker/engine/executors.ts`), an icon in `apps/body/src/components/workflows/block-look.ts`. Logic blocks (Wait, Task result, Retry) work with any block, so a new block needs no extra code for them.
- "Account Actions" blocks take their accounts from the nearest "Select accounts" before them (`nodeBefore`), and a step may give itself back with `Waiting` until its task ended.
- The Posting page writes a draft (`PostDraft.blocks`, validated by `postBlocksSchema`: text, link, photos, video, document), with files uploaded to the bucket under `posts/<user>/<file id>/<name>`. `PostPublicationService` turns a draft into a `PostPublication` (state, limits: 1 hour apart, 3 in 24 hours, same words refused for 7 days), the worker jobs `post-send` and `post-sweep` run the task, and the task hook ends it. The composer is in `apps/body/src/components/posting/` (`composer.tsx`, `attachment-area.tsx`, `use-uploads.ts`, ...).
- No block posts today, and a publication is always made from a draft.

## Requirements

Confirmed (from your request): a new node called "Write a post", where the owner writes the post directly, like the separate Posting module.

Answered by the owner on 2026-10-26, every default accepted (preview posts nothing, question 6, is part of that):

1. **Which account posts.** The nearest "Select accounts" before it, and the account that went longest without a post goes first (default, same as the visit blocks, so one pool serves both), or one account picked inside the block itself?
2. **What flows through.** The block posts once per run, whatever reaches it (people, companies or nothing), and passes everything on unchanged (default), or once per item (no, that would be bulk posting)?
3. **When it posts.** When the run reaches it (default; "Schedule" already starts a workflow at a planned time), or also a "post at" time inside the block?
4. **Wait for the post.** The step waits until the post ended (posted, failed or unsure) so a block after it can use the result, up to 1 hour (default), or hands off at once and the post goes on by itself?
5. **When the limits or a repeat refuse it** (1 hour between posts, 3 in 24 hours, same words within 7 days, account not signed in). End the step as failed with the sentence, so Task result and Retry can handle it (default), or wait for the account?
6. **Preview runs.** A preview posts nothing (default).
7. **Where it shows.** The post also appears in the Posting page list as a publication with its state and link (default), or only on the run?
8. **Writing inside the block.** The inspector opens the same writer as the Posting page (words, link, photos, video, document, emoji shortcuts, preview), saved with the workflow (default), or a simpler words-only box now and files later?

## Scope and non-goals

- In scope: the catalog entry and config in contracts, the executor, the inspector writer in the body, a block icon and card summary, validation notes, tests, `MEMORY.md`.
- Out of scope: posting once per item, comments or reactions, editing or deleting a post after it was made, a post per account with different words, audience and comments settings (always "Anyone", as on the Posting page), changing any limit.

## Approach

- [x] 1. Lock this plan (answer the open questions). Decisions inside the locked scope: the block is `account.writePost`, in "Account Actions", taking its accounts from the nearest "Select accounts" (an error without one, like the visit blocks). A block's settings hold plain values only, so the post is saved as one JSON text (`post`, the same blocks as a draft, checked by `postBlocksSchema`). The step makes one `PostPublication` (new nullable `runId` and `nodeId`) through the same checks as a draft: it tries the pool's accounts, the one that posted longest ago first, and ends failed with the last refusal when none can. A failed post is made again only when a Retry gives the step another try (`step.tries`); an unsure one is never made again. The files belong to the block, so `post-sweep` and the account removal leave a workflow post's files alone, and Back to draft is refused for it; the files are deleted when the block drops them or the workflow is deleted. The step waits up to 1 hour for the post to end, then passes on with a note while the post goes on by itself.
- [x] 2. Contracts, tests first: `account.writePost` entry (group "Account Actions", config = `postBlocksSchema`), `validateGraph` (needs a "Select accounts" before it, a note when there are no words), no text names the data supplier.
- [x] 3. Brain: a way to make a publication from blocks without a draft (reuse `create`, not a copy), the executor with `Waiting`, preview, idempotency by run and node.
- [x] 4. Body: the writer in the inspector (reuse the Posting components), icon, summary.
- [x] 5. `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests; `MEMORY.md`; plan done.

## Edge cases and risks

- Compliance: posts are the owner's own, on the owner's accounts, inside the existing limits (never raised or confirmed past). A workflow that repeats would try to post the same words again; the 7 day repeat rule refuses it, so a loop cannot spam.
- Idempotency: one publication per run and node, read first, so a resumed or retried step never posts twice; a post never starts again by itself.
- Files: uploaded when the owner writes, kept for the block like a draft's; a removed account or deleted workflow must clean them up; files of a posted publication are swept by `post-sweep`.
- Existing data: additive, no migration expected if the run and node link goes in an existing JSON or a nullable column (decided when building).
- Security: owner-scoped everywhere; the config holds file ids and keys built from the owner's id, never another's.
- Deploy: needs the worker and spider with the post task; no new env var.
- Rollback: remove the catalog entry and executor; saved graphs holding the type would then fail to read (same as any removed block).
- Not verifiable here: a live post from a workflow run.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; brain integration tests; one run in a browser. A live post only with your go-ahead.

## Outcome

Shipped (not run live, page not seen in a browser): block `account.writePost` (contracts catalog, `postBlocksOfText`, validation of an empty post, a file with no key and a missing "Select accounts"); additive migration `add_post_publication_workflow_link` (`runId`, `nodeId`); `PostPublicationService.publishFromBlock`, `ofStep`, `lastPosts`, and workflow posts left out of the file sweep, account removal and Back to draft; executor `worker/engine/writePost.ts`; `WorkflowService` key ownership and file cleanup (shared `database/postFileKeys.ts`); body: `usePostWriter` taken out of the Studio, `Composer` takes a `header`, `post` field with a writer dialog, icon, card summary, "From a workflow" on the Posting list. Checks: lint (0 warnings), ts:check, unit tests and build pass; brain integration 203 of 203 plus 4 through the engine (post once and pass on, turns across accounts, preview, failure, Retry). The spider `pipeline.integration.test.ts` still fails (robots.txt for localhost; not touched by this work). Follow-ups: a live post from a workflow run with your go-ahead; files uploaded in the writer but never saved with the canvas stay in `posts/` (no lifecycle rule there); the page in a browser; staging needs the migration.
