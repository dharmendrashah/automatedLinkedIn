-- Copies the labels of campaign-run list members onto their Person rows (one-time backfill; safe to run again).
WITH members AS (
  SELECT l."userId", m."slug", m."createdAt", m."id", m."tags"
  FROM "WorkflowListMember" m
  JOIN "WorkflowList" l ON l."id" = m."listId"
  JOIN "WorkflowRun" r ON r."id" = m."addedByRunId"
  JOIN "Workflow" w ON w."id" = r."workflowId"
  WHERE w."campaignId" IS NOT NULL
), per_person AS (
  SELECT members."userId", members."slug",
         array_agg(u.t ORDER BY members."createdAt", members."id", u.n) AS "tags"
  FROM members
  CROSS JOIN LATERAL unnest(members."tags") WITH ORDINALITY AS u(t, n)
  GROUP BY members."userId", members."slug"
)
UPDATE "Person" p
SET "labels" = COALESCE(p."labels", '{}') || ARRAY(
  SELECT x.t
  FROM unnest(per_person."tags") WITH ORDINALITY AS x(t, n)
  WHERE NOT x.t = ANY(COALESCE(p."labels", '{}'))
  GROUP BY x.t
  ORDER BY min(x.n)
  LIMIT GREATEST(0, 20 - COALESCE(cardinality(p."labels"), 0))
)
FROM per_person
WHERE p."userId" = per_person."userId" AND p."slug" = per_person."slug";
