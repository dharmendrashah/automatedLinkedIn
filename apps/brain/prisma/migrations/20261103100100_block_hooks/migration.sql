-- AlterTable
ALTER TABLE "WorkflowRun" ADD COLUMN     "hooks" JSONB,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'MAIN',
ADD COLUMN     "resumes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WorkflowDelivery" ALTER COLUMN "taskEventId" DROP NOT NULL,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'TASK',
ADD COLUMN     "hostRunId" TEXT,
ADD COLUMN     "hostNodeId" TEXT,
ADD COLUMN     "round" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tries" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resumes" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex: one delivery per fire of a hook. Nulls are distinct, so rows from task events never clash.
CREATE UNIQUE INDEX "WorkflowDelivery_hostRunId_hostNodeId_phase_round_tries_res_key" ON "WorkflowDelivery"("hostRunId", "hostNodeId", "phase", "round", "tries", "resumes");

-- CreateIndex: only main runs hold the workflow's one live-run slot. The new index is made before the old one is dropped.
CREATE UNIQUE INDEX "WorkflowRun_workflowId_running_main_key" ON "WorkflowRun"("workflowId") WHERE "status" = 'RUNNING' AND "kind" = 'MAIN';
DROP INDEX "WorkflowRun_workflowId_running_key";

-- CreateIndex
CREATE INDEX "WorkflowRun_kind_status_idx" ON "WorkflowRun"("kind", "status");
