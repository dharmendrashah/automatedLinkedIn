# Body: load third-party media through /cdn

- Status: done <!-- draft | locked | in progress | done -->
- Created: 2026-10-30
- Locked by user: yes, 2026-10-30 ("update the frontend everywhere we fetch media from a third-party server apart from the storage bucket"; same PR #135)

## Goal

Every picture or video the app draws from another site (LinkedIn photos, covers, post images) loads through
`<VITE_API_URL>/cdn?url=...` (`.plan/cdn-public-endpoint.md`), so it keeps showing after the remote link expires.

## Requirements

- Third-party `https` media only. Left as is: our bucket links (`*.googleapis.com`, signed and private: copying them would make
  private files public), our own hosts (`*.elitale.com`, `localhost`), `data:`, `blob:` (local previews), and LinkedIn private
  message pictures (`www.linkedin.com/dms/prv/...`, they need the account's cookies).
- Links the user clicks (`<a href>` to a post, video or article) stay direct: they open pages, not files.
- If the cached copy fails (cache not set up, remote refused), the original address is tried once, then the existing fallback
  (initials, nothing) shows. So a deployment without `CDN_GCS_BUCKET` looks as before.

Open questions: none.

## Approach

- [x] `lib/cdn.ts`: `cdnUrlOf(url, api)` and `mediaSource(url, failures, api)` (pure, unit tested).
- [x] `lib/use-media-source.ts`: `useMediaSource(url)` gives `{ src, onError }`.
- [x] Use it in the four render sites of third-party media: `Photo` (accounts, profile header and cover, Unibox avatars),
      `ProfileImage` in `details/detail-parts.tsx`, `PostMedia` in `posts/post-body.tsx`, the reactor/commenter avatar in
      `posts/post-engagement.tsx`.
- [x] Not changed (not third-party): post composer previews and uploads (`blob:` and signed bucket links), kept message pictures
      (signed), session recordings (signed), takeover screenshots (`data:`).
- [x] Audit (2026-10-30, every `img`, `video`, `audio`, `source`, `iframe`, `AvatarImage`, `window.open` and media `href` in
      body and `packages/ui`): the Unibox chat window draws only avatars (through `Photo`); message pictures, videos, audio and
      documents are local (`blob:`) or kept in the private bucket and opened by a signed link, so they stay direct. The one gap was
      the post's non-image media link: a `video`, `audio`, `document` or `pdf` link now opens through `/cdn` (no fallback is
      possible on a link); any other kind opens where it is.

## Edge cases and risks

- `/cdn` answers 503/502 -> one more request to the original, then the fallback. A dead original gives two failed requests.
- Expired LinkedIn link never cached before -> `/cdn` gets 403/404 from LinkedIn -> original also fails -> fallback.
- First view of a new picture waits for brain to fetch and store it (one remote fetch); later views are cached redirects.
- Every distinct LinkedIn URL (rotating `e=`/`t=`) is stored once (locked answer 8 of the cdn plan).
- No secrets; the API base is the existing `VITE_API_URL`.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`.

## Outcome

Shipped as planned in PR #135 (second commit). Not checked in a browser against staging (needs the PR deployed with
`CDN_GCS_BUCKET`).
