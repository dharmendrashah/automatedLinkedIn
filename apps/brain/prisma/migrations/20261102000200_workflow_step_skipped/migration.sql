-- A step that never started because the run was stopped, or another block failed, first (.plan/workflow-engine-p0-safety.md).
-- Only the value is added here: it cannot be used in the transaction that adds it.
ALTER TYPE "WorkflowStepStatus" ADD VALUE 'SKIPPED';
