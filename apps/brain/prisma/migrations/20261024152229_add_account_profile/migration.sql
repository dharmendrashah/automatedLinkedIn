-- AlterTable
ALTER TABLE "LinkedInAccount" ADD COLUMN     "profileAskedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProfileImport" (
    "sessionId" TEXT NOT NULL,
    "status" "MessageImportStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedAt" TIMESTAMP(3),

    CONSTRAINT "ProfileImport_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "LinkedInAccountProfile" (
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT NOT NULL,

    CONSTRAINT "LinkedInAccountProfile_pkey" PRIMARY KEY ("accountId")
);

-- CreateIndex
CREATE INDEX "ProfileImport_status_nextAttemptAt_idx" ON "ProfileImport"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "LinkedInAccountProfile_userId_idx" ON "LinkedInAccountProfile"("userId");

-- AddForeignKey
ALTER TABLE "ProfileImport" ADD CONSTRAINT "ProfileImport_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SpiderSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedInAccountProfile" ADD CONSTRAINT "LinkedInAccountProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LinkedInAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedInAccountProfile" ADD CONSTRAINT "LinkedInAccountProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
