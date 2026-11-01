# Post drawer that looks like a LinkedIn post

- Status: done
- Created: 2026-11-01
- Locked by user: yes, 2026-11-01 (the request settles it: "plan this and work on this improvements")

## Goal

The post drawer shows a profile-style cover, a big round photo and "Posted 2026-10-26T12:46:55.376Z". Make it read like the post on LinkedIn: the author line, the text, the media (through `/cdn`), the counts, and an action bar that gets the comments and reactions.

## What exists (checked in code, 2026-11-01)

- `components/posts/post-view.tsx`: `ThePost` in a `Cover` (banner, 96 px photo), `PostText`, `PostMedia`, `PostNumbers`, buttons Open on LinkedIn / The author / Read post; then People found, `PostEngagement` (tabs Comments / Reactions with `ReadChoices` paid reads and the lists), Workspace.
- `components/posts/post-body.tsx`: `PostText` (see more), `PostImage` (`useMediaSource`, so `/cdn` first), `PostMedia` (image, else a link; files through `cdnUrlOf`), `PostNumbers`, `PostCard` (the small card in the person drawer).
- `postedAt` from the read is an ISO time (seen in the screenshot), so `postedText` (`post-row.ts`) gives "6 days ago".

## Requirements

- The post card looks like LinkedIn's: repost note, author photo (round, square for a company), name, headline, "6d" and a LinkedIn link at the top right; the text with see more; the media full width; the counts row (reactions left, comments and reposts right); an action bar.
- Media only through the CDN (`useMediaSource` / `cdnUrlOf`): image inline, video playable, document or other file as a tile that opens through the CDN, article as a link tile.
- Counts always shown when read. Clicking reactions or comments (counts or the action bar) opens that tab of "Comments and reactions" and scrolls to it, where the get buttons are (price first, as today).
- A post not read yet shows its link and a "Get details · $0.002" call to action in place of the text.
- The person drawer's `PostCard` uses the same author line.

Open questions: none.

## Scope and non-goals

- In scope: `post-view.tsx`, `post-body.tsx`, `post-engagement.tsx` (controlled tab), body unit tests for pure helpers.
- Out of scope: brain, new reads, reacting or commenting on LinkedIn, the People found and Workspace sections.

## Approach

- [x] Plan.
- [x] `post-body.tsx`: `PostAuthor` (shared header), `PostMedia` (image, video, file tile, article tile, all through the CDN), `PostCounts` (clickable).
- [x] `post-view.tsx`: LinkedIn-style card replaces the cover; action bar Reactions, Comments, Author; Read post / Read again under it.
- [x] `post-engagement.tsx`: tab controlled by the drawer; the section can be scrolled to.
- [x] `PostCard` uses `PostAuthor`.
- [x] Checks, `MEMORY.md`, commit.

## Edge cases and risks

- No read: no counts, no media; the call to action reads it.
- A count of null: left out; 0 shown as 0.
- Media type unknown or missing: a file tile, never a raw supplier link (always `cdnUrlOf`).
- Image that does not load through the CDN or the original: `useMediaSource` falls back to nothing, the card stays.
- `postedAt` that is not a date: shown as given.
- Drawer accessibility: the author name stays the `DrawerTitle`.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`. The drawer behind sign-in is seen by the owner.

## Outcome

Shipped as planned; lint, ts:check, unit tests and build pass. Not seen in a browser by the agent. Comments and reactions now sit right under the post (above People found), as on LinkedIn. The posted time reads "6 days ago" (the app's `timeAgo`), not LinkedIn's "6d". Video playback through `/cdn` is unverified (no read with a video seen yet).
