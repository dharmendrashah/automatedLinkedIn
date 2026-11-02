-- CreateTable
CREATE TABLE "WorkflowEventClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowEventClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowEventClaim_createdAt_idx" ON "WorkflowEventClaim"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowEventClaim_userId_key_key" ON "WorkflowEventClaim"("userId", "key");
