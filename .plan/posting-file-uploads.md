# Write a post: upload files to the bucket from the page

- Status: done
- Created: 2026-10-25
- Locked by user: yes, 2026-10-25 (the request settles the behaviour; the decisions below were made while planning)

## Goal

A photo, video or document that is picked or dropped in the composer is uploaded at once, from the browser straight to the cloud bucket with a form brain signs, and the draft keeps the link (the object key) in the database. Then a draft keeps its files across reloads and devices (no more "Attach again"), and a later sending step can read them from the bucket.

## Requirements

Confirmed (from the request):

- Files picked or dropped while writing a draft are uploaded to the bucket with a presigned form, from the frontend; brain never holds the bytes.
- The link to each uploaded file is saved in the database with the draft, for sending later.

Decisions made while planning (no open questions):

- Two places in the spider bucket, like the Unibox: `post-uploads/<user>/<file>/<name>` for a file just uploaded (a one day lifecycle rule removes what is never confirmed) and `posts/<user>/<file>/<name>` for a confirmed one. The page asks for a signed form, posts the file, then asks brain to confirm it: brain checks its size and first bytes (`looksLike`), moves it to `posts/`, and answers with the key. Only then does the draft get the key.
- `<file>` is the id the page already gives each photo, video or document (a UUID). A stored key must equal `posts/<user>/<id>/<safe name>`; brain refuses any other key, so a draft can never point at another owner's or an arbitrary object.
- The contract's photo, video and document items get an optional `key`. Optional because drafts saved before this have none and stay valid: they keep the "Attach again" path, which now uploads.
- Limits stay as in the contract (photo 8 MB, video 512 MB, document 100 MB, by type), enforced by the signed form (`content-length-range`) and again on confirm. A per-owner total of 2 GB across both prefixes is refused with a sentence.
- Showing a file that is not on this device (after a reload): `postFile.link` returns a ten minute signed read link for the owner's own `posts/` key; the page asks for it when the file has a key and no local copy, and again before it expires. Pictures show inline, everything else is a download with a neutral type, as in `KeptFiles.link`.
- Removing a photo, a video, a document or a draft deletes its objects from the bucket (brain does it after the draft is saved or deleted, best effort and logged). So deleting a draft cannot be undone any more: the Undo toast on the drafts list becomes a confirmation dialog that says its files go too. Removing a LinkedIn account deletes its drafts' files first, like `KeptFiles.removeAccount`.
- Nothing is sent to LinkedIn. Posting is still not connected.

## Scope and non-goals

- In scope:
  - Contracts: `key` on the items, `postKey` and `postUploadKey`, the per-kind size and type table shared by brain and the page.
  - Brain: `core/postFiles.ts` (`form`, `confirm`, `link`, `remove`, `used`), `PostDraftService` (key check, delete what a save or a delete drops, `removeForAccount`), router `postFile` (`form`, `confirm`, `link`), `LinkedInAccountService.deleteForUser` removes the drafts' files first. Unit tests for each, integration test for the draft service.
  - Body: shared `lib/signed-upload.ts` (the form post with progress, used by the Unibox too), `use-uploads.ts` (state per file: uploading with percent, failed with a sentence and a retry, done), `use-file-urls.ts` (signed read links for keyed files), the composer shows progress on each thumbnail, a failure with Retry, and "Uploading N files" in the footer; the preview and thumbnails use the local copy first and the signed link otherwise.
  - Docs: `deploy/gcp-setup.md` (grant condition, lifecycle rule, CORS is unchanged). The commands are not run.
- Out of scope: sending the post, resumable uploads (a failed upload starts again), image resizing or video checks, a sweep job for objects no draft refers to (a crash between confirm and save can leave one; follow-up), virus scanning.

## Approach

- [ ] Tests first for the contract keys, `PostFiles`, the draft service and the pure page helpers.
- [ ] Contracts and brain (core class, service changes, router), then regenerate and run the brain tests.
- [ ] Shared `lib/signed-upload.ts`; the Unibox upload uses it with its tests unchanged.
- [ ] `use-uploads.ts`, `use-file-urls.ts`, the composer and attachment area, the studio wiring, the drafts list confirmation.
- [ ] Docs, plan, `MEMORY.md`; `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`; the brain integration test for the draft service against local Postgres.

## Edge cases and risks

- Upload fails (network, 403, CORS): the thumbnail shows the sentence and Retry; the draft keeps the item without a key; nothing blocks writing.
- The tab is closed mid-upload: the temporary object is removed by the one day rule; the draft has the item without a key (it shows "Attach again").
- The owner removes a file while it uploads: the result is ignored and confirm is not called; the temporary object ages out.
- Two tabs, a retry, or a double drop: file ids are unique per pick; confirm is idempotent (a second confirm of a moved file finds it under `posts/` and answers with the same key).
- A file whose type or first bytes do not match its name: refused with a sentence and deleted. A renamed program or script never reaches `posts/`.
- Name handling: the key uses the safe name brain returns from `form`, and the draft stores that same name.
- Quota: the 2 GB cap is checked when the form is asked for; a signed form already handed out can still be posted once, which is bounded by the per-file limit.
- Expired read links: asked again about two minutes before they end; an image that already loaded stays on screen.
- Existing drafts: no key, still valid; they upload when attached again.
- Security: every call is owner scoped; a key is only accepted when it equals the owner's own path; the read link only signs keys under `posts/<owner>/`; uploads are stored with a neutral content type, and links to anything but a picture are downloads. No file name or content is logged.
- Production: `SPIDER_GCS_BUCKET` must be set; without it the form answers "Files cannot be sent from here" and the page says so. The grant, lifecycle rule and CORS in `deploy/gcp-setup.md` must be applied before staging can upload; until then uploads fail with a clear sentence and drafts still save.
- Rollback: the `key` is optional and the new prefixes are only read through the new router; removing the router leaves drafts valid.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root; the draft service integration test against local Postgres.
- A real upload needs a bucket and signing credentials, which this machine may not have (see MEMORY: signed links need a service account locally). State what could not be run.

## Outcome

Filled in 2026-10-25.

Shipped: contract `key` on photo, video and document items plus `postKey`, `postUploadKey`, `postFilesOf` and `POST_FILES`; brain `core/postFiles.ts` (`form`, `confirm`, `link`, `remove`; shares `core/signedLink.ts` with `KeptFiles`), router `postFile` (`form`, `confirm`, `link`), `PostDraftService` (a key must equal the owner's own path, files a save or a delete drops are deleted, `removeFilesOfAccount` runs before an account is removed); body `lib/signed-upload.ts` (shared with the Unibox), `post-upload.ts`, `use-uploads.ts`, `use-file-urls.ts`, progress and a retry on each thumbnail, "Uploading N files" in the footer, thumbnails and the preview shown from the bucket after a reload; the drafts list asks before deleting (no Undo any more, because the files go too); `deploy/gcp-setup.md` has the grant, the lifecycle rule and the errors.

Deviations: none from the plan. The brain unit tests mock the bucket; a real upload, confirm, move and signed read link were not run (no bucket credentials here), and the cloud grant and lifecycle rule are not applied.

Follow-ups: a sweep job for objects in `posts/` that no draft refers to (a crash between confirm and save); resumable uploads for large videos; the sending step reads `key` from the draft.
