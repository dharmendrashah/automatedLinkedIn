-- AlterTable
ALTER TABLE "WorkflowRun" ADD COLUMN     "parentRunId" TEXT;

-- AlterTable
ALTER TABLE "WorkflowStepRun" ADD COLUMN     "childRunId" TEXT;

-- CreateIndex
CREATE INDEX "WorkflowRun_parentRunId_idx" ON "WorkflowRun"("parentRunId");
