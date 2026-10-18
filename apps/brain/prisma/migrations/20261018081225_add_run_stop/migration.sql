-- AlterEnum
ALTER TYPE "WorkflowRunStatus" ADD VALUE 'STOPPED';

-- AlterTable
ALTER TABLE "WorkflowRun" ADD COLUMN     "stopRequestedAt" TIMESTAMP(3);
