# Unibox Phase C: send files, images and videos (and audio, if LinkedIn takes it)

- Status: done
- Created: 2026-10-23
- Locked by user: yes, 2026-10-23 (answers to Q1 to Q3 below)

## Goal

The owner can send a reply with attachments (images, files, videos, and audio if LinkedIn's web composer takes it), alone or with text, from the Unibox, through the account's own LinkedIn page. Today only text is sent and attachments are refused ("Attachments cannot be sent yet"). One constant sets the largest file: 20 MB.

## What exists

- Page: the composer already lets the owner pick or drop files and record a voice note, shows them as chips with progress, and checks them with `attachments.ts` (`LIMITS`: image 10 MB, video 200 MB, audio 20 MB, file 20 MB, 10 per message). The `Attachment` it keeps is only `{ kind, name, bytes }`: the file itself is not kept after it is picked, so it cannot be uploaded yet. `trpcSource.send` refuses any attachment.
- Brain: `unibox.send` takes `{ conversationId, text }` (text up to 4,000 characters, because the task command is limited to 8 KB). Brain talks to the spider bucket only to read `runs/` (`core/messageFiles.ts`) and to sign read links (`core/recordingLinks.ts`); it never writes there. No upload route exists.
- Spider: task `linkedin-reply` types the text and presses Send. The driver has no way to put a file in a page. The recording wrapper forwards optional driver calls one by one (a new call must be added there too: see `MEMORY.md`).
- LinkedIn's composer (recorded markup, 2026-10-22) has two hidden file inputs: one for images (`accept="image/*"`) and one for files (`accept="image/*,.ai,.psd,.pdf,.doc,.docx,.ppt,.pptx,.pps,.ppsx,.xls,.xlsx,.txt,.eml,.mov,.mp4"`). So the web composer takes images, those document types, and video as `.mov` and `.mp4`. It does not list audio (mp3, m4a, wav) or other types such as zip.

## Proposal

### Constants (confirmed)

One place for the limits, shared by body, brain and spider through `packages/contracts`: `MAX_ATTACHMENT_BYTES = 20 MB` for every kind (replaces the per-kind numbers), and the count per message (10, still unverified against LinkedIn). Brain enforces the size on the stream, not on what the browser says.

### Getting the file to the spider

- The page keeps the `File` with each attachment and uploads it to brain when the reply's 5-second Undo hold ends (nothing leaves the device before that).
- Brain route `POST /uploads` (Express, authenticated, streaming, 20 MB cap enforced while reading, type check by extension and by the file's first bytes) writes it to the spider bucket under `uploads/<userId>/<uploadId>/<n>-<safe name>` and answers the upload id and the stored names. The reply then refers to them: `unibox.send({ conversationId, text, uploadId })`.
- The task command carries only `uploadId` and a short list of `{ name, kind }` (the command stays under 8 KB). The spider builds the paths itself from the user id of its own command, so a command cannot point at another user's files.
- The spider downloads the files to a temporary folder, gives them to the page, and deletes them. Brain deletes the stored files when the reply ends (`SENT`, `FAILED`, `UNKNOWN`) and a bucket lifecycle rule deletes anything older than a day.

### Spider

- New driver call `attachFiles(selector, paths)` using the browser's file-input call (the hidden inputs are not clicked), forwarded by `Hands` and the recording wrapper. Images go to the image input and every other kind to the file input.
- In `linkedin-reply`: after the box is clicked and before typing, attach the files; wait until every file shows as uploaded in the composer (uploads through a proxy are slow: wait up to the task limit); type the text if there is any; press Send. Text can be empty when there are files.
- Confirmation: the newest message of the account must carry the text (if any) and an attachment of each name; otherwise `UNKNOWN`, as today.
- Limits: the task limit goes from 5 to 10 minutes when there are files; the page follows the reply for up to 10 minutes (3 now), then says unsure as today.

### Brain

- `LinkedInReply` gets `attachments` (Json: name, kind, bytes; additive migration). `unibox.send` takes the upload id, checks it belongs to the owner, and refuses a missing or foreign one.
- Same rules as text: 40 replies per 24 hours, 30 seconds between sends, one at a time per account, never retried by brain.

### Page

- `Attachment` carries the `File`; `source.send` uploads them, then calls `unibox.send`; the "cannot be sent yet" refusal goes away.
- The retry after a failure keeps the files in memory so Send again works; closing the tab loses them (drafts keep text only, as today).
- Limits shown to the owner come from the shared constants.

### Not in this plan

Link previews as attachments, reply with a voice note recorded in the page (see Q1), several messages for several files, editing or deleting a sent message.

## Requirements

Confirmed:

- Send files, images and videos as well as text, from the Unibox, as a reply the owner writes (no bulk or automatic sending).
- The largest file is 20 MB, as a constant.

Answered by the owner on 2026-10-23:

- Q1. Audio: try sending an audio file as a file (LinkedIn's web composer does not list audio, so it may refuse it; then the run ends `FAILED` with a sentence and the page says so). Not verified live.
- Q2. Types: the types LinkedIn's composer lists (images; ai, psd, pdf, doc, docx, ppt, pptx, pps, ppsx, xls, xlsx, txt, eml; mov, mp4) and, from Q1, mp3, m4a and wav as an experiment. Everything else is refused with a clear sentence.
- Q3. Storage: yes, brain stores uploads under `uploads/` in the spider bucket with minimal rights; a cloud admin applies the grants and the lifecycle rule (the commands go in `deploy/gcp-setup.md`; I cannot apply them).

Open questions: none.

## Scope and non-goals

- In scope: shared constants, brain upload route and cleanup, `LinkedInReply.attachments`, spider `attachFiles` and the task, page upload and retry, tests, `MEMORY.md`, `deploy/gcp-setup.md`.
- Out of scope: see "Not in this plan".

## Approach

- [x] 1. Lock the questions above.
- [x] 2. Constants in `packages/contracts`; body `LIMITS` reads them; unit tests.
- [x] 3. Spider tests first, then `attachFiles` in the driver (e2e against a local page with a file input), `Hands`, the recording wrapper (with its test), and the task: attach, wait for uploads, optional text, confirmation by attachment names.
- [x] 4. Brain: upload route and storage service (stream, size cap, type and magic-byte check, safe names), `LinkedInReply.attachments` migration, `unibox.send` with `uploadId`, cleanup on end of reply, tests (unit and integration).
- [x] 5. Page: keep the `File`, upload then send, longer follow, retry with files, composer messages; tests.
- [x] 6. Verify: `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests; the live test by the owner (an image, a PDF and an MP4 to a test conversation).
- [x] 7. `MEMORY.md`, `deploy/gcp-setup.md`, Outcome.

## Edge cases and risks

- **Never twice:** the attempt marker and the rules of Phase B stay; a redelivered command with files answers `UNKNOWN` without attaching.
- **Wrong or hostile files:** the extension and the first bytes must agree and be on the list; names are made safe (no path parts, no control characters); stored with a neutral content type; empty files refused; size counted while streaming, so a lying size header cannot pass.
- **Slow uploads:** 10 files of 20 MB through a proxy may not finish in 10 minutes; the task then ends with nothing sent (before Send) or `UNKNOWN` (after). Not measured.
- **LinkedIn refuses a file** (its own scan or limits, unverified): the composer shows an error or the button stays disabled; the task ends `FAILED` and empties the box and the files from the composer.
- **A file attached, then the task fails:** the draft with files stays in LinkedIn's box unless removed; the cleanup tries to remove them, as it does for text.
- **Privacy:** the files are the owner's own and are kept only until the reply ends (one day at most); the run recording (video) can show a preview or the file name for 7 days, like the text.
- **Abandoned uploads** (tab closed after the upload): removed by the lifecycle rule.
- **Existing data:** additive migration; text-only replies are unchanged.
- **Dev vs production:** without a bucket (local dev) the upload route refuses with a clear sentence; the devtools can attach files from a path for a manual test.
- **Rollback:** the page goes back to refusing attachments (one line); the new column and bucket prefix can stay empty.
- **Deploy:** one new IAM grant and lifecycle rule (Q3); a new brain route; no new service.

## Verification

- Unit tests as listed; the driver's file input call in real Camoufox against a local page; brain upload route and cleanup on PostgreSQL and a fake bucket.
- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, `pnpm test:integration:run`.
- What cannot be run without you: the cloud grants (Q3) and the live sends. They will be reported as not verified until done.

## Outcome

Shipped (not run live):

- `packages/contracts/src/attachments.ts`: `MAX_ATTACHMENT_BYTES` (20 MB), the count, the types list. Body keeps its own copy (`LIMITS.FILE_BYTES`, `TYPES`) because it does not depend on contracts; keep the two alike.
- Spider: `attachFiles` (driver, `Hands`, recording wrapper, tested in real Camoufox against a local page), `tasks/uploads.ts` (downloads from `uploads/<user>/<upload>/`, validated names, size check, temporary folder removed), `linkedin-reply` attaches then optionally types, 10 minute limit, confirmation by the newest own message.
- Brain: `POST /uploads/:uploadId` (auth, size counted while streaming, type by extension and first bytes, safe unique names, 200 MB and 10 files per user), `LinkedInReply.attachments/uploadId/filesDeletedAt` (migration `add_reply_attachments`), `unibox.send` with `uploadId`, `cleanFiles` called by the reply sweep, stale reply limit 15 minutes.
- Page: the `File` is kept with the attachment and uploaded to brain at Send, then `unibox.send`; the follow lasts up to 10 minutes with files; a link, or a file gone after a reload, is refused with a sentence.

Deviations and not verified:

- Not run live: no real LinkedIn send with files. The cloud grants and lifecycle rule are written in `deploy/gcp-setup.md` and must be applied by an admin; until then brain cannot write uploads. The live test is an image, a PDF and an MP4 to a test conversation.
- How the composer shows a finished upload (the `uploaded()` check) is a guess from recorded markup; the cookie banner is not dismissed.
- Audio (mp3, m4a, wav) is an experiment: LinkedIn may refuse it, then the run ends `FAILED` with a sentence. The voice recorder of the composer does not send: it says so and asks for an audio file.
- A failed run can leave the files in LinkedIn's draft box.
- The 5-second Undo hold is unchanged: nothing is uploaded before it ends.
