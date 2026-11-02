-- AlterTable
ALTER TABLE "LinkedInInvite" ADD COLUMN     "noteSent" BOOLEAN,
ADD COLUMN     "originNodeId" TEXT,
ADD COLUMN     "originRunId" TEXT,
ADD COLUMN     "originWorkflowId" TEXT;

-- AlterTable
ALTER TABLE "SpiderSession" ADD COLUMN     "origin" JSONB,
ADD COLUMN     "runStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TaskEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),
    "claimedUntil" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowListener" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "task" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "WorkflowListener_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "taskEventId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "targets" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "runId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "retryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskEvent_dispatchedAt_readyAt_idx" ON "TaskEvent"("dispatchedAt", "readyAt");

-- CreateIndex
CREATE INDEX "TaskEvent_userId_at_idx" ON "TaskEvent"("userId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "TaskEvent_sessionId_phase_key" ON "TaskEvent"("sessionId", "phase");

-- CreateIndex
CREATE INDEX "WorkflowListener_userId_phase_task_idx" ON "WorkflowListener"("userId", "phase", "task");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowListener_workflowId_nodeId_key" ON "WorkflowListener"("workflowId", "nodeId");

-- CreateIndex
CREATE INDEX "WorkflowDelivery_status_retryAt_idx" ON "WorkflowDelivery"("status", "retryAt");

-- CreateIndex
CREATE INDEX "WorkflowDelivery_userId_workflowId_createdAt_idx" ON "WorkflowDelivery"("userId", "workflowId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDelivery_taskEventId_workflowId_key" ON "WorkflowDelivery"("taskEventId", "workflowId");

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SpiderSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowListener" ADD CONSTRAINT "WorkflowListener_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowDelivery" ADD CONSTRAINT "WorkflowDelivery_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowDelivery" ADD CONSTRAINT "WorkflowDelivery_taskEventId_fkey" FOREIGN KEY ("taskEventId") REFERENCES "TaskEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
