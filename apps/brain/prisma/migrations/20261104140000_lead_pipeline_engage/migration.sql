-- Reactions and comments on people's posts (.plan/lead-pipeline-p3-engage.md): the act queue, the import of a finished run, the platform
-- switches and the person's last engaged time. Additive; no data changes.

-- CreateEnum
CREATE TYPE "PostActKind" AS ENUM ('REACT', 'COMMENT');

-- CreateEnum
CREATE TYPE "PostActState" AS ENUM ('QUEUED', 'SENDING', 'DONE', 'FAILED', 'UNKNOWN', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "LinkedInAccount" ADD COLUMN     "engageStopReason" TEXT,
ADD COLUMN     "engageStopUntil" TIMESTAMP(3),
ADD COLUMN     "engageStoppedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "lastEngagedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PostAct" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "postKey" TEXT NOT NULL,
    "postUrl" TEXT NOT NULL,
    "authorName" TEXT,
    "authorHeadline" TEXT,
    "excerpt" TEXT,
    "postedAt" TIMESTAMP(3),
    "act" "PostActKind" NOT NULL,
    "reaction" TEXT,
    "words" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'TEMPLATE',
    "state" "PostActState" NOT NULL DEFAULT 'QUEUED',
    "reason" TEXT,
    "plannedAt" TIMESTAMP(3) NOT NULL,
    "waitReason" TEXT,
    "waitUntil" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "sessionId" TEXT,
    "originWorkflowId" TEXT,
    "originRunId" TEXT,
    "originNodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostAct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngageImport" (
    "sessionId" TEXT NOT NULL,
    "status" "MessageImportStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedAt" TIMESTAMP(3),

    CONSTRAINT "EngageImport_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "changedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "PostAct_accountId_state_plannedAt_idx" ON "PostAct"("accountId", "state", "plannedAt");

-- CreateIndex
CREATE INDEX "PostAct_accountId_startedAt_idx" ON "PostAct"("accountId", "startedAt");

-- CreateIndex
CREATE INDEX "PostAct_userId_slug_idx" ON "PostAct"("userId", "slug");

-- CreateIndex
CREATE INDEX "PostAct_sessionId_idx" ON "PostAct"("sessionId");

-- CreateIndex
CREATE INDEX "PostAct_state_startedAt_idx" ON "PostAct"("state", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostAct_userId_postKey_act_key" ON "PostAct"("userId", "postKey", "act");

-- CreateIndex
CREATE INDEX "EngageImport_status_nextAttemptAt_idx" ON "EngageImport"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "Person_userId_lastEngagedAt_idx" ON "Person"("userId", "lastEngagedAt");

-- AddForeignKey
ALTER TABLE "PostAct" ADD CONSTRAINT "PostAct_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostAct" ADD CONSTRAINT "PostAct_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LinkedInAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngageImport" ADD CONSTRAINT "EngageImport_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SpiderSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- My network sees every change of an act (people_index_by_owner_slug is from add_network_hub), so Person.lastEngagedAt follows.
CREATE TRIGGER people_index AFTER INSERT OR UPDATE OF "state" OR DELETE ON "PostAct" FOR EACH ROW EXECUTE FUNCTION people_index_by_owner_slug();
