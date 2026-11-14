-- AlterTable: a positive lead may belong to no campaign yet
ALTER TABLE "PositiveReply" ALTER COLUMN "campaignId" DROP NOT NULL;

-- CreateIndex: nulls are distinct in the (campaignId, slug) unique index, so one unassigned row per person is kept by its own index
CREATE UNIQUE INDEX "PositiveReply_userId_slug_unassigned_key" ON "PositiveReply"("userId", "slug") WHERE "campaignId" IS NULL;
