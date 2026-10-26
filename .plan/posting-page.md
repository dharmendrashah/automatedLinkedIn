# Posting page (UI and UX)

- Status: done
- Created: 2026-10-25
- Locked by user: yes, 2026-10-25 (answers to the seven questions below)

## Goal

A "Write a post" page (route `/posting`) in `apps/body` where the owner picks one of their LinkedIn accounts, builds a post from blocks (text, photos, video, link, emoji) on a canvas, sees it as LinkedIn will show it (their own photo, name, headline, reaction, comment, repost and send buttons) while editing, keeps it as a draft by default, and chooses to schedule it or post it now. Drafts are saved in the database through brain (owner's choice, widened from the first "UI and UX only" request). Publishing itself (Post now, a scheduled send) is not built here: no queue and no spider task.

## Requirements

Confirmed (from the request):

- A page called Posting. Step 1: select an account. Step 2: the post-building canvas for that account.
- Blocks the owner can add: photo, video, link, emoji, text, and similar.
- A live preview next to the editor: the account's photo, name and headline, the post as it will read, and the reaction, comment and share buttons.
- A post is a draft by default; from there the owner can schedule it for later or send it now.
- No sample or invented data. Everything shown is real: the owner's accounts (`linkedInAccount.list`), the account's stored profile (`accountProfile.state` and `accountProfile.get`: name, headline, photo), the owner's own text and files.

Locked answers (owner, 2026-10-25):

- Drafts are stored by brain in the database (a `PostDraft` table, owner-scoped), with text and structure only.
- Files (photos, video) are real files the owner picks; they are previewed from the file itself and kept in memory until the tab closes (as the Unibox composer does). Their name, size and alt text are saved with the draft; a draft reloaded without the file shows "Attach again". No file is uploaded.
- The preview never shows numbers (no likes, comments or shares): the buttons are shown, the counts are not, because none exist.
- Schedule opens a real picker and saves the chosen time on the draft as "Planned for ..."; Post now is disabled with a plain reason until publishing exists, since nothing can send yet. Neither button pretends to have sent anything.

- Schedule saves a planned time on the draft; Post now is disabled with a plain reason.
- Blocks: Text, Photos, Video, Link; the emoji picker is inside the text block. No Poll, Document, Mention or Hashtag blocks yet.
- The link card shows the host and address only; nothing is fetched.
- Only `ACTIVE` accounts can be picked; others show greyed with the reason.
- Sidebar and page name: "Write a post" (the existing "LinkedIn posts" page lists other people's posts to target).

Open questions (must be empty before locking):

- None.

## Scope and non-goals

- In scope:
  - Contract `packages/contracts/src/posting.ts`: limits, block schemas and the one-attachment rule, shared by brain and body.
  - Brain: model `PostDraft` (migration `add_post_draft`, additive), `PostDraftService` in `src/database`, router `postDraft` (`list`, `get`, `save`, `remove`, all `ownerProcedure`, scoped to `ctx.user.id`), unit and integration tests.
  - Route `/posting` (account picker plus the owner's drafts) and `/posting/:accountId/:draftId?` (canvas), lazy-loaded, full width (`grid w-full gap-4 px-4 lg:px-6`), sidebar entry, one line in `lib/page-title.ts`.
  - Block canvas, live preview, device drafts with autosave, schedule picker, Post now button state, keyboard and screen-reader support.
  - Pure, tested logic next to the code.
- Out of scope (later, with their own plan): a scheduled or immediate send (queue, spider task, states beyond draft), uploading media to the bucket, the spider task that publishes, retries and failure states, link metadata fetch, mentions that resolve to real people, analytics, comment and reaction counts after posting, team approval. The browsing budget and office hours of an account will have to apply to publishing; note that in the backend plan.

## Design

### Flow

1. `/posting`: heading, then the owner's accounts as cards (photo, name from the stored profile, email, status, client label when set). Pick one to start a new post. Below, "Your drafts" (this device), newest first, each with account, first words, kind of media, planned time; open or delete (with Undo).
2. `/posting/:accountId`: a new draft is created on the first edit, not on arrival, so opening and leaving leaves nothing behind. `/posting/:accountId/:draftId` reopens one.
3. Header of the canvas: back to accounts, account chip (switch account = confirm, the preview identity changes), save state ("Saved on this device", "Saving"), then Schedule and Post now.

### Layout

- Wide screens: editor (left, canvas of blocks) and preview (right, sticky). Narrow: a two-tab switch "Edit" and "Preview"; no horizontal scroll.
- Add-block bar: at the end of the canvas and as a "+" between blocks (Text, Photos, Video, Link). Each block is a card with a move up, move down, duplicate-free remove (with Undo toast), and a drag handle that is never the only way to reorder.
- The canvas is a vertical sequence, not React Flow: a post is linear, so nodes and lines add nothing.

### Blocks and the rules LinkedIn applies

- Text: the post's words, up to 3,000 characters with a live counter that warns near the limit and refuses beyond it; line breaks kept; emoji button opens a picker and inserts at the cursor; hashtags and links are recognised for the preview.
- Photos: several images in one block (order matters). Each has an optional alt text field.
- Video: one file.
- Link: one https address (validated; anything else is refused with a sentence, never linked).
- LinkedIn lets a post carry one kind of attachment: photos, or one video, or one link (not mixed). The picker disables the other kinds with the reason ("A post can hold photos or a video or a link") instead of letting the owner build something that cannot be posted. Several text blocks join in order with a blank line.
- File limits (kinds, sizes, count) sit in one `limits.ts`; the exact numbers are verified against LinkedIn's current help pages before coding, because they are not confirmed here.

### Preview

- A card in LinkedIn's own look (always the light look, so it matches what readers see, with a "Preview" label): round photo (`Photo` over initials), name, headline, "Now" and the public globe mark, the text with "...see more" at LinkedIn's cut (about 3 lines; approximate, labelled so), hashtags and links in blue, media laid out like LinkedIn (1, 2, 3, 4 and "+N" for photos; a player frame for video from the file's first frame; a link card with host and address), then the Like, Comment, Repost and Send buttons. Buttons are inert and not tabbable; the region is labelled "Post preview" for screen readers.
- Desktop and mobile width toggle.
- An account whose profile was never read: the card shows its initials and email, and one line "Read the profile of this account to see its name and photo here" linking to `/accounts/:id`. Never an invented name.

### Draft, schedule, send

- Draft is the default and the only state the page can reach by itself. Autosave on change (debounced) to this device; save errors (storage full or blocked) are shown, not swallowed.
- Schedule: date and time in the account's time zone (the browser's when the account has none), presets (tomorrow morning, next Monday morning, this afternoon), custom pick, a plain sentence of what will happen, refusing times in the past or under 10 minutes ahead. Shows the zone name.
- Post now: a disabled button; the page says in a notice that posting is not connected yet. No confirm dialog (YAGNI until it can send).
- An empty draft is never created; one that is emptied after it exists stays and shows as "Empty draft" in the list, where it can be deleted (with Undo).

### Files (all under `apps/body/src/components/posting/`, except the pages)

- `draft.ts`: draft and block types, reducer (add, edit, move, remove, restore), kind rules.
- `limits.ts`: characters, files, link rules.
- `preview-text.ts`: split text into plain, hashtag and link parts; the "see more" cut.
- `schedule.ts`: presets, validation, sentence.
- `drafts-store.ts` and `source.ts` are not needed: drafts go through the `postDraft` tRPC router (`list`, `get`, `save`, `remove`); `use-autosave.ts` debounces `save`.
- Brain: `PostDraft` (`id`, `userId`, `accountId` cascade, `blocks` Json validated on write and on read with the contract, `plannedAt`, `plannedZone`, `createdAt`, `updatedAt`); a draft is always a draft, so there is no state column until publishing exists. Limits: 200 drafts per owner, blocks at most 20, a body under 200 KB. The account must belong to the owner (a foreign id answers NOT_FOUND). Removing an account removes its drafts. `save` with no id creates, with an id updates only the owner's row.
- `use-autosave.ts`, `account-card.tsx`, `drafts-list.tsx`, `block-card.tsx`, `text-block.tsx`, `photos-block.tsx`, `video-block.tsx`, `link-block.tsx`, `emoji-picker.tsx`, `add-block.tsx`, `post-preview.tsx`, `schedule-dialog.tsx`, `post-now-dialog.tsx`.
- Pages: `pages/Posting.tsx`, `pages/PostingCanvas.tsx`.
- Reuse: `Photo`, `linkedInHref`-style URL checks (a new `httpsLink` beside it), shadcn `Card`, `Dialog`, `Popover`, `Calendar` if present (else a native date and time input), sonner toasts for Undo, `useDocumentTitle`.
- Emoji picker: a small built-in set grouped by category, no new dependency (decision to confirm if the owner wants search and skin tones, which would need a library).

## Approach

- [ ] Lock the open questions with the owner.
- [ ] Tests first for the contract (`posting.ts`), then `draft.ts`, `preview-text.ts`, `schedule.ts`.
- [ ] Brain: schema, additive migration, service, router, tests.
- [ ] Account picker page with real accounts and profiles, empty and loading and error states, and the drafts list.
- [ ] Canvas: blocks, add bar, move and remove with Undo, autosave.
- [ ] Preview component and the narrow-screen tab switch.
- [ ] Schedule dialog and Post now dialog.
- [ ] Route, sidebar entry, page title, lazy chunk.
- [ ] Walk through in a real browser (light and dark, narrow and wide, keyboard only).
- [ ] Update `MEMORY.md`, set status `done`.

## Edge cases and risks

- No accounts, or none `ACTIVE`: the picker explains why and links to `/accounts`; nothing to pick is not an error screen.
- Account removed or paused after a draft was saved: the draft stays, shows "This account is no longer available", can be moved to another account or deleted, never silently re-pointed.
- Profile photo address expired or blocked: `Photo` falls back to initials. Profile never read: see Preview.
- Very long text, only whitespace, only emoji, right-to-left text, text pasted with odd line endings: counted by characters the way LinkedIn counts (to verify), trimmed on save of the final text only, never mid-typing.
- Mixed media attempted: prevented in the UI, and the reducer also refuses it (a test), so a pasted or restored draft cannot hold it.
- Files: wrong type, too large, too many, duplicates, a file that cannot be read; object URLs are revoked on removal and on leaving the page (no leak); no file is uploaded or leaves the device.
- Links: only `https` is accepted; `javascript:` and `data:` never rendered as links; the host is shown as text; nothing is fetched, so no request goes to a stranger's server from the page.
- Stored drafts: validated on read (a row whose blocks no longer fit the contract is skipped from the list and reported as unreadable, never a crash); two tabs editing one draft: last write wins, with `updatedAt` returned so the page can tell when another tab saved (it then refreshes instead of overwriting blindly); a failed save is shown with a Retry, never swallowed; saves are debounced and the last one wins in order (a slower earlier save never overwrites a later one).
- Time: a scheduled time is saved with its zone name and as an instant; a daylight-saving gap or repeat is handled by the date library or refused with a sentence; the clock is the device's, which is why the server will have to re-check later.
- Schedule or Post now clicked twice: Post now is disabled in this plan; later the backend must be idempotent (note for that plan).
- Accessibility (`ACCESSIBILITY.md`): every drag action has a button, focus moves sensibly after adding or removing a block, the counter and save state are announced politely, the preview is labelled, contrast holds in dark mode.
- Compliance: this posts on the signed-in owner's own account within LinkedIn's rules; the page offers no bulk or spam features, and the backend plan must respect the account's browsing budget and pace.
- Bundle: the page is lazy-loaded (the main chunk is near its 500 kB limit; see `MEMORY.md`).
- Privacy: a draft holds the owner's own words and file names; it is owner-scoped, deleted with the account, and never logged.
- Rollback: additive migration (a new table); remove the route, sidebar line and router; the table can stay.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build` from the repo root, all clean.
- In a real browser, signed in: pick a real account, build text, photos, video and link posts, watch the preview, reload to confirm drafts return, schedule with a preset and a custom time, see Post now disabled with its reason, repeat at narrow width, in dark mode and with the keyboard only. State anything that could not be run.

## Outcome

Filled in 2026-10-25.

Shipped: contract `packages/contracts/src/posting.ts`; table `PostDraft` (migration `20261025020000_add_post_draft`, additive), `PostDraftService`, router `postDraft` (`list`, `get`, `save`, `remove`), `displayName` and `imageUrl` added to the account list; body pages `/posting` (account picker with real accounts, drafts list with Undo on delete) and `/posting/:accountId/:draftId?` (canvas with text, photos, video and link blocks, emoji picker, live LinkedIn-style preview with desktop and mobile width, autosave, plan-a-time dialog, disabled Post now), sidebar entry and tab title "Write a post".

Deviations: body keeps its own copy of the few rules it needs (`components/posting/rules.ts`) because the contracts package is CommonJS and cannot be imported for values in the browser; `rules.unit.test.ts` fails when the two differ. Changing the account in the canvas has no confirm dialog (the preview changes at once and it is undone by choosing again). Two tabs editing one draft: last write wins (no `updatedAt` check). The estimated "see more" cut and the limits (3,000 characters, 20 photos, 8 MB a photo, 512 MB a video) are not verified against LinkedIn.

Follow-ups: publishing and scheduled sending (queue, spider task, states beyond draft, the account's browsing budget), upload of files, link title and picture, a walk-through in a real browser behind sign-in (not done).
