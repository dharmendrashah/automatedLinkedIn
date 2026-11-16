-- Marks the posts a campaign's Discover runs already kept as processed (one-time backfill; safe to run again).
-- Mark posts done matched nothing before (the posts of Find posts have no row id on their items), so they all stayed UNPROCESSED.
-- Only posts that carry one of the same owner's campaign labels are touched; a post added by hand has no label and stays.
UPDATE "LinkedInPost" p
SET "status" = 'PROCESSED'
WHERE p."status" = 'UNPROCESSED'
  AND p."tags" && ARRAY(SELECT c."label" FROM "Campaign" c WHERE c."userId" = p."userId");
