# Comments and reactions in the post drawer

- Status: done
- Created: 2026-10-18
- Locked by user: yes, 2026-10-18

## Goal

The post drawer gets buttons to see the post's comments and reactions, so a lead generator can read who engaged and what they said without building a workflow.

## Today (checked in the code)

- The post drawer (`posts/post-view.tsx`) shows the counts from the post read and "People found from this post" (list members only).
- Workflows already read engagement via `post-comments` and `post-reactions` (`worker/data/operations.ts`: `commentersParams`, `reactorsParams`, `commentersFrom`, `reactorsFrom`).
- Price: `PRICE_MICROS.engagement`, about $0.002 per comment or reaction row. "All" is capped at `ALL_CAP` (1,000) a post, so one "All" read can cost up to $2.
- Paid reads go through `database/paidRead.ts` (wallet floor, one ledger row per item a day, label on the statement). Snapshots live in `PageSnapshot` and are deleted on archive.

## Proposal

1. **Two buttons in the post drawer:** "See comments" and "See reactions". Each shows its price before you pay, based on the count from the post read: for example "Read 120 comments · about $0.24".
2. **How many:** a choice of "Up to 100" (the default) or "All" (up to 1,000), the same as the workflow block.
3. **Comments tab:** commenter name, headline, followers, date and the full comment text. Replies are included and indented. The post's author and company comments are shown but marked.
4. **Reactions tab:** name, headline, location and the reaction type (Like, Celebrate, ...), with a filter by type.
5. **Each person opens their person drawer** (replacing the post drawer, with "Back"). People not in the workspace open the drawer by their link, with the "Read full profile" button.
6. **Add to a list:** "Add all to list" and a per-row "Add" put people into a chosen list, with the `commented` or `reacted` signal, exactly like a workflow would. People marked do-not-contact are skipped.
7. **Storage and cost:** read once a day per post and kind. The result is kept as a `PageSnapshot` (new kinds `POST_COMMENTS` and `POST_REACTIONS`) while the post is in /posts, and deleted on archive. The statement shows "Comment reads" and "Reaction reads".

## Requirements

Confirmed:

- A button in the post drawer to see all comments and reactions.
- Answered by the owner on 2026-10-18 (all as proposed): per-row price with "Up to 100" by default and "All" (up to 1,000) as a choice, price shown first; replies included and marked, author and company comments marked; "Add all to list" and per-row "Add"; stored once a day, deleted on archive, labelled "Comment reads" / "Reaction reads".

Open questions: none.

## Scope and non-goals

- In scope: the two buttons, the read, the two tabs, links to person drawers, add to list (if confirmed), storage and retention, tests.
- Out of scope: replying or reacting from the app, paging beyond 1,000, live updates.

## Approach

- [x] 1. Lock this plan.
- [x] 2. Brain:
   - Allow-listed comment and reaction mappers (unit tests first). Reuse `commentersParams` and `reactorsParams` with the existing row fields.
   - Additive migration: `PageKind` gets `POST_COMMENTS` and `POST_REACTIONS`.
   - `PostPageService.readEngagement(kind, limit)` on `paidRead`, plus the snapshots in `detail`.
   - `postPage.readEngagement` and `postPage.addToList` (if confirmed).
   - Integration tests.
- [x] 3. Body: buttons with the price, the tabs, the reaction filter, person links, add to list.
- [x] 4. Verify (all gates, integration tests, one live read of a small post), then MEMORY.md and Outcome.

## Edge cases and risks

- **A busy post:** "All" stops at 1,000 rows; the drawer says so when the count is higher.
- **Unknown counts:** if the post was not read yet, the price shows as "up to" the chosen limit.
- **Double click or two tabs:** one ledger row per post, kind and day, so it pays once.
- **Wallet below the floor:** refused with the usual message.
- **Nothing found (deleted or private post):** nothing stored; "No comments were found."
- **Privacy:** comment text and names are personal data; they are kept only while the post is in /posts and are part of the owner's erasure.
- **Do not contact:** shown with the badge and never added to a list.
- **Migration:** adding enum values is additive. Rollback is a code revert.

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, plus the brain integration tests.
- One live read of comments and reactions on a small post (a few cents).

## Outcome

- **Shipped:**
   - Migration `add_post_engagement_kinds`: `PageKind` gains `POST_COMMENTS` and `POST_REACTIONS`.
   - `core/engagementSnapshot.ts`.
   - `PostEngagementService` (detail, read, addToList).
   - tRPC `postPage.engagement`, `readEngagement` and `addToList`.
   - Body `posts/post-engagement.tsx`: Comments and Reactions tabs, read buttons with the price, a list picker, "Add" per row and "Add all".
   - `paidRead` now passes all rows to `store` and takes a `variant`, so "up to 100" and "all" are separate reads on the same day.
   - `WorkflowListService.addPicked` adds people with no run.
- **Deviations:**
   - The data service does not mark replies, so replies are included but shown flat, not indented.
   - People who are not in a list open on LinkedIn; their person drawer opens once they are added, since person snapshots are kept only for workspace people.
   - Added people get state "Not scored".
- **Live check:** 5 comments and 5 reactions (about $0.02) returned every mapped field. Comment dates are ISO timestamps.
- **Verified:** lint, ts:check, unit, build, and brain integration (81). Not checked in a browser, because that needs sign-in.
