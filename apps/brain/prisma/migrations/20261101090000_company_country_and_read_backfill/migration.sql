-- AlterTable
ALTER TABLE "LinkedInCompany" ADD COLUMN "country" TEXT;

-- CreateIndex
CREATE INDEX "LinkedInCompany_userId_country_idx" ON "LinkedInCompany"("userId", "country");

-- CreateIndex
CREATE INDEX "LinkedInCompany_userId_industry_idx" ON "LinkedInCompany"("userId", "industry");

-- Fill each company from its saved read; the read wins where it has a value (.plan/companies-table.md).
UPDATE "LinkedInCompany" AS c
SET
   "name" = COALESCE(NULLIF(p."data"->>'name', ''), c."name"),
   "industry" = COALESCE(NULLIF(p."data"->>'industry', ''), c."industry"),
   "website" = COALESCE(NULLIF(p."data"->>'website', ''), c."website"),
   "size" = COALESCE(NULLIF(p."data"->>'employeeRange', ''), c."size"),
   "location" = COALESCE(NULLIF(p."data"->>'headquarters', ''), c."location"),
   "country" = COALESCE(
      NULLIF(p."data"->'address'->>'country', ''),
      NULLIF(TRIM(REGEXP_REPLACE(p."data"->>'headquarters', '^.*,', '')), ''),
      c."country"
   )
FROM "PageSnapshot" AS p
WHERE p."userId" = c."userId"
   AND p."slug" = c."slug"
   AND p."kind" = 'COMPANY';
