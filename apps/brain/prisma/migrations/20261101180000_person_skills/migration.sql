-- AlterTable
ALTER TABLE "Person" ADD COLUMN "skills" TEXT[];

-- CreateIndex
CREATE INDEX "Person_skills_idx" ON "Person" USING GIN ("skills");

-- Backfill from each owner's saved profile read; the people index keeps it current from now on.
UPDATE "Person" p
SET "skills" = ARRAY(SELECT jsonb_array_elements_text(s."data"->'skills'))
FROM "PersonSnapshot" s
WHERE s."userId" = p."userId"
  AND s."slug" = p."slug"
  AND jsonb_typeof(s."data"->'skills') = 'array';
