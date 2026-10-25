-- AlterTable
ALTER TABLE "PostPublication" ADD COLUMN     "nodeId" TEXT,
ADD COLUMN     "runId" TEXT;

-- CreateIndex
CREATE INDEX "PostPublication_runId_nodeId_idx" ON "PostPublication"("runId", "nodeId");
