-- CreateEnum
CREATE TYPE "LinkedInInvitationStatus" AS ENUM ('PENDING', 'QUEUED', 'ACCEPTED', 'IGNORED', 'GONE', 'FAILED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LinkedInInvitationAction" AS ENUM ('ACCEPT', 'IGNORE');

-- AlterTable
ALTER TABLE "LinkedInAccount" ADD COLUMN     "invitationsReadAt" TIMESTAMP(3),
ADD COLUMN     "invitationsTotal" INTEGER;

-- CreateTable
CREATE TABLE "LinkedInInvitation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "linkedInId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "mutual" TEXT,
    "note" TEXT,
    "photoUrl" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "LinkedInInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "action" "LinkedInInvitationAction",
    "sessionId" TEXT,
    "failure" TEXT,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "goneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkedInInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvitationImport" (
    "sessionId" TEXT NOT NULL,
    "status" "MessageImportStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedAt" TIMESTAMP(3),

    CONSTRAINT "InvitationImport_pkey" PRIMARY KEY ("sessionId")
);

-- CreateIndex
CREATE INDEX "LinkedInInvitation_accountId_status_idx" ON "LinkedInInvitation"("accountId", "status");

-- CreateIndex
CREATE INDEX "LinkedInInvitation_sessionId_idx" ON "LinkedInInvitation"("sessionId");

-- CreateIndex
CREATE INDEX "LinkedInInvitation_status_startedAt_idx" ON "LinkedInInvitation"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInInvitation_accountId_linkedInId_key" ON "LinkedInInvitation"("accountId", "linkedInId");

-- CreateIndex
CREATE INDEX "InvitationImport_status_nextAttemptAt_idx" ON "InvitationImport"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "LinkedInInvitation" ADD CONSTRAINT "LinkedInInvitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedInInvitation" ADD CONSTRAINT "LinkedInInvitation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LinkedInAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedInInvitation" ADD CONSTRAINT "LinkedInInvitation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SpiderSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationImport" ADD CONSTRAINT "InvitationImport_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SpiderSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
