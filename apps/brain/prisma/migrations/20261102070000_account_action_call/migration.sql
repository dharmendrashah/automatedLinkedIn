-- CreateTable
CREATE TABLE "AccountActionCall" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "result" JSONB,
    "tries" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountActionCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountActionCall_runId_nodeId_idx" ON "AccountActionCall"("runId", "nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountActionCall_runId_nodeId_slug_accountId_key" ON "AccountActionCall"("runId", "nodeId", "slug", "accountId");

-- AddForeignKey
ALTER TABLE "AccountActionCall" ADD CONSTRAINT "AccountActionCall_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
