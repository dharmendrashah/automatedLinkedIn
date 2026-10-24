-- AlterTable
ALTER TABLE "WorkflowStepRun" ADD COLUMN     "tries" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "waitUntil" TIMESTAMP(3);
