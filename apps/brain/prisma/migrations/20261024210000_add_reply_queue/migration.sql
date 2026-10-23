-- AlterEnum
ALTER TYPE "LinkedInReplyState" ADD VALUE 'QUEUED';

-- AlterTable
ALTER TABLE "LinkedInReply" ADD COLUMN     "startedAt" TIMESTAMP(3),
ALTER COLUMN "sessionId" DROP NOT NULL;

-- A reply that already has a run was started when it was created.
UPDATE "LinkedInReply" SET "startedAt" = "createdAt" WHERE "sessionId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "LinkedInReply_accountId_startedAt_idx" ON "LinkedInReply"("accountId", "startedAt");
