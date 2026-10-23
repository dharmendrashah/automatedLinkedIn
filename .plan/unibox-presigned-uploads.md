# Unibox: upload files straight to the bucket with a signed form

- Status: done
- Created: 2026-10-23
- Locked by user: yes, 2026-10-23 (answers to Q1 to Q4, and the preview)

## Goal

The page uploads a file directly to the spider bucket with a short-lived signed form that brain hands out, instead of sending the bytes through brain (`POST /uploads/:uploadId`). Brain still decides what may be uploaded, checks the file before a reply is sent, and nothing else about sending changes.

## What exists

- Page: `upload.ts` posts the file as the body of `POST {api}/uploads/:uploadId` with the bearer token and `X-File-Name`; `trpcSource.send` calls it once per file, then `unibox.send({ uploadId })`.
- Brain: `middlewares/uploads.ts` streams the body into the bucket through `UploadFiles.save` (20 MB counted while reading, first bytes sniffed, unique name, 10 files per upload, 200 MB per user waiting), then `LinkedInReplyService.filesOf` lists the upload and builds what the spider is told.
- The 500 on staging (2026-10-23, brain log): `brain-recording-links@... does not have storage.objects.list access to the bucket`. The bucket permission for `uploads/` and `kept/` in `deploy/gcp-setup.md` was never applied. This is a missing cloud grant, not a code bug.
- Signing already works in brain for recordings (`RecordingLinks`: the service account signs for itself through IAM Credentials).

## Proposal

### Flow

1. Page asks brain for a form: tRPC mutation `unibox.uploadForm({ uploadId, name, bytes })` (signed in, owner only).
2. Brain checks what it can before any byte moves: the upload id shape, a safe name, a type LinkedIn takes (`kindOfName`), `bytes` between 1 and 20 MB, at most 10 files in the upload, and the per-user cap of unsent files. It picks the final unique name (`cv (2).pdf`) and answers `{ url, fields, name }`: a V4 signed POST policy for exactly `uploads/<user>/<upload>/<name>`, valid ten minutes, with `content-length-range` 1 to 20 MB and a fixed `Content-Type: application/octet-stream`.
3. Page posts a `multipart/form-data` form (fields, then the file last) straight to `storage.googleapis.com`. Brain sees none of the bytes.
4. Page calls `unibox.send({ conversationId, text, uploadId })` as today. Brain's `filesOf` lists the upload, and for each file checks the size from the bucket and the first bytes (a 16 byte ranged read, `looksLike` as today). A file that is not what its name says is deleted and the send is refused with a sentence. This check moves from upload time to send time, because the bytes no longer pass through brain.
5. The rest (task command, spider download, `keepFiles`, `kept/`) is unchanged.

### Code

- Brain: `UploadFiles.form(userId, uploadId, wanted, bytes)` (limits, unique name, signed policy) and `UploadFiles.verify(userId, uploadId)` (size and first bytes, delete and refuse a bad file); `unibox.uploadForm`; `filesOf` calls `verify`. Remove `middlewares/uploads.ts`, `UploadFiles.save`, the `/uploads` route, its CORS header `x-file-name` and their tests.
- Body: `upload.ts` becomes two steps (ask for the form, post it to the bucket) and no longer needs the API address or the token; `trpcSource` passes the file size; the same sentences for errors.
- Contracts: nothing new.

### Cloud (an admin applies; I cannot)

- The grant from `deploy/gcp-setup.md` is still needed: a signed form carries the rights of the account that signed it, so brain's service account must be allowed to create objects under `uploads/` (and list, read and move for `verify`, `keepFiles` and links). Without it the form is refused by Google, the same wall as the 500 today.
- New: a CORS rule on the bucket for the app origin, method POST, so the browser may post the form (today none is needed).

## Requirements

Confirmed (your words):

- Files must not be uploaded to the backend directly; they go through a presigned URL.

Answered by the owner on 2026-10-23:

- Q1. An admin applies the bucket grant and the CORS rule so staging can be tested.
- Q2. Signed POST form, enforcing the size and type at Google.
- Q3. The old `POST /uploads/:uploadId` route and its code are removed now.
- Q4. Real upload progress, shown where the reply is being sent (the chips of a file are gone from the composer by then).
- New: the chat shows a preview of a file where possible: a thumbnail of an image in the composer before sending, in the sending bubble, and in the thread (a kept image through its signed link, loaded when it scrolls into view); other types stay a chip that opens the file. No inline player for video or audio, and no PDF render, in this change.

Open questions: none.

## Scope and non-goals

- In scope: signed form from brain, direct upload from the page, verification at send, removal of the old route, docs for the CORS rule.
- Out of scope: resumable uploads for large files, virus scanning, a local fake bucket for development (without a bucket the page says files cannot be sent from here, as now).

## Approach

- [x] 1. Lock the questions above.
- [x] 2. Brain tests first: `form` limits and signed policy fields, unique name, cap; `verify` (size, first bytes, delete and refuse); router `uploadForm`; `filesOf` uses `verify`.
- [x] 3. Brain code; remove the old route and `save`.
- [x] 4. Body tests first: ask for the form, post it, errors with sentences; then `upload.ts` and `trpcSource`.
- [x] 5. `deploy/gcp-setup.md`: CORS rule, grant text; `MEMORY.md`; Outcome.
- [x] 6. Gates: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests; a live test on staging after the grant and the CORS rule.

## Edge cases and risks

- **Unverified bytes in the bucket:** between the upload and the send an unchecked file sits in `uploads/`. It is never served (only listed, verified, then moved to `kept/` or left for the one day rule) and the spider only gets files brain verified.
- **A lying name:** `x.png` holding a page is caught by the first-bytes check at send and deleted.
- **Size:** the policy refuses over 20 MB at Google; `verify` re-checks the size from the bucket.
- **Many forms, no upload:** each form is for one exact object and ten minutes; the per-user cap of unsent files is checked when a form is issued and again at send; the one day rule removes leftovers.
- **Same name twice:** the name is made unique when the form is issued; two forms asked at once for one name could collide, so the check repeats at send and the later object overwrites (same user, same upload) which is harmless.
- **Tab closed after the upload:** unchanged: removed by the one day rule.
- **No bucket (local dev):** `uploadForm` answers that files cannot be sent from here.
- **CORS and the Content-Type field:** the browser must send exactly the signed fields; a mismatch is a Google 403 shown as "The file could not be sent".
- **Rollback:** revert the PR; the old route returns, uploaded objects keep the same keys.
- **Secrets:** the signed form is a bearer capability for ten minutes for one object; it is not logged.

## Verification

- Unit tests as listed; brain integration tests; `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Live on staging (not runnable by me): after the grant and CORS rule, send an image, a PDF and an MP4 to a test conversation.

## Outcome

Shipped (not run live; the staging bucket grant and CORS rule are the admin's, as agreed):

- Brain: `unibox.uploadForm({ uploadId, name, bytes })` answers a signed POST form (`UploadFiles.form`: one exact object of the owner, 1 byte to 20 MB, `application/octet-stream`, ten minutes, unique name, 10 files and the unsent-files cap checked when it is issued). The send calls `UploadFiles.verify` (size and first 16 bytes of every file; a bad file is deleted and the reply refused with a sentence). The old `POST /uploads/:uploadId` route, `UploadFiles.save`, the `x-file-name` CORS header and their tests are gone.
- Body: `upload.ts` asks for the form and posts it with an XMLHttpRequest (file last), reporting real progress; `trpcSource.send` turns it into one percent for all files by size; the reducer keeps `sending.progress`; the sending bubble shows the files and a progress bar. The imitation progress of the composer chips is gone.
- Preview: an image shows as a thumbnail in the composer chip, in the sending bubble and in the sent message (from the file on this device), and in the thread from the kept file through `unibox.fileLink`, asked for only when it scrolls into view. Other types stay a chip that opens the file.
- Docs: `deploy/gcp-setup.md` has the CORS rule (the recordings rule with POST added, one list per bucket) and the new errors.

Deviations and not verified:

- No inline player or document render: only images are previews. Video, audio and PDF open from the chip.
- Not run against a real bucket: whether a form signed through Workload Identity and IAM Credentials (as the recording links are) is accepted, the CORS preflight, and the live send are for the owner to try on staging.
- The component pieces (`AttachmentView`, the hooks) have no component tests; the page logic has none either (see `MEMORY.md`).
