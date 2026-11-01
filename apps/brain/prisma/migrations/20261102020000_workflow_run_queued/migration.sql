-- A start while a run of the workflow is live waits its turn (.plan/workflow-engine-p4-lifecycle.md).
-- Only the value is added here: it cannot be used in the transaction that adds it.
ALTER TYPE "WorkflowRunStatus" ADD VALUE 'QUEUED';
