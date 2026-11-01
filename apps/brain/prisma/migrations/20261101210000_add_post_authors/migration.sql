-- The author of every read post joins the owner's lists once (.plan/post-authors-network.md): a person as a target profile
-- labelled "from posts" (My network, default client, not read), a company as a /companies row. Only plain slugs are added.
-- A person already known (saved, archived, on a list, on My network) or do not contact, and a company already saved
-- (archived too), is left as it is. Nothing is read, so nothing is paid.

WITH links AS (
   SELECT
      snapshot."userId",
      substring(snapshot."data"->'author'->>'url' FROM '^https://(?:[a-z0-9-]+\.)*linkedin\.com/(in|company)/') AS "section",
      lower(substring(snapshot."data"->'author'->>'url' FROM '^https://(?:[a-z0-9-]+\.)*linkedin\.com/(?:in|company)/([^/?#]+)')) AS "slug"
   FROM "PageSnapshot" AS snapshot
   WHERE snapshot."kind" = 'POST'
),
authors AS (
   SELECT DISTINCT
      "userId",
      "section",
      "slug"
   FROM links
   WHERE "slug" IS NOT NULL
),
people AS (
   INSERT INTO "LinkedInProfile" ("id", "userId", "slug", "url", "tags", "updatedAt")
   SELECT
      gen_random_uuid()::text,
      author."userId",
      author."slug",
      'https://www.linkedin.com/in/' || author."slug",
      ARRAY['from posts'],
      CURRENT_TIMESTAMP
   FROM authors AS author
   WHERE author."section" = 'in'
      AND author."slug" ~ '^[a-z0-9_-]{2,100}$'
      AND NOT EXISTS (
         SELECT 1
         FROM "Person" AS person
         WHERE person."userId" = author."userId" AND person."slug" = author."slug"
      )
      AND NOT EXISTS (
         SELECT 1
         FROM "Suppression" AS suppression
         WHERE suppression."userId" = author."userId" AND suppression."slug" = author."slug"
      )
      AND NOT EXISTS (
         SELECT 1
         FROM "WorkflowListMember" AS member
         JOIN "WorkflowList" AS list ON list."id" = member."listId"
         WHERE list."userId" = author."userId" AND member."slug" = author."slug"
      )
   ON CONFLICT ("userId", "slug") DO NOTHING
),
companies AS (
   INSERT INTO "LinkedInCompany" ("id", "userId", "slug", "url", "tags", "updatedAt")
   SELECT
      gen_random_uuid()::text,
      author."userId",
      author."slug",
      'https://www.linkedin.com/company/' || author."slug",
      ARRAY['from posts'],
      CURRENT_TIMESTAMP
   FROM authors AS author
   WHERE author."section" = 'company' AND author."slug" ~ '^[a-z0-9._-]{2,100}$'
   ON CONFLICT ("userId", "slug") DO NOTHING
)
SELECT 1;
