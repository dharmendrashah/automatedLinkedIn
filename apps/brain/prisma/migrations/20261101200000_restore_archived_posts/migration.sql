-- Archive is gone from /posts (.plan/posts-page-redesign.md): archived posts come back as done and labelled "archived",
-- so a workflow (which reads posts still to work through) never pays to read them again. Data only; no column changes.
UPDATE "LinkedInPost"
SET
   "archivedAt" = NULL,
   "status" = 'PROCESSED',
   "tags" = CASE
      WHEN 'archived' = ANY ("tags") OR cardinality("tags") >= 20 THEN "tags"
      ELSE array_append("tags", 'archived')
   END,
   "updatedAt" = NOW()
WHERE "archivedAt" IS NOT NULL;
