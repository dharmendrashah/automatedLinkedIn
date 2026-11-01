-- The owner dismissed the alert about a failed run (.plan/workflow-engine-p4-lifecycle.md).
ALTER TABLE "WorkflowRun" ADD COLUMN "alertDismissedAt" TIMESTAMP(3);
