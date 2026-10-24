-- AlterTable
ALTER TABLE "LinkedInProfileVisit" ADD COLUMN     "nodeId" TEXT,
ADD COLUMN     "runId" TEXT;

-- CreateIndex
CREATE INDEX "LinkedInProfileVisit_runId_nodeId_idx" ON "LinkedInProfileVisit"("runId", "nodeId");
