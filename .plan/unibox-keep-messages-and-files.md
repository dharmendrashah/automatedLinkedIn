# Unibox: keep messages and attachments for good

- Status: done
- Created: 2026-10-23
- Locked by user: yes, 2026-10-23 (answers to Q1 to Q4)

## Goal

Messages fetched from LinkedIn and sent from the Unibox are cached in the database, shown from there, and never deleted by the platform. Their attachments (received and sent) are kept in the database and the bucket too, and can be opened later in /unibox.

## What exists

- Text: `LinkedInConversation` and `LinkedInMessage` already store every message the spider reads, shown from the database. Nothing in `retention.service.ts` or the sweep jobs deletes them. They go only when the account or the user is deleted (`onDelete: Cascade`).
- Received attachments: the reader (`messageReader.ts`, `attachmentsOf`) only sees images in a bubble and keeps their alt text; no file cards, no link to the file, nothing is downloaded. `LinkedInMessage.attachments` holds `{ kind, name }`.
- Sent attachments: brain stores them in the bucket under `uploads/<user>/<upload>/`, then deletes them when the reply ends (`cleanFiles`, `filesDeletedAt`); the plan for the bucket (`deploy/gcp-setup.md`, not applied) had a one day lifecycle rule. Per user 200 MB of stored files at most (`MAX_STORED_PER_USER`), which only works because files are deleted.
- Brain signs read links only for `runs/` and `recordings/` (`core/recordingLinks.ts`); the page has no way to open a stored file.
- Run files under `runs/` (video, steps) are deleted after 7 days by a bucket rule; they are not the messages.

## Proposal

### Phase 1: sent messages and their files (small)

- Stop deleting: remove `cleanFiles` and the file part of the reply sweep, drop `filesDeletedAt` use; remove the one day `uploads/` rule from `deploy/gcp-setup.md`. A file of a reply that did not go (failed, unsure) is kept too.
- Move a file out of the temporary upload area when its reply ends: keep it under `uploads/<user>/<upload>/` (same key), recorded on the reply as now.
- The 200 MB per user cap must change, because nothing frees space: proposal is to cap only files not yet attached to a reply (uploaded and never sent), by a count and size per open upload, and no total cap. Needs your word (Q2).
- Show them: brain signs a short read link for a file of the owner's own `uploads/` (same style as recordings, ten minutes, only keys under the owner's id), the thread shows the sent message's attachments as chips that open the file. The sent message coming back from LinkedIn (imported) is matched to the reply by its attachment names, so the chip knows its file.

### Phase 2: received attachments (large, needs the real markup)

- Spider: the reader must find file cards, images and videos in a bubble and their address; a new step of `linkedin-messages` downloads each new attachment through the account's own session (same proxy and browser), up to 20 MB each, and puts it with the run files; brain's importer copies it to `attachments/<user>/<account>/<conversation>/<message>/<name>` in the bucket and records the key in `LinkedInMessage.attachments`.
- Page: attachments of received messages open the same way as sent ones.
- Needs recorded LinkedIn pages that show file cards and videos (I only have images in the recorded markup), so the selectors cannot be written blind.

## Requirements

Confirmed (your words):

- Messages fetched from LinkedIn are cached in the database and shown from there.
- Messages and attachments stay indefinitely, in the database and the bucket, and can be viewed later. Never deleted.

Answered by the owner on 2026-10-23:

- Q1. Removing an account or a user, and a privacy erasure request, still delete their data (messages and files, database and bucket). That is the only deletion.
- Q2. The 200 MB per user cap becomes a cap on files uploaded and not yet sent; no total cap.
- Q3. Received attachments are built now (phase 2), not later. It adds downloads through the proxy for new attachments only, 20 MB each.
- Q4. No cold storage rule now; later.

Open questions: none.
- Q4. Bucket cost and size: nothing is ever deleted, so storage only grows. A storage class change to cheaper cold storage after 90 days (no deletion) is possible. Want that rule?

## Scope and non-goals

- In scope: stop deleting sent files, signed links for the owner's own files, thread chips that open files; (phase 2) download and keep received attachments.
- Out of scope: search inside files, previews or thumbnails stored apart, virus scanning of received files (recommended before opening them from other people; see risks), deleting single messages.

## Approach

- [x] 1. Lock the questions above.
- [x] 2. Phase 1 tests first (reply service keeps files, sweep no longer deletes, signed link refuses another user's key), then code, then page chips.
- [x] 3. Update `deploy/gcp-setup.md` (no `uploads/` lifecycle rule; optional cold storage rule).
- [x] 4. Phase 2 after the recorded pages are read, if chosen.
- [x] 5. Gates, `MEMORY.md`, Outcome.

## Edge cases and risks

- Files from other people (phase 2) can carry malware; opened in the browser from a signed link they must be served as downloads (`Content-Disposition: attachment`, neutral content type), never rendered inline from our origin. Images only through an image tag with a verified type.
- Never deleting means personal data of third parties is kept without end; the exception in Q1 and a note in the privacy text are needed.
- Storage grows without limit: a 20 MB file per message in a busy inbox adds up; cold storage rule (Q4), and a cap per message count already exists (50).
- A link signed for a key must check the owner: key prefix equals the caller's user id, no `..`.
- Existing data: replies already sent and deleted keep `filesDeletedAt`; their chips show "file no longer kept". Migration is additive.
- Rollback: re-enable the sweep; stored files stay.
- Cloud: the grant for `uploads/` must also allow signing reads (signer service account objectViewer on `uploads/`, and later `attachments/`): an admin applies it.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, brain integration tests; live check by the owner (send a file, reload a week later, open it).

## Outcome

Shipped (not run live):

- Text: nothing changed; messages were already stored for good and are shown from the database. Only removing an account deletes them.
- Sent files: kept for good. When a reply ends, the sweep (`LinkedInReplyService.keepFiles`, was `cleanFiles`) moves its files from `uploads/<user>/<upload>/` to `kept/<user>/<account>/sent/<upload>/<name>` (deviation: moved, not left under the same key, so `uploads/` holds only unsent files and the per-user cap and the one day rule apply to those alone). Column `filesDeletedAt` became `filesKeptAt` (migration `keep_reply_files`, a rename) and `matchedAt` was added.
- The message LinkedIn shows for a reply is matched to it at import (same words, earliest unmatched reply with files) and given the reply's own files with their keys, so a sent file shows and opens in the thread.
- Received pictures: the reader (`parseThread`) gives the address of an image of a message (LinkedIn's image host only); the `linkedin-messages` run downloads each through the account's own browser (`fetchFile`, new driver call, no redirects, 20 MB, png jpg gif webp only), keeps it at `kept/<user>/<account>/received/<hash of message id>/<n>-<name>` (never downloaded twice; 150 per run) and writes the key and size into `messages.json`; brain keeps a key only inside the account's own folder and gives an already stored message its key the first time a later read has one.
- Opening: `unibox.fileLink({ messageId, index })` returns a ten minute signed link (a download, or inline for png jpg gif webp); the page shows a kept attachment as a button.
- Erasure: removing a LinkedIn account deletes `kept/<user>/<account>/` first and keeps the account if that fails.
- Cloud (not applied): `deploy/gcp-setup.md` has the grant for brain on `uploads/` and `kept/`, and says `kept/` gets no lifecycle rule.

Deviations and not verified:

- Only pictures are kept from received messages. File cards, videos and voice messages are not: no recorded page shows their markup, so no selector could be written (the reader only knows an `img` in a bubble). The owner can record a conversation holding each with the devtools to add them.
- Not run live: the real markup of a message picture (`img.msg-s-event-message__image` and its `src`) is taken from the fixture; whether LinkedIn serves it without a redirect to the image host is unverified.
- Pictures of messages stored before this change get their key only if a later read finds them (the backfill), and only the 50 newest conversations of a read are looked at.
- No erasure for a user (no endpoint exists to delete a brain user; deleting the row cascades the database but not the bucket): open.
- Cold storage for old `kept/` files: later, as decided.
