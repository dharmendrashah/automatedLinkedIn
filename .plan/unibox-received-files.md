# Unibox: keep and show every kind of file in received messages (videos, audio, documents, not only pictures)

- Status: draft <!-- draft | locked | in progress | done -->
- Created: 2026-10-24
- Locked by user: no <!-- change to "yes, <date>" only after the user confirms -->

## Goal

Whatever someone sends in a LinkedIn conversation (a picture, a video, a voice message, an audio file, a PDF or another document), the owner can see or play it in the Unibox, not an empty "Image" or "File" chip. Today only pictures are kept, and a first fix for pictures served from a private path is on branch `fix/message-picture-address`.

## What exists today (checked in code and on staging, 2026-10-24)

- The reader (`apps/spider/src/linkedin/messageReader.ts`, `attachmentsOf`) only looks for `img` inside a message bubble. A file card, a video or a voice message is not read at all: no attachment, no name, nothing for the Unibox to show. Staging run `8c87bfe1` held 3 image attachments and none was kept, because their address is `https://www.linkedin.com/dms/prv/image/...` and the reader accepted only `media.licdn.com` (fixed on the branch above).
- Keeping (`tasks/linkedinMessages/keepPictures.ts`): downloads each picture through the account's own browser (`fetchFile`: no redirects, 20 MB cap `MAX_ATTACHMENT_BYTES`, png, jpg, gif and webp only, 150 per run) to `kept/<user>/<account>/received/...`; the key and size go in `messages.json`; brain stores a key only inside the owner's own folder and gives an already stored message its key the first time a later read has one (`LinkedInConversationService.store`).
- Contract (`packages/contracts/src/messages.ts`): a received attachment is `{ kind: IMAGE | FILE | LINK | OTHER, name?, key?, bytes? }`. Sending already knows `IMAGE | VIDEO | AUDIO | FILE` (`attachments.ts`).
- Brain: `unibox.fileLink` gives a 10 minute signed link to any kept file of the owner's message, whatever its kind.
- Body (`message-bubble.tsx`): a kept IMAGE is drawn as a picture; anything else is a chip that opens the file when it is kept. There is no video or audio player.
- Nothing records what LinkedIn's markup looks like for a file card, a video or a voice message (only images were recorded), so selectors cannot be written blind (`.plan/unibox-keep-messages-and-files.md`).

## Requirements

Confirmed by the request of 2026-10-24:

- C1 Not limited to photos: videos, audio (including voice messages) and documents are kept and shown too.

Open questions (must be empty before locking):

1. Size. Today one file is at most 20 MB. Videos are often bigger. Options: (a) keep 20 MB for everything and show larger ones as "Too large to keep, open it on LinkedIn"; (b) 20 MB for pictures and documents, 100 MB for video and audio (proposed; the worker holds a file in memory while it downloads, and its limit is 3 GiB). Which?
2. Which documents. Proposed: pdf, doc, docx, xls, xlsx, ppt, pptx, txt, csv, and what the composer can already send. Archives and programs (zip, exe, html, svg) are never kept. Agree, or anything to add?
3. Opening files from strangers. Proposed: pictures, video and audio play in the page; a PDF opens in a new tab; every other document is only downloaded (never opened by the browser), always with a fixed content type and `Content-Disposition: attachment`; no virus scanning (out of scope, as before). Agree?
4. Per run budget. A run may download up to 150 pictures today. Proposed for the rest: at most 20 files and 200 MB per run, the remaining ones wait for the next read (already-kept ones are never downloaded again). Agree?
5. Kept for good, owner only, deleted only with the account (as for pictures, `.plan/unibox-keep-messages-and-files.md`). Same for every kind?
6. LinkedIn markup. I need real pages that hold each kind: please send a test conversation to the account you read (from another LinkedIn account) with one PDF, one other document, one video, one voice message and one audio file; then I run the read with `snapshots` on, which keeps the markup, and write the selectors from it. Is that possible, and which account should receive them?

## Design (proposed)

- Contract: received `kind` becomes `IMAGE | VIDEO | AUDIO | FILE | LINK | OTHER`, plus an optional `type` (the content type that was downloaded). Brain accepts a key only with a type from its allow list.
- Spider reader: `attachmentsOf` becomes a small list of readers, one per kind (picture, file card, video, voice message), each giving name, kind and download address, written from the recorded markup. A video that LinkedIn serves only as a stream of segments (no single file) is listed without a download and shown as "Open it on LinkedIn".
- Spider keeping: `keepPictures` becomes `keepFiles`: the same flow (never twice, budget, nothing fails the run, no address or name in a log line), with an allow list of content types per kind and the size limits of question 1. `fetchFile` follows at most one redirect when it stays on LinkedIn's own hosts, because a document download may redirect (today it follows none).
- Brain: `own` and the importer carry `kind`, `type`, `bytes`; `fileLink` serves with the stored fixed content type and, for everything but pictures, video, audio and PDF, `Content-Disposition: attachment`.
- Body: video and audio use a native player (`preload="none"`, link asked for when it scrolls into view, as pictures do); a document is a card with its name, size and a Download button; an unkept one says why ("Too large", "Not kept: type not supported", "Open it on LinkedIn").
- Old messages: a stored message without a key is healed by a later read of its conversation (existing behaviour); only conversations the read still opens (20 newest after the first read) heal.

## Scope and non-goals

- In scope: reading, downloading, keeping, serving and showing received videos, audio, voice messages and documents; limits; tests; `MEMORY.md`.
- Out of scope: virus scanning; search inside files; transcoding or thumbnails; keeping HLS streams; sending voice notes recorded in the page; deleting a single file.

## Approach

- [ ] 0. Record the markup (blocked on question 6): run the read with `snapshots` on the test conversation and keep the pages as fixtures in `messagingFixture.ts`.
- [ ] 1. Contract: kinds, `type`, allow lists and limits in `packages/contracts` (tests first).
- [ ] 2. Spider: readers per kind, `keepFiles`, one redirect on LinkedIn's hosts, budget; unit tests against the fixtures, a real-browser test against a stand-in.
- [ ] 3. Brain: store `kind`, `type` and `bytes`; fixed content type and disposition on the link; tests.
- [ ] 4. Body: video, audio and document views and their states; tests for the helpers.
- [ ] 5. Verify on staging with the test conversation (see below), update `MEMORY.md`, set this plan to done.

## Edge cases and risks

- Addresses expire (`t=` in the query) and need the account's cookies: always downloaded inside the run, through the account's own browser, never later and never from brain.
- Memory: `fetchFile` reads a whole file into memory; 100 MB files with the budget above stay well under the worker's 3 GiB, but several in a row through a slow proxy cost minutes of the 25 minute task limit: the budget and a per-run time check stop the downloads and leave the rest for the next read.
- A redirect to another host is refused; only a redirect to `www.linkedin.com`, `media.licdn.com` or a `licdn.com` host is followed, once.
- Files from strangers can be hostile: never opened by the page except the allow list; fixed content type, no sniffing; the key lies only in the owner's own folder; names are shown as text and cut (`safeFileName` rules).
- Storage grows without limit (kept for good): 100 MB videos make it faster; a cold storage rule on `kept/` is a follow-up (`deploy/gcp-setup.md`).
- Privacy: other people's files are stored for the owner of the account only; erase-on-request (delete a conversation or a person) is still open and gets more important.
- Markup written from a few recordings may not fit every variant (a forwarded file, a file in a group, a link preview that looks like a card): anything not understood stays what it is today, a chip, and nothing fails the run.
- No LinkedIn rule changes: the read already opens each conversation; downloading is the same browser asking for what the page already shows.
- Staging stays the only place the whole chain can be tried (needs the cloud grants for `kept/` from `deploy/gcp-setup.md`, which were noted as not applied; the picture fix needs them too).

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.
- Spider real-browser test against a stand-in page with each kind.
- On staging after a deploy: read the test conversation; in the Unibox the picture shows, the video and the audio play, the PDF opens and the other document downloads; a file over the limit says so; a second read downloads nothing again.

## Outcome

Filled in when done.
