-- CreateTable
CREATE TABLE "TaskDispatch" (
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedUntil" TIMESTAMP(3),
    "giveUpFailures" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "TaskDispatch_pkey" PRIMARY KEY ("sessionId")
);

-- CreateIndex
CREATE INDEX "TaskDispatch_nextAttemptAt_idx" ON "TaskDispatch"("nextAttemptAt");

-- AddForeignKey
ALTER TABLE "TaskDispatch" ADD CONSTRAINT "TaskDispatch_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SpiderSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
