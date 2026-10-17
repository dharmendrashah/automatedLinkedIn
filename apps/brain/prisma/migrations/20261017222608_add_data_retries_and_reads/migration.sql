-- CreateEnum
CREATE TYPE "DataReadKind" AS ENUM ('PROFILE', 'COMPANY', 'POST', 'COMMENTS', 'REACTIONS');

-- CreateEnum
CREATE TYPE "DataReadStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "WorkflowStepCall" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "retryAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DataRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "DataReadKind" NOT NULL,
    "slug" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT '',
    "operation" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "status" "DataReadStatus" NOT NULL DEFAULT 'QUEUED',
    "activeKey" TEXT,
    "jobId" TEXT,
    "sentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "retryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "DataRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DataRead_activeKey_key" ON "DataRead"("activeKey");

-- CreateIndex
CREATE INDEX "DataRead_status_retryAt_idx" ON "DataRead"("status", "retryAt");

-- CreateIndex
CREATE INDEX "DataRead_userId_kind_slug_idx" ON "DataRead"("userId", "kind", "slug");

-- AddForeignKey
ALTER TABLE "DataRead" ADD CONSTRAINT "DataRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A request started before this change without a saved job id is looked up, never sent again.
UPDATE "WorkflowStepCall" SET "sentAt" = "createdAt" WHERE "finishedAt" IS NULL AND "jobId" IS NULL;
