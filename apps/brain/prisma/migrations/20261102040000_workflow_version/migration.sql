-- Saved versions of a workflow's graph, so an older one can be restored (.plan/workflow-engine-p5-editor.md).
-- Each workflow starts with one version, its graph now.
CREATE TABLE "WorkflowVersion" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "graph" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkflowVersion_workflowId_createdAt_idx" ON "WorkflowVersion"("workflowId", "createdAt");

ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "WorkflowVersion" ("id", "workflowId", "graph", "createdAt")
SELECT gen_random_uuid()::text, "id", "graph", CURRENT_TIMESTAMP FROM "Workflow";
