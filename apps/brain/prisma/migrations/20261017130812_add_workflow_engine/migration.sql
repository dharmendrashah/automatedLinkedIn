-- CreateEnum
CREATE TYPE "WorkflowTrigger" AS ENUM ('MANUAL', 'SCHEDULE', 'PREVIEW');

-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "WorkflowStepStatus" AS ENUM ('WAITING', 'RUNNING', 'DONE', 'PARTIAL', 'FAILED');

-- AlterTable
ALTER TABLE "WorkflowListMember" ADD COLUMN     "addedByRunId" TEXT,
ADD COLUMN     "score" INTEGER,
ADD COLUMN     "signals" JSONB;

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT,
    "graph" JSONB NOT NULL,
    "outputListId" TEXT NOT NULL,
    "qualifyScore" INTEGER NOT NULL DEFAULT 60,
    "maybeScore" INTEGER NOT NULL DEFAULT 40,
    "maybeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trigger" "WorkflowTrigger" NOT NULL,
    "runKey" TEXT NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'RUNNING',
    "graph" JSONB NOT NULL,
    "qualifyScore" INTEGER NOT NULL,
    "maybeScore" INTEGER NOT NULL,
    "maybeEnabled" BOOLEAN NOT NULL,
    "estimateMicros" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "qualified" INTEGER NOT NULL DEFAULT 0,
    "maybe" INTEGER NOT NULL DEFAULT 0,
    "discarded" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStepRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "WorkflowStepStatus" NOT NULL DEFAULT 'WAITING',
    "itemsIn" INTEGER NOT NULL DEFAULT 0,
    "itemsOut" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "claimedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowStepRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStepCall" (
    "id" TEXT NOT NULL,
    "stepRunId" TEXT NOT NULL,
    "inputKey" TEXT NOT NULL,
    "jobId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'STARTED',
    "rows" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowStepCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpendLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workflowId" TEXT,
    "runId" TEXT,
    "callId" TEXT NOT NULL,
    "amountMicros" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpendLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataWallet" (
    "id" TEXT NOT NULL,
    "balanceMicros" INTEGER NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataWallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workflow_enabled_nextRunAt_idx" ON "Workflow"("enabled", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_userId_name_key" ON "Workflow"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRun_runKey_key" ON "WorkflowRun"("runKey");

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowId_startedAt_idx" ON "WorkflowRun"("workflowId", "startedAt");

-- CreateIndex
CREATE INDEX "WorkflowRun_status_idx" ON "WorkflowRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStepRun_runId_nodeId_key" ON "WorkflowStepRun"("runId", "nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStepCall_stepRunId_inputKey_key" ON "WorkflowStepCall"("stepRunId", "inputKey");

-- CreateIndex
CREATE INDEX "WorkflowItem_createdAt_idx" ON "WorkflowItem"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowItem_runId_nodeId_slug_key" ON "WorkflowItem"("runId", "nodeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "SpendLedger_callId_key" ON "SpendLedger"("callId");

-- CreateIndex
CREATE INDEX "SpendLedger_userId_month_idx" ON "SpendLedger"("userId", "month");

-- CreateIndex
CREATE INDEX "SpendLedger_month_idx" ON "SpendLedger"("month");

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_outputListId_fkey" FOREIGN KEY ("outputListId") REFERENCES "WorkflowList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStepRun" ADD CONSTRAINT "WorkflowStepRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStepCall" ADD CONSTRAINT "WorkflowStepCall_stepRunId_fkey" FOREIGN KEY ("stepRunId") REFERENCES "WorkflowStepRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowItem" ADD CONSTRAINT "WorkflowItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
