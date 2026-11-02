-- The enum value alone: a new value cannot be used in the transaction that adds it.
-- AlterEnum
ALTER TYPE "WorkflowTrigger" ADD VALUE 'EVENT';
