-- A run keeps the rules it started under, and a step keeps which of its outputs gave something
-- (.plan/workflow-engine-p2-run-semantics.md). Runs that exist stay on version 1.
ALTER TABLE "WorkflowRun" ADD COLUMN "engineVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "WorkflowStepRun" ADD COLUMN "emits" TEXT[] DEFAULT ARRAY[]::TEXT[];
