/*
  Warnings:

  - A unique constraint covering the columns `[runId,nodeId,round,slug]` on the table `WorkflowItem` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[runId,nodeId,round]` on the table `WorkflowStepRun` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "WorkflowListMemberState" ADD VALUE 'UNSCORED';

-- DropIndex
DROP INDEX "WorkflowItem_runId_nodeId_slug_key";

-- DropIndex
DROP INDEX "WorkflowStepRun_runId_nodeId_key";

-- AlterTable
ALTER TABLE "WorkflowItem" ADD COLUMN     "keepUntil" TIMESTAMP(3),
ADD COLUMN     "round" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WorkflowStepRun" ADD COLUMN     "round" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowItem_runId_nodeId_round_slug_key" ON "WorkflowItem"("runId", "nodeId", "round", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStepRun_runId_nodeId_round_key" ON "WorkflowStepRun"("runId", "nodeId", "round");
