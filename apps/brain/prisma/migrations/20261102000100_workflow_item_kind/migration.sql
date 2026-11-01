-- The kind is part of an item's identity in a block's output: a person and a company may share a slug
-- (.plan/workflow-engine-p0-safety.md). Items are at most 14 days old; the kind is read from the stored item.
ALTER TABLE "WorkflowItem" ADD COLUMN "kind" TEXT;

UPDATE "WorkflowItem" SET "kind" = COALESCE("data"->>'kind', 'profile');

ALTER TABLE "WorkflowItem" ALTER COLUMN "kind" SET NOT NULL;

DROP INDEX "WorkflowItem_runId_nodeId_round_slug_key";

CREATE UNIQUE INDEX "WorkflowItem_runId_nodeId_round_kind_slug_key" ON "WorkflowItem"("runId", "nodeId", "round", "kind", "slug");
