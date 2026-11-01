-- One run of a workflow going at a time (.plan/workflow-engine-p0-safety.md). Runs that were already doubled end first,
-- the newest of each workflow stays.
UPDATE "WorkflowRun" AS older
SET
  "status" = 'STOPPED',
  "finishedAt" = now(),
  "message" = 'Ended because another run of this workflow was already going.'
WHERE older."status" = 'RUNNING'
  AND EXISTS (
    SELECT 1
    FROM "WorkflowRun" AS newer
    WHERE newer."workflowId" = older."workflowId"
      AND newer."status" = 'RUNNING'
      AND (newer."startedAt", newer."id") > (older."startedAt", older."id")
  );

CREATE UNIQUE INDEX "WorkflowRun_workflowId_running_key" ON "WorkflowRun"("workflowId") WHERE "status" = 'RUNNING';
