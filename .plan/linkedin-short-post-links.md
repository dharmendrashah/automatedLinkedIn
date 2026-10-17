# Expand LinkedIn short post links

- Status: done
- Created: 2026-10-17
- Locked by user: yes, 2026-10-17 (the request settles the requirements)

## Goal

The data service cannot read `lnkd.in/p/<code>` short links. Save both forms of a short post link and send the expanded one.

## Requirements

- When posts are saved, a short link is expanded by reading the `Location` of the redirect (no body is fetched, the redirect is not followed); the short link stays the saved `url`, the expanded one goes in a new `expandedUrl`.
- When a workflow sends a post to the data service it uses `expandedUrl`; a short post without one (older rows, or the expansion failed at save time) is expanded by the worker first and saved.
- Only `https://lnkd.in/p/<code>` is ever requested (SSRF guard), with a timeout; only a `linkedin.com` post link is accepted as the target, saved without its query string (it carries tracking ids).

## Edge cases

- Expansion fails or times out: the post is still saved; the worker tries again before sending.
- The redirect points somewhere that is not a LinkedIn post: ignored.
- A short link and its long form stay two posts (slugs differ), as before.
- Additive migration `add_linkedin_post_expanded_url`.

## Verification

- Unit tests for the expander (redirect, non-LinkedIn target, failure); lint, ts:check, unit, build; a real expansion of the link from the request.

## Outcome

- Shipped as planned: `core/shortLink.ts`, `LinkedInPost.expandedUrl`, expansion on save in `linkedInPost.create`, and `sendableUrl` in the engine for posts saved before (the post in the failed run is expanded on its next run).
- Verified: lint, ts:check, unit tests (expander, save with a short link), build, brain integration tests; a real `HEAD` on two lnkd.in links returned 301 with the post; the data service read the expanded link (2 reactions returned, about $0.004).
- Not changed: a short link and its long form are still two posts.
