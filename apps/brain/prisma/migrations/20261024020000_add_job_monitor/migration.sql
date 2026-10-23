-- CreateEnum
CREATE TYPE "JobRunOutcome" AS ENUM ('WORKED', 'IDLE', 'FAILED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "JobItemResult" AS ENUM ('ASKED', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "JobDefinition" (
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "everyMs" INTEGER NOT NULL,
    "timeoutMs" INTEGER NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobDefinition_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "outcome" "JobRunOutcome" NOT NULL,
    "summary" TEXT,
    "counts" JSONB,
    "error" TEXT,
    "instance" TEXT NOT NULL,
    "build" TEXT NOT NULL,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRunItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT,
    "accountId" TEXT,
    "action" TEXT NOT NULL,
    "result" "JobItemResult" NOT NULL,
    "reason" TEXT,
    "sessionId" TEXT,

    CONSTRAINT "JobRunItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobRun_job_startedAt_idx" ON "JobRun"("job", "startedAt");

-- CreateIndex
CREATE INDEX "JobRun_startedAt_idx" ON "JobRun"("startedAt");

-- CreateIndex
CREATE INDEX "JobRunItem_runId_idx" ON "JobRunItem"("runId");

-- AddForeignKey
ALTER TABLE "JobRunItem" ADD CONSTRAINT "JobRunItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "JobRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- There is exactly one platform owner (.plan/cron-monitor.md); Prisma cannot express a partial index, so it lives here only.
CREATE UNIQUE INDEX "User_single_admin" ON "User"("role") WHERE "role" = 'ADMIN';
