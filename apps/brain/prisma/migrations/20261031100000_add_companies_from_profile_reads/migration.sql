-- Every LinkedIn company in the profile reads already stored is added to the owner's /companies once, labelled "From profiles"
-- (.plan/network-drawer-redesign.md). Companies already saved are left as they are; slugs with escaped characters are skipped.

INSERT INTO "LinkedInCompany" ("id", "userId", "slug", "url", "name", "tags", "updatedAt")
SELECT DISTINCT ON (found."userId", found."slug")
   gen_random_uuid()::text,
   found."userId",
   found."slug",
   'https://www.linkedin.com/company/' || found."slug",
   found."name",
   ARRAY['From profiles'],
   CURRENT_TIMESTAMP
FROM (
   SELECT
      snapshot."userId",
      substring(role->>'companyUrl' FROM '^https://www\.linkedin\.com/company/([a-z0-9._-]+)$') AS "slug",
      NULLIF(role->>'company', '') AS "name"
   FROM "PersonSnapshot" AS snapshot
   CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(snapshot."data"->'experience') = 'array' THEN snapshot."data"->'experience' ELSE '[]'::jsonb END
   ) AS role
) AS found
WHERE found."slug" IS NOT NULL
ORDER BY found."userId", found."slug", found."name" NULLS LAST
ON CONFLICT ("userId", "slug") DO NOTHING;
