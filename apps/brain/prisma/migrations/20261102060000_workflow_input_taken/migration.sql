-- CreateTable
CREATE TABLE "WorkflowInputTaken" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowInputTaken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowInputTaken_createdAt_idx" ON "WorkflowInputTaken"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowInputTaken_workflowId_kind_slug_key" ON "WorkflowInputTaken"("workflowId", "kind", "slug");

-- AddForeignKey
ALTER TABLE "WorkflowInputTaken" ADD CONSTRAINT "WorkflowInputTaken_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
