# Reuse what workflows already paid for

- Status: done
- Created: 2026-10-18
- Locked by user: yes, 2026-10-18
- Ships in: PR #63 (`feat/live-runs`), as asked

## Goal

Never pay twice for the same data. A full profile a workflow read shows in the person drawer with no second read, and the post someone commented on or reacted to is shown in the app instead of only as a link to LinkedIn.

## Today (checked in the code and on the owner's run `01a14e2c-…`)

- **"Get full profile" (`collect.profile`, the `enrich` executor):**
   - Pays about $0.004 a person; the run shows $0.032 for 8 people.
   - `profilesFrom` / `cardOf` in [operations.ts](../apps/brain/src/worker/data/operations.ts) keep only name, headline, location, followers, title and company on the workflow item.
   - The full profile (about, experience, education, skills, photo) is dropped, and no `PersonSnapshot` is written.
   - So the drawer shows "Read full profile · about $0.004" for someone already paid for.
- **"Find posts" and "Posts of people/companies" (`postsFrom`):**
   - The data service returns the post text and author, but only the link and the author link are kept.
   - A commenter's signal then holds the post link and their comment excerpt. The drawer's "Commented on a post" just links to LinkedIn.
- **Done sentence:** a workflow with no Score block says "Done: 0 qualified and 0 maybe for $0.052" although 8 people were added (all "No score yet").

## Proposal

1. **Keep the full profile a workflow paid for.**
   - When "Get full profile" gets its rows, it also saves each person's allow-listed `PersonSnapshot` (`snapshotFrom(row)`, the same mapper the drawer read uses) for the run's owner. The drawer then shows about, experience, education and skills at no cost, with "Read on <date>".
   - Retention is unchanged: a snapshot is kept only while the person is in a list or in /profiles.
   - Previews add nobody, so they store nothing.
2. **Skip people read recently (saves money on every later run).** "Get full profile" does not pay again for someone whose full profile the owner already has from the last 30 days (from a run or a drawer read). It fills them from the stored snapshot instead, and the estimate and the step note say "N already read, not paid again".
3. **Keep the post with the signal.**
   - Posts found by a workflow keep the whole post from the rows the data service already returned, using the same allow-list as the post drawer (`postSnapshotFrom`): full text (LinkedIn's limit is 3,000 characters), author name, avatar, headline and followers, posted date, media, article link, and reaction, comment and share counts.
   - When a commenter or reactor is found from that post, their signal carries it.
   - The drawer's "Why we found them" shows the post as LinkedIn does: the author line, the date, the text with "…see more", an image if any, and the counts. Their comment sits under it. A link to LinkedIn stays.
   - People found from posts in /posts that the owner already read use that stored post read. Otherwise, only the link shows, as now.
4. **Honest done sentence.** When nothing was scored: "Done: 8 people added to the list for $0.052, $0.0065 a person." It uses the count from the "Add to list" blocks.

## Requirements

Confirmed (by the owner's request): no second payment for a profile a workflow read; see the reacted or commented post on the platform; continue in PR #63, with a plan.

Answered by the owner on 2026-10-18:

- **Skip recent reads:** yes. Don't pay again for a full profile read in the last 30 days; use the stored one.
- **The post:** all of it, shown as on LinkedIn.
- **Older people:** no backfill.

Open questions: none.

## Scope and non-goals

- In scope: the snapshot write in `enrich`, the 30-day skip (if confirmed), a post preview on `PostItem` and on signals, the drawer's post preview, the done sentence, tests.
- Out of scope: reading posts for people found by hand; backfilling older people; the full comment thread of a post (the post drawer already offers it).

## Approach

- [x] 1. Lock this plan.
- [x] 2. Brain, tests first:
   - `enrich` writes a `PersonSnapshot` per profile row, except in previews.
   - The 30-day skip, if confirmed, also counted by `estimateGraph`.
   - `postsFrom` keeps the preview, and `PostItem` gains an optional `preview`.
   - `commentersFrom` / `reactorsFrom` put the preview on the signal (`Signal.post?`, optional, read with defaults for old data).
- [x] 3. Body:
   - "Why we found them" shows the post preview, with the comment under it.
   - The drawer stops offering a paid read when a snapshot from a run exists, and shows "Read <date> by <workflow>".
   - The done sentence uses the people added when nothing was scored.
- [x] 4. Verify:
   - All gates, plus brain integration (a run writes snapshots; a second run skips recent ones; signals carry the post preview).
   - One live run check if the owner agrees (a few cents).
   - Then MEMORY.md and Outcome.

## Edge cases and risks

- **Profile row without a link** (deleted profile): no snapshot is written and nothing breaks.
- **Many people:** snapshot upserts are batched inside the existing step. Up to 25 profiles per request already.
- **Privacy:** snapshots and post previews follow the existing retention. Snapshots go when the person leaves every list and /profiles, or on do not contact. Signals go with the member.
- **Old signals in JSON:** the signal schema reads `post` as optional, so old rows still parse.
- **A 30-day skip on stale data:** the drawer's "Read again" stays for anyone who wants fresh data.
- **Rollback:** a code revert. There is no migration (the JSON shapes only gain optional fields).

## Verification

- `pnpm lint && pnpm ts:check && pnpm test:unit:run && pnpm build`, plus the brain integration tests against `automatedlinkedin_test`.

## Outcome

- **Shipped:**
   - `PersonSnapshotService` (`save`, `recent`) is shared by the drawer read and `enrich`.
   - `enrich` saves a snapshot for every profile it pays for (not in previews). It reuses snapshots from the last 30 days at no cost; the step note says "N read in the last 30 days, not paid again."
   - `postsFrom` keeps `preview: postSnapshotFrom(row)`, and input posts from /posts take the owner's stored post read. Commenter and reactor signals carry `post`.
   - The drawer's "Why we found them" renders a LinkedIn-like `PostCard` (`components/posts/post-body.tsx`, shared with the post drawer).
   - The done sentence for unscored runs reads "Done: 8 people added to the list for $0.052, $0.007 a person." (`formatUsd` rounds to 3 decimals).
- **Deviations:**
   - The estimate does not subtract reused profiles. `estimateGraph` is pure and has no database; the estimate stays "up to".
   - The drawer shows the existing "Read <date>" and "Read again", without "by <workflow>".
   - Table pages (inbox, list members) send signals without `post` (`briefSignals`) to keep pages small. Undo still restores the full row, because `remove` returns raw rows.
   - Previews also reuse stored snapshots; they are read-only.
- **Not run:** the live paid run check, and a browser check of the drawer.
