-- Why a workflow step failed or ended with gaps (.plan/workflow-hardening-and-block-details.md). Additive: older steps keep
-- their sentence and show the generic explanation.
ALTER TABLE "WorkflowStepRun" ADD COLUMN "errorCode" TEXT;
