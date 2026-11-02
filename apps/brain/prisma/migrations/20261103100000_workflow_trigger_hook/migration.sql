-- A new enum value cannot be used in the transaction that adds it, so it is added alone (.plan/workflow-events-and-hooks.md).
ALTER TYPE "WorkflowTrigger" ADD VALUE 'HOOK';
