-- CreateEnum
CREATE TYPE "LinkedInConnectionStatus" AS ENUM ('CONNECTED', 'REMOVING', 'REMOVED', 'GONE', 'UNKNOWN', 'FAILED');

-- AlterTable
ALTER TABLE "LinkedInAccount" ADD COLUMN     "connectionsReadAt" TIMESTAMP(3),
ADD COLUMN     "connectionsTotal" INTEGER;

-- CreateTable
CREATE TABLE "LinkedInConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "connectedOn" TIMESTAMP(3),
    "photoUrl" TEXT,
    "messageUrn" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "LinkedInConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "sessionId" TEXT,
    "failure" TEXT,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "goneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkedInConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectionImport" (
    "sessionId" TEXT NOT NULL,
    "status" "MessageImportStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedAt" TIMESTAMP(3),

    CONSTRAINT "ConnectionImport_pkey" PRIMARY KEY ("sessionId")
);

-- CreateIndex
CREATE INDEX "LinkedInConnection_accountId_status_idx" ON "LinkedInConnection"("accountId", "status");

-- CreateIndex
CREATE INDEX "LinkedInConnection_sessionId_idx" ON "LinkedInConnection"("sessionId");

-- CreateIndex
CREATE INDEX "LinkedInConnection_status_startedAt_idx" ON "LinkedInConnection"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInConnection_accountId_slug_key" ON "LinkedInConnection"("accountId", "slug");

-- CreateIndex
CREATE INDEX "ConnectionImport_status_nextAttemptAt_idx" ON "ConnectionImport"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "LinkedInConnection" ADD CONSTRAINT "LinkedInConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedInConnection" ADD CONSTRAINT "LinkedInConnection_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LinkedInAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedInConnection" ADD CONSTRAINT "LinkedInConnection_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SpiderSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectionImport" ADD CONSTRAINT "ConnectionImport_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SpiderSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
